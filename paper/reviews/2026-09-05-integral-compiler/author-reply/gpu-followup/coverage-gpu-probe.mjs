import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { gaussianChirpMoments } from '../gaussian-chirp.mjs';
import { loadCoverageAdapter, packCoverage } from './coverage-adapter-trace.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const flag=process.argv.indexOf('--out');
const out=flag>=0?path.resolve(process.argv[flag+1]):path.join(here,`coverage-results-${new Date().toISOString().replaceAll(':','-')}.json`);
if(fs.existsSync(out)) throw new Error(`Refusing to overwrite ${out}`);
const shader=fs.readFileSync(path.join(here,'coverage.wgsl'),'utf8');
const references=JSON.parse(fs.readFileSync(new URL('../coverage-reference.json',import.meta.url),'utf8')).cases;
const adapter=loadCoverageAdapter();
const tests=references.map(row=>{
  const sigma=row.args.sigma??1;
  const norm=row.args.normalized===false?Math.sqrt(2*Math.PI)*sigma:1;
  return {name:row.id,kind:'high-precision-fixture',packed:packCoverage(row.args),
    expected:row.moments.map((z,j)=>z.map(x=>Number(x)/(norm*sigma**j)))};
});
const adapterStart=tests.length;
for(const [i,entry] of adapter.trace.entries()) tests.push({name:`adapter-${i}`,kind:'author-adapter-call',packed:packCoverage(entry.args),
  expected:entry.result.moments.map((z,j)=>z.map(x=>x/entry.args.sigma**j))});
// A deterministic nontrivial parameter grid, with the CPU implementation as oracle.
for(let k=0;k<96;k++) {
  const args={a:-2.8+((k*17)%29)/10,b:0.3+((k*23)%31)/10,beta:-8+((k*13)%33)/2,q:-2+((k*7)%17)/4};
  const result=gaussianChirpMoments(args);
  tests.push({name:`grid-${k}`,kind:'cpu-reference-grid',packed:packCoverage(args),expected:result.moments});
}
tests.push({name:'range-refusal',kind:'refusal',packed:packCoverage({a:-1,b:1,beta:65}),expectStatus:1});
tests.push({name:'work-refusal',kind:'refusal',packed:packCoverage({a:-6,b:6,beta:64,q:16}),expectStatus:2});
tests.push({name:'precision-refusal',kind:'refusal',packed:packCoverage({a:-1,b:1},1e-11),expectStatus:4});
tests.push({name:'invalid-mode-refusal',kind:'refusal',packed:[0,1,0,0,4,1e-4,1,0],expectStatus:1});

const benchmarks=[
  {name:'full-line',data:[packCoverage({beta:2,q:0.5})]},
  {name:'finite-small',data:[packCoverage({a:-1,b:1,beta:1,q:0.1})]},
  {name:'halfline-q2',data:[packCoverage({a:1,q:2})]},
  {name:'accepted-adapter-mixture',data:adapter.trace.map(t=>packCoverage(t.args))},
];
const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Coverage compute probe</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  args:['--enable-unsafe-webgpu','--mute-audio']});
let gpu;
try {
  const page=await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror',error=>console.error(error));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  gpu=await page.evaluate(async({shader,tests,benchmarks})=>{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter) throw new Error('No WebGPU adapter');
    const timestamps=adapter.features.has('timestamp-query');
    const device=await adapter.requestDevice({requiredFeatures:timestamps?['timestamp-query']:[]});
    const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const module=device.createShaderModule({code:shader});
    const compilation=await module.getCompilationInfo();
    const bad=compilation.messages.filter(m=>m.type==='error');
    if(bad.length) throw new Error(bad.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
    const make=(rows,count=rows.length)=>{
      const input=device.createBuffer({size:count*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      const output=device.createBuffer({size:count*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const data=new Float32Array(count*8);
      for(let i=0;i<count;i++) data.set(rows[i%rows.length],i*8);
      device.queue.writeBuffer(input,0,data);
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});
      return {input,output,group,count};
    };
    const dispatch=(state,encoder,timestampWrites)=>{
      const pass=encoder.beginComputePass(timestampWrites?{timestampWrites}:{});
      pass.setPipeline(pipeline);pass.setBindGroup(0,state.group);pass.dispatchWorkgroups(Math.ceil(state.count/64));pass.end();
    };
    const state=make(tests.map(t=>t.packed));
    const read=device.createBuffer({size:state.count*64,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();dispatch(state,encoder);
    encoder.copyBufferToBuffer(state.output,0,read,0,state.count*64);
    device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
    const mapped=read.getMappedRange();
    const floats=new Float32Array(mapped),ints=new Uint32Array(mapped);
    const results=tests.map((_,i)=>({moments:[[floats[i*16],floats[i*16+1]],[floats[i*16+2],floats[i*16+3]],[floats[i*16+4],floats[i*16+5]]],
      analyticMax:floats[i*16+6],roundoffMax:floats[i*16+7],errors:Array.from(floats.slice(i*16+8,i*16+11)),
      status:ints[i*16+12],panels:ints[i*16+13],coefficients:ints[i*16+14]}));
    read.unmap();read.destroy();state.input.destroy();state.output.destroy();
    const timings=[];
    for(const row of benchmarks) {
      const count=32768;
      const state=make(row.data,count);
      const query=timestamps?device.createQuerySet({type:'timestamp',count:2}):null;
      const resolve=timestamps?device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}):null;
      const qread=timestamps?device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}):null;
      const samples=[];
      for(let iteration=0;iteration<9;iteration++) {
        const encoder=device.createCommandEncoder();
        dispatch(state,encoder,query?{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}:undefined);
        if(query) {encoder.resolveQuerySet(query,0,2,resolve,0);encoder.copyBufferToBuffer(resolve,0,qread,0,16);}
        const start=performance.now();device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();
        const wallMs=performance.now()-start;
        let gpuMs=null;
        if(query) {await qread.mapAsync(GPUMapMode.READ);const q=new BigUint64Array(qread.getMappedRange());gpuMs=Number(q[1]-q[0])/1e6;qread.unmap();}
        if(iteration>=2) samples.push({wallMs,gpuMs});
      }
      timings.push({name:row.name,count,samples});
      state.input.destroy();state.output.destroy();query?.destroy();resolve?.destroy();qread?.destroy();
    }
    const info={vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description};
    await device.queue.onSubmittedWorkDone();device.destroy();
    if(errors.length) throw new Error(errors.join('\n'));
    return {info,timestamps,results,timings,userAgent:navigator.userAgent};
  },{shader,tests,benchmarks});
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}

let accepted=0,refused=0,largestError=0,largestErrorRatio=0;
const rows=tests.map((test,i)=>{
  const result=gpu.results[i];
  if(test.expectStatus!==undefined) assert.equal(result.status,test.expectStatus,test.name);
  let discrepancy=null;
  if(test.expected) {
    discrepancy=result.moments.map((m,j)=>Math.hypot(...m.map((x,k)=>x-test.expected[j][k])));
    if(result.status===0 || result.status===4) {
      for(let j=0;j<3;j++) {
        assert.ok(discrepancy[j]<=result.errors[j]+1e-36,`${test.name} moment ${j}: ${discrepancy[j]} > ${result.errors[j]}`);
        if(result.status===0) assert.ok(discrepancy[j]<=test.packed[5]+1e-36,`${test.name} tolerance ${j}`);
        largestError=Math.max(largestError,discrepancy[j]);
        if(result.errors[j]>0) largestErrorRatio=Math.max(largestErrorRatio,discrepancy[j]/result.errors[j]);
      }
    }
  }
  if(result.status===0) accepted++;else refused++;
  return {name:test.name,kind:test.kind,packed:test.packed,...result,discrepancy};
});
let replayIndex=0;
const replay=adapter.run(args=>{
  const expected=adapter.trace[replayIndex].args;
  assert.deepEqual(args,expected,'adapter call sequence changed');
  const result=gpu.results[adapterStart+replayIndex++];
  assert.equal(result.status,0,'adapter interval refused');
  // Keep the author's stricter original target visible: these values meet the
  // shader's declared 1e-4 target, not necessarily his CPU primitive's 1e-11.
  return {moments:result.moments.map((z,j)=>z.map(x=>x*args.sigma**j)),
    status:result.errors.every(e=>e<=args.absTol)?'estimated-tolerance-met':'roundoff-limited'};
});
assert.equal(replayIndex,adapter.trace.length);
const adapterResults=replay.map((row,i)=>({...row,baseline:adapter.baseline[i].result,
  complexDifference:Math.hypot(row.result.re-adapter.baseline[i].result.re,row.result.im-adapter.baseline[i].result.im)}));
for(const row of adapterResults) assert.ok(row.complexDifference<1e-4,`${row.name} adapter difference`);
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
const timings=gpu.timings.map(row=>({...row,medianWallMs:median(row.samples.map(s=>s.wallMs)),
  medianGpuMs:gpu.timestamps?median(row.samples.map(s=>s.gpuMs)):null,
  callsPerSecond:row.count/(median(row.samples.map(s=>gpu.timestamps?s.gpuMs:s.wallMs))/1000)}));
const report={createdAt:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,adapterSourceSha256:adapter.sourceSha256,
  shaderSha256:createHash('sha256').update(shader).digest('hex'),
  targetContract:{shaderStandardizedMomentTolerance:1e-4,originalAdapterStandardizedMomentTolerance:1e-11,
    note:'Adapter replay preserves its original failure count at 1e-11; GPU status0 refers only to the explicitly looser shader target.'},
  gpu:{info:gpu.info,timestamps:gpu.timestamps,userAgent:gpu.userAgent},
  summary:{cases:tests.length,accepted,refused,largestError,largestErrorRatio,adapterCalls:adapter.trace.length},
  adapterPhaseRange:{B:[Math.min(...adapter.trace.map(t=>t.args.beta*t.args.sigma)),Math.max(...adapter.trace.map(t=>t.args.beta*t.args.sigma))],
    Q:[Math.min(...adapter.trace.map(t=>t.args.q*t.args.sigma**2)),Math.max(...adapter.trace.map(t=>t.args.q*t.args.sigma**2))]},
  adapterResults,timings,cases:rows};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,summary:report.summary,adapterResults,timings},null,2));
