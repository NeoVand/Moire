#!/usr/bin/env node
// Independent CPU image analysis. No analytic kernel or renderer is imported.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { gaussianOffsets, integratePixel } from '../../tests/compare/reference.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARMS = ['raw', 'tsr', 'analytic'];
const DARK = .025, LIGHT = .82, SKY = [.105, .13, .16];
const srgb = v => v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055;
const inverseSrgb = v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = value => path.relative(ROOT, value);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const omit = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
const displayCodesAt = (image, x, y) => {
  const scale=image.data.BYTES_PER_ELEMENT===2?255/65535:1;
  return Array.from(image.data.subarray(4*(y*image.width+x),4*(y*image.width+x)+3),v=>v*scale);
};
const SRGB = {name:'standard-sRGB',encode:srgb,decode:inverseSrgb};
const paletteFor = transfer => [[DARK, DARK, DARK], [LIGHT, LIGHT, LIGHT], SKY].map(rgb => rgb.map(v => 255*transfer.encode(v)));

export function calibrateRawPalette(image, transfer=SRGB) {
  const palette = paletteFor(transfer);
  let outside = 0, worstRounded = 0, worstUnrounded = 0;
  const firstFailures = [];
  const classes = [0, 0, 0];
  for (let y=0; y<image.height; y++) for (let x=0; x<image.width; x++) {
    const rgb = displayCodesAt(image, x, y);
    const errors = palette.map(p => Math.max(...p.map((v, i) => Math.abs(rgb[i]-Math.round(v)))));
    const error = Math.min(...errors);
    const nearest = errors.indexOf(error);
    const unrounded = Math.max(...palette[nearest].map((v, i) => Math.abs(rgb[i]-v)));
    classes[nearest]++;
    worstRounded = Math.max(worstRounded, error);
    worstUnrounded = Math.max(worstUnrounded, unrounded);
    if (error > 1) { outside++; if (firstFailures.length < 8) firstFailures.push({x, y, displayCodes: rgb, roundedByteError: error}); }
  }
  return { passed: outside === 0, method: `${transfer.name}; each raw pixel must be within one integer code of a rounded source-palette color on the normalized 0–255 display scale. Native sample precision is retained when supplied. No transfer curve or parameter is fitted.`, pixels: image.width*image.height, pixelsOutsideOneCodeOfRoundedPalette: outside, worstRoundedByteError: worstRounded, worstUnroundedByteError: worstUnrounded, nearestPaletteClassCounts: {dark:classes[0], light:classes[1], sky:classes[2]}, expectedUnroundedDisplayBytes: palette, firstFailures };
}

export function resolveTransfer(reports) {
  const c=reports[0].contract;
  if(c.readback_transfer==='power-gamma') {
    const gamma=c.display_gamma;
    if(!Number.isFinite(gamma)||gamma<=0)return {...SRGB,supported:false,definition:'Invalid power-gamma metadata; sRGB diagnostics only and quantitative scores withheld.'};
    const stageSupported=r=>r.contract.readback_stage==='SceneColorAfterTonemapping'||
      (r.contract.readback_stage==='game viewport backbuffer after gamma-only tonemapper'&&
       r.contract.real_window===true&&!r.argv.includes('-RenderOffScreen')&&
       (r.argv.includes('-MovieFormat=PNG')||
        (r.contract.ordinary_shot===true&&r.shot_record?.capture_route==='ordinary Shot'&&r.shot_record.status==='captured')));
    const supported=Number.isFinite(gamma)&&gamma>0&&reports.every(r=>
      r.contract.readback_transfer==='power-gamma'&&r.contract.display_gamma===gamma&&
      stageSupported(r)&&
      r.argv.some(arg=>arg.startsWith('-ExecCmds=')&&arg.slice(10).split(',').map(v=>v.trim()).includes(`gamma ${gamma}`)));
    return {name:`documented-power-gamma-${gamma}`,gamma,supported,
      encode:v=>v**(1/gamma),decode:v=>v**gamma,
      definition:'PostProcessTonemap.usf gamma-only path: pow(linear, 1/displayGamma). PostProcessTonemap.cpp obtains displayGamma from RenderTarget. Capture must force gamma in ExecCmds and declare an after-tonemapping dump or real-window PNG backbuffer route. Raw anchors must still validate the resulting readback.',
      sourceReferences:['Engine/Shaders/Private/PostProcessTonemap.usf:506','Engine/Source/Runtime/Renderer/Private/PostProcess/PostProcessTonemap.cpp:280','Engine/Source/Runtime/Renderer/Private/PostProcess/PostProcessVisualizeBuffer.cpp:259']};
  }
  return {...SRGB,supported:reports.every(r=>r.contract.readback_transfer==='srgb'),
    definition:c.readback_transfer==='srgb'?'Capture declares standard sRGB; palette anchors must validate it.':'Unknown transfer metadata: sRGB tested as a diagnostic candidate only. Quantitative scores remain withheld.'};
}

export function cameraSource(pose, width, height) {
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const normalize = a => { const n=Math.hypot(...a); return a.map(v=>v/n); };
  const eye = pose.three_eye;
  const forward = normalize(pose.three_target.map((v,i)=>v-eye[i]));
  const right = normalize(cross(forward,[0,1,0]));
  const up = cross(right,forward);
  const tanX = Math.tan(pose.horizontal_fov_degrees*Math.PI/360), tanY = tanX*height/width;
  const dx = right.map(v=>2*tanX*v/width), dy = up.map(v=>-2*tanY*v/height);
  const c = forward.map((v,i)=>v-right[i]*tanX+up[i]*tanY);
  const denominatorSlope = Math.hypot(dx[1],dy[1]);
  function ground(x,y) {
    const ray = c.map((v,i)=>v+dx[i]*x+dy[i]*y);
    if (ray[1]>=0) return null;
    const t=-eye[1]/ray[1], gx=eye[0]+t*ray[0], gz=eye[2]+t*ray[2];
    if(Math.max(Math.abs(gx),Math.abs(gz))>=50000) return null;
    return [gx/pose.period_world,gz/pose.period_world];
  }
  function ink(x,y) {
    const q=ground(x,y); if(q===null)return null;
    return (q[0]-Math.floor(q[0])>=.5)===(q[1]-Math.floor(q[1])>=.5)?1:0;
  }
  return {ground,ink,horizonDistance:(x,y)=>-(c[1]+dx[1]*x+dy[1]*y)/denominatorSlope};
}

function resolvePose(records, explicitTime) {
  const base = records.raw.report.prepared_scene.camera_pose;
  const actualTimes = ARMS.map(arm=>records[arm].report.contract.sample_time_seconds).filter(t=>t!==undefined);
  assert.ok(actualTimes.every(t=>Number.isFinite(t)), 'Invalid capture time metadata.');
  assert.ok(actualTimes.every(t=>t===actualTimes[0]), 'Capture sample times differ.');
  if(explicitTime!==undefined && actualTimes.length) assert.equal(explicitTime,actualTimes[0],'Explicit time conflicts with recorded sample time.');
  const time=explicitTime??actualTimes[0]??base.time??0;
  const actualPoses=ARMS.map(arm=>records[arm].report.sample_camera_pose??records[arm].report.contract.sample_camera_pose);
  if(actualPoses.some(Boolean)) {
    assert.ok(actualPoses.every(Boolean),'Only some captures have observed sample-camera metadata.');
    assert.ok(actualPoses.every(p=>same(p,actualPoses[0])),'Observed sample-camera poses differ.');
    return {pose:actualPoses[0],time,source:'recorded sample_camera_pose'};
  }
  if(time===base.time) return {pose:base,time,source:'prepared fixed-camera metadata at its recorded time'};
  const motion=records.raw.report.contract.camera_motion??base.motion;
  assert.ok(['glide','approach'].includes(motion),'Cannot reconstruct an unknown camera motion.');
  const x=motion==='glide'?Math.sin(time*.28)*6:0;
  const z=motion==='approach'?28-Math.sin(time*.22)*12:28;
  return {pose:{...base,motion,time,three_eye:[x,12,z],three_target:[x*.45,0,z-50]},time,source:'known scene motion reconstructed at explicit/recorded sample time; transform was not read back'};
}

export function main(argv=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<argv.length;i+=2) {
    const key=argv[i].replace(/^--/,'');
    assert.ok([...ARMS,'time','out'].includes(key)&&argv[i+1]!==undefined,'Use --raw report.json --tsr report.json --analytic report.json [--time seconds] [--out new-directory].');
    options[key]=key==='time'?Number(argv[i+1]):path.resolve(argv[i+1]);
  }
  assert.ok(ARMS.every(arm=>options[arm]),'All three explicit capture reports are required.');
  if(options.time!==undefined)assert.ok(Number.isFinite(options.time)&&options.time>=0,'--time must be nonnegative finite seconds.');
  const stamp=new Date().toISOString();
  const out=options.out??path.join(ROOT,'native/evidence','game-quality-'+stamp.replaceAll(/[-:.]/g,''));
  assert.ok(!fs.existsSync(out),'Refusing to overwrite existing evidence.');
  const records={}, checks=[], warnings=[];
  const check=(name,passed,detail)=>{checks.push({name,passed,...(detail?{detail}:{})});if(!passed)warnings.push(name);};
  for(const arm of ARMS) {
    const reportPath=options[arm], r=readJson(reportPath);
    assert.equal(r.contract.arm,arm,`${arm}: wrong arm report`);
    assert.equal(r.artifacts.length,1,`${arm}: expected one capture`);
    const artifact=r.artifacts[0], imagePath=path.join(path.dirname(reportPath),'frames',path.basename(artifact.path));
    const bytes=fs.readFileSync(imagePath), image=PNG.sync.read(bytes,{skipRescale:true});
    assert.equal(sha(bytes),artifact.sha256,`${arm}: PNG hash mismatch`);
    assert.deepEqual([image.width,image.height],artifact.size);
    assert.deepEqual(artifact.size,[640,360],'Current fixed pixel family requires 640 by 360.');
    assert.ok([8,16].includes(image.depth),'Only 8-bit and 16-bit PNG are supported.');
    assert.equal(image.data.BYTES_PER_ELEMENT,image.depth/8,'PNG sample precision was unexpectedly rescaled.');
    check(`${arm}: process and frame valid`,r.exit_code===0&&r.frame_files_valid===true&&r.failures.length===0&&(r.handled_ensures?.length??0)===0);
    check(`${arm}: sources stable`,r.source_hashes_stable===true&&same(r.source_hashes,r.source_hashes_after));
    check(`${arm}: ordinary game view`,r.contract.new_view_family===false&&r.contract.mrq===false&&r.contract.highres_screenshot===false);
    check(`${arm}: output frame matches contract`,artifact.sequence_frame===r.contract.output_sequence_frame);
    const archive=path.join(path.dirname(reportPath),'preparation.json');
    const preparationArchived=fs.existsSync(archive);
    if(preparationArchived)check(`${arm}: archived preparation hash`,sha(fs.readFileSync(archive))===r.preparation_sha256);
    const expected={'r.AntiAliasingMethod':arm==='tsr'?4:0,'r.ScreenPercentage':100,'r.SecondaryScreenPercentage.GameViewport':100,'r.DynamicRes.OperationMode':0,'r.TSR.History.ScreenPercentage':200};
    for(const [name,value] of Object.entries(expected))check(`${arm}: ${name}=${value}`,r.requested_cvars[name]===value&&r.console_setting_lines.some(line=>line.includes(`${name} = "${value}"`)));
    records[arm]={reportPath,report:r,imagePath,image,preparationArchived,archive};
  }
  const base=records.raw.report;
  const common=Object.fromEntries(Object.entries(base.source_hashes).filter(([name])=>ARMS.every(arm=>name in records[arm].report.source_hashes)));
  check('Shared source set present',Object.keys(common).length>=9);
  for(const arm of ARMS) {
    const r=records[arm].report;
    check(`${arm}: engine match`,same(r.engine_build,base.engine_build));
    check(`${arm}: shared source hashes match`,Object.entries(common).every(([name,hash])=>r.source_hashes[name]===hash));
    check(`${arm}: source-camera metadata match`,same(r.prepared_scene.camera_pose,base.prepared_scene.camera_pose));
    check(`${arm}: common settings match`,same(omit(r.requested_cvars,'r.AntiAliasingMethod'),omit(base.requested_cvars,'r.AntiAliasingMethod')));
    check(`${arm}: common capture contract match`,same(omit(r.contract,'arm'),omit(base.contract,'arm')));
    check(`${arm}: capture frame match`,r.contract.output_sequence_frame===base.contract.output_sequence_frame);
    check(`${arm}: preparation match`,r.preparation_sha256===base.preparation_sha256);
  }
  for(const name of ['map','sequence','map_sha256','sequence_sha256'])check(`Raw/TSR ${name} match`,records.tsr.report.prepared_scene[name]===base.prepared_scene[name]);
  const resolved=resolvePose(records,options.time), source=cameraSource(resolved.pose,640,360);
  const expectedLocation=[-100*resolved.pose.three_eye[2],100*resolved.pose.three_eye[0],100*resolved.pose.three_eye[1]];
  const look=resolved.pose.three_target.map((v,i)=>v-resolved.pose.three_eye[i]);
  const expectedRotation=[0,Math.atan2(look[1],Math.hypot(look[0],look[2]))*180/Math.PI,Math.atan2(look[0],-look[2])*180/Math.PI];
  for(const arm of ARMS)if(records[arm].report.contract.ordinary_shot) {
    const s=records[arm].report.shot_record;
    check(`${arm}: ordinary Shot completed`,s?.status==='captured'&&s.high_resolution_screenshot===false);
    check(`${arm}: observed Shot camera location`,s?.camera_location?.length===3&&s.camera_location.every((v,i)=>Math.abs(v-expectedLocation[i])<=.01),'Tolerance 0.01 cm against original scene camera.');
    check(`${arm}: observed Shot camera rotation`,s?.camera_rotation?.length===3&&s.camera_rotation.every((v,i)=>Math.abs(((v-expectedRotation[i]+540)%360)-180)<=1e-4),'Tolerance 0.0001 degrees; Shot record order is roll,pitch,yaw.');
    check(`${arm}: observed Shot camera FOV`,Number.isFinite(s?.camera_fov)&&Math.abs(s.camera_fov-resolved.pose.horizontal_fov_degrees)<=1e-4);
    if(records[arm].report.contract.capture_after_paused_motion_history) {
      const at=s.camera_at_completion;
      check(`${arm}: paused motion readback disclosed`,s.paused_for_shot===true&&s.extra_stationary_readback_frame===true&&s.continuous_playback_between_start_and_target===true&&s.history_reset_during_final_seek===false);
      check(`${arm}: completion camera unchanged`,at&&same(at.camera_location,s.camera_location)&&same(at.camera_rotation,s.camera_rotation)&&at.camera_fov===s.camera_fov);
      for(const name of ['sequence_at_request','sequence_at_completion']) {
        const q=s[name],rate=q?.rate_numerator/q?.rate_denominator;
        check(`${arm}: ${name} matches source time`,Number.isFinite(rate)&&rate>0&&Math.abs((q.frame+q.sub_frame)/rate-resolved.time)<=1e-6,'Tolerance one microsecond; sequence subframe preserved in Shot record.');
      }
    }
  }
  const transfer=resolveTransfer(ARMS.map(arm=>records[arm].report)),palette=paletteFor(transfer);
  check('Documented transfer definition supported',transfer.supported);
  const rawPalette=calibrateRawPalette(records.raw.image,transfer);
  check('Raw palette validates selected transfer',rawPalette.passed);
  const sky=[];
  for(const y of [7,27,51])for(const x of [41,137,251,388,502,599]) {
    if(source.horizonDistance(x+.5,y+.5)>-3||source.ink(x+.5,y+.5)!==null)continue;
    const arms={};
    for(const arm of ARMS){const codes=displayCodesAt(records[arm].image,x,y);arms[arm]={displayCodes:codes,roundedByteError:Math.max(...codes.map((v,i)=>Math.abs(v-Math.round(palette[2][i]))))};}
    sky.push({x,y,arms});
  }
  check('Sky transfer anchors present',sky.length>0);
  for(const arm of ARMS)check(`${arm}: sky transfer anchors`,sky.length>0&&sky.every(p=>p.arms[arm].roundedByteError<=1));
  const transferPassed=transfer.supported&&rawPalette.passed&&sky.length>0&&ARMS.every(arm=>sky.every(p=>p.arms[arm].roundedByteError<=1));
  const metadataPassed=checks.filter(c=>!c.name.includes('transfer')&&!c.name.includes('palette')).every(c=>c.passed);
  const canScore=transferPassed&&metadataPassed;
  const offsets=canScore?[gaussianOffsets(65536,.5,1701),gaussianOffsets(65536,.5,2909)]:null;
  const pixels=[],excluded=[];
  for(const y of [92,96,104,120,148,184,232,296,344])for(const x of [41,137,251,388,502,599]) {
    const cx=x+.5,cy=y+.5;
    if(source.horizonDistance(cx,cy)<=3||![-3,3].every(dx=>[-3,3].every(dy=>source.ground(cx+dx,cy+dy)!==null))){excluded.push({x,y,reason:'within six sigma of geometry/horizon or outside finite ground'});continue;}
    const point=source.ink(cx,cy),stable=[-.01,0,.01].every(dx=>[-.01,0,.01].every(dy=>source.ink(cx+dx,cy+dy)===point));
    const actual=Object.fromEntries(ARMS.map(arm=>[arm,{displayCodes:displayCodesAt(records[arm].image,x,y)}]));
    const rawPointError=Math.max(...actual.raw.displayCodes.map(v=>Math.abs(v-Math.round(255*transfer.encode(DARK+(LIGHT-DARK)*point)))));
    let reference=null;
    if(canScore) {
      let skySamples=0;
      const original=(px,py)=>{const ink=source.ink(px,py);if(ink===null){skySamples++;return SKY[0];}return DARK+(LIGHT-DARK)*ink;};
      const estimates=offsets.map(samples=>integratePixel(original,cx,cy,samples));
      assert.equal(skySamples,0,'Ground-only RGB reference encountered sampled sky.');
      const mean=(estimates[0]+estimates[1])/2;
      reference={linearRgb:[mean,mean,mean],estimates,sequenceDifferenceLinear:Math.abs(estimates[0]-estimates[1])};
      for(const arm of ARMS) {
        const rgb=actual[arm].displayCodes.map(v=>transfer.decode(v/255));
        const interval=actual[arm].displayCodes.map(v=>[transfer.decode(Math.max(0,v-1.5)/255),transfer.decode(Math.min(255,v+1.5)/255)]);
        Object.assign(actual[arm],{linearRgb:rgb,signedLinearError:rgb.map(v=>v-mean),displayAllowanceIntervalLinear:interval,signedErrorAfterDisplayAllowance:interval.map(([lo,hi])=>mean<lo?lo-mean:mean>hi?hi-mean:0)});
      }
    }
    pixels.push({x,y,center:[cx,cy],horizonDistancePixels:source.horizonDistance(cx,cy),rawPoint:{ink:point,stableWithinOffsetPixels:stable ? .01 : null,roundedByteError:rawPointError,phasePass:transferPassed&&stable?rawPointError<=1:null},reference,measured:actual});
  }
  const phase=pixels.filter(p=>p.rawPoint.phasePass!==null);
  const phaseFailures=phase.filter(p=>!p.rawPoint.phasePass);
  if(transferPassed)check('Raw phase matches independent source at stable fixtures',phase.length>0&&phaseFailures.length===0);
  // Registration needs a denser family than the AA-quality probes: a one-frame
  // motion offset can change only quality pixels excluded by their phase guard.
  // This family is fixed independently of image errors and never filters the
  // 54-point Gaussian quality family.
  const registration={family:'x=13..639 step17, y=93..359 step11; original-source horizon >3px; parity stable within +/-0.01px',checked:0,failures:[],tested:transferPassed};
  if(transferPassed)for(let y=93;y<360;y+=11)for(let x=13;x<640;x+=17) {
    const cx=x+.5,cy=y+.5,ink=source.ink(cx,cy);
    if(ink===null||source.horizonDistance(cx,cy)<=3||![-.01,0,.01].every(dx=>[-.01,0,.01].every(dy=>source.ink(cx+dx,cy+dy)===ink)))continue;
    registration.checked++;
    const expected=Math.round(255*transfer.encode(DARK+(LIGHT-DARK)*ink));
    const codes=displayCodesAt(records.raw.image,x,y);
    if(codes.some(v=>Math.abs(v-expected)>1))registration.failures.push({x,y,displayCodes:codes,expectedRoundedDisplayCode:expected});
  }
  if(transferPassed)check('Dense raw registration matches the declared camera time',registration.checked>0&&registration.failures.length===0);
  const summarize=arm=>{
    const errors=pixels.flatMap(p=>p.measured[arm].signedLinearError),residual=pixels.flatMap(p=>p.measured[arm].signedErrorAfterDisplayAllowance);
    const rmse=e=>Math.sqrt(e.reduce((s,v)=>s+v*v,0)/e.length);
    return {pixels:pixels.length,rmseLinearRgb:rmse(errors),maxAbsLinearRgb:Math.max(...errors.map(Math.abs)),rmseAfterDisplayAllowanceLinearRgb:rmse(residual),maxAbsAfterDisplayAllowanceLinearRgb:Math.max(...residual.map(Math.abs))};
  };
  const summary=canScore&&phaseFailures.length===0&&registration.failures.length===0&&pixels.length>0?Object.fromEntries(ARMS.map(arm=>[arm,summarize(arm)])):null;
  if(!summary)for(const p of pixels)for(const arm of ARMS) p.measured[arm]={displayCodes:p.measured[arm].displayCodes};
  const report={createdAt:stamp,status:summary?'measured-filter-specific-diagnostic':'quantitative-scores-withheld',performanceMeasurement:false,
    captureHistory:base.contract.capture_after_paused_motion_history?'Continuous playback to target, then paused for one additional stationary readback frame; not an uninterrupted motion capture.':'Fixed camera with warmed history; no convergence claim.',
    inputs:Object.fromEntries(ARMS.map(arm=>[arm,{report:relative(records[arm].reportPath),reportSha256:sha(fs.readFileSync(records[arm].reportPath)),image:relative(records[arm].imagePath),imageSha256:records[arm].report.artifacts[0].sha256,originalImageProvenance:records[arm].report.artifacts[0].path,pngBitDepth:records[arm].image.depth,storedSamplesPreserved:true,preparationSha256:records[arm].report.preparation_sha256,preparationArchiveVerified:records[arm].preparationArchived?checks.find(c=>c.name===`${arm}: archived preparation hash`).passed:false,contract:records[arm].report.contract,preparedScene:records[arm].report.prepared_scene,shotRecord:records[arm].report.shot_record??null,requestedCvars:records[arm].report.requested_cvars}])),
    checks,warnings,commonSourceHashes:common,camera:resolved,calibration:{transfer,passed:transferPassed,rawPalette,sky},phase:{checked:phase.length,failures:phaseFailures.map(p=>[p.x,p.y]),denseRegistration:registration},
    reference:{method:'independent original camera ray / finite ground intersection and exact checker parity',sigmaPixels:.5,samplesPerPixel:131072,seeds:[1701,2909],sequenceDifferenceIsBound:false,maximumSequenceDifferenceLinear:summary?Math.max(...pixels.map(p=>p.reference.sequenceDifferenceLinear)):null,family:'54 fixed pixels before geometry exclusions; no error-dependent selection',retainedPixels:pixels.length,excluded},summary,pixels,
    limitations:['A failed transfer or source-matching gate withholds linear quality scores. Three source colors can validate these calibration anchors but do not prove an arbitrary continuous display transform; no curve is fitted.', 'TSR uses its own reconstruction filter and history. The Gaussian target supplies a filter-specific diagnostic, not an overall winner.', 'Native 8-bit or 16-bit PNG samples are preserved. Calibration and the ±1.5-code allowance use an explicitly normalized 0–255 display scale, not one 16-bit PNG code. The allowance follows ±1 display code relative to rounded palette anchors; applying it to intermediate colors is not a certified transfer bound or pure shader error.', 'Capture uses the existing ordinary game view but this image analysis establishes no GPU/frame-time performance.', '64 warmup frames warm temporal history; convergence is not demonstrated.', 'Geometric horizon/finite-plane edges are excluded. Recorded preparation and shader hashes do not replace a measured native transform; raw phase checks independently test registration at retained stable samples.', 'Motion time is sourced from metadata or explicit --time; output frame number alone does not establish animation time for fixed-pose sequences.'],utilitySha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),referenceHelperSha256:sha(fs.readFileSync(path.join(ROOT,'tests/compare/reference.mjs')))};
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  const table=summary?'| Arm | Linear RGB RMSE | Maximum | RMSE after display allowance |\n| --- | ---: | ---: | ---: |\n'+ARMS.map(a=>`| ${a} | ${summary[a].rmseLinearRgb.toExponential(5)} | ${summary[a].maxAbsLinearRgb.toExponential(5)} | ${summary[a].rmseAfterDisplayAllowanceLinearRgb.toExponential(5)} |`).join('\n'):'Linear quality scores are withheld. The source/settings or documented-transfer calibration gate did not pass; no unknown gamma curve is fitted.';
  fs.writeFileSync(path.join(out,'README.md'),`# Ordinary-game capture diagnostic\n\nStatus: ${report.status}. ${pixels.length}/54 fixed sample locations remain after geometry exclusions. Source time: ${resolved.time} seconds (${resolved.source}). ${report.captureHistory}\n\n${table}\n\n${report.limitations.map(s=>'- '+s).join('\n')}\n\nReproduce with explicit \`--raw\`, \`--tsr\`, and \`--analytic\` report paths: \`node native/tools/compare_game_capture.mjs --raw raw/report.json --tsr tsr/report.json --analytic analytic/report.json\`. Optional \`--time seconds\` must agree with sample-time metadata; optional \`--out\` must name a new directory. PNGs resolve from each report's \`frames/\` directory; an adjacent \`preparation.json\` is verified when present. This tool never opens captured absolute provenance paths or runs Unreal. Details: [report.json](report.json).\n`);
  console.log(JSON.stringify({output:relative(out),status:report.status,transferPassed,metadataPassed,phase:report.phase,summary,warnings},null,2));
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const result=main();if(!result.summary)process.exitCode=1; }
  catch(error){console.error(error.stack??error);process.exitCode=1;}
}
