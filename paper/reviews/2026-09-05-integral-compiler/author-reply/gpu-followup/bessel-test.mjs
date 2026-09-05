// CPU float32 and actual headless WebGPU check. Run:
// node bessel-test.mjs --table DIR --reference DIR [--out NEW.json] [--cpu-only]
// Needs this repository's puppeteer-core and an installed Chrome. No app used.
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {tableJ,millerRow,rowJ,jetFrom} from './bessel-f32.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const tableDir=resolve(arg('--table',join(here,'bessel-table-v1')));
const referenceDir=arg('--reference');
assert(referenceDir,'--reference DIR is required');
const out=resolve(arg('--out',join(here,'bessel-results-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')));
const tableBytes=readFileSync(join(tableDir,'bessel-table.f32'));
const table=new Float32Array(tableBytes.buffer,tableBytes.byteOffset,tableBytes.length/4);
const certificate=JSON.parse(readFileSync(join(tableDir,'bessel-table-certificate.json')));
assert.equal(createHash('sha256').update(tableBytes).digest('hex'),certificate.sha256);
const cases=JSON.parse(readFileSync(join(referenceDir,'bessel-cases.json')));
const referenceMeta=JSON.parse(readFileSync(join(referenceDir,'bessel-reference-meta.json')));
const refBytes=readFileSync(join(referenceDir,'bessel-reference.f64'));
assert.equal(createHash('sha256').update(refBytes).digest('hex'),referenceMeta.sha256);
const refs=new Float64Array(refBytes.buffer,refBytes.byteOffset,refBytes.length/8);
const wgsl=readFileSync(join(here,'bessel.wgsl'),'utf8');
const summary={dateUTC:new Date().toISOString(),cases:cases.length,orders:[-42,42],jetOrders:[-40,40],
  reference:referenceMeta,tableSHA256:certificate.sha256,wgslSHA256:createHash('sha256').update(wgsl).digest('hex'),
  claims:'Measured maxima are finite-set results, not a uniform GPU/Miller proof. Taylor certificate states separate analytic/roundoff assumptions.'};

function stats(){return {maxAbs:[0,0,0],worst:[null,null,null],maxNearZeroAbs:0,maxRelativeWhereValueAbove1e_4:0,nonfinite:0};}
function exact(i,n){let r=refs[i*43+Math.abs(n)];if(n<0&&Math.abs(n)%2)r=-r;return r;}
function target(i,n){return Math.abs(n)>40?[exact(i,n),0,0]:[exact(i,n),(exact(i,n-1)-exact(i,n+1))/2,(exact(i,n-2)-2*exact(i,n)+exact(i,n+2))/4];}
function observe(s,values,want,i,n){
  for(let q=0;q<(Math.abs(n)>40?1:3);q++){
    if(!Number.isFinite(values[q])){s.nonfinite++;continue;}
    const error=Math.abs(values[q]-want[q]);
    if(error>s.maxAbs[q]){s.maxAbs[q]=error;s.worst[q]={x:cases[i].x,n,actual:values[q],reference:want[q],tags:cases[i].tags};}
    if(q===0&&Math.abs(want[q])<1e-5)s.maxNearZeroAbs=Math.max(s.maxNearZeroAbs,error);
    if(q===0&&Math.abs(want[q])>1e-4)s.maxRelativeWhereValueAbove1e_4=Math.max(s.maxRelativeWhereValueAbove1e_4,error/Math.abs(want[q]));
  }
}
const cpu={table:stats(),miller:stats()};
let start=performance.now();
for(let i=0;i<cases.length;i++){
  const x=cases[i].x,row=millerRow(x);
  for(let n=-42;n<=42;n++){
    const want=target(i,n);
    observe(cpu.table,Math.abs(n)>40?[tableJ(table,n,x)]:jetFrom(k=>tableJ(table,k,x),n),want,i,n);
    observe(cpu.miller,Math.abs(n)>40?[rowJ(row,n)]:jetFrom(k=>rowJ(row,k),n),want,i,n);
  }
}
cpu.wallMs=performance.now()-start;
assert.equal(cpu.table.nonfinite,0);assert.equal(cpu.miller.nonfinite,0);
assert(cpu.table.maxAbs.every((v,i)=>v<certificate.unitAmplitudeQDerivativeAbsoluteErrorBounds[i]));
assert(cpu.miller.maxAbs.every(v=>v<1e-5));
summary.cpu=cpu;
console.log('CPU',JSON.stringify(cpu));

if(!args.includes('--cpu-only')){
  const server=createServer((_q,r)=>{r.setHeader('content-type','text/html');r.end('<!doctype html><title>Bessel compute validation</title>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu','--mute-audio']});
  try{
    const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const gpuResult=await page.evaluate(async({wgsl,inputs,coefficients})=>{
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw new Error('No actual WebGPU adapter');
      const features=adapter.features.has('timestamp-query')?['timestamp-query']:[];
      const device=await adapter.requestDevice({requiredFeatures:features});
      const kernel=wgsl+`
@group(0) @binding(1) var<storage,read> inputs: array<f32>;
@group(0) @binding(2) var<storage,read_write> outputs: array<f32>;
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) gid: vec3<u32>){
  let index=gid.x;if(index>=arrayLength(&inputs)){return;}
  let x=inputs[index];let row=bessel_miller_row(x);
  for(var n=-42i;n<=42i;n+=1i){
    let at=(index*85u+u32(n+42i))*6u;
    if(abs(n)<=40i){
      let a=bessel_table_jet(n,x);let b=bessel_row_jet(row,n);
      outputs[at]=a.q;outputs[at+1u]=a.d1;outputs[at+2u]=a.d2;
      outputs[at+3u]=b.q;outputs[at+4u]=b.d1;outputs[at+5u]=b.d2;
    }else{outputs[at]=bessel_table(n,x).value;outputs[at+3u]=bessel_row_at(row,n);}
  }
}`;
      const module=device.createShaderModule({code:kernel});
      const compilation=await module.getCompilationInfo();
      const errors=compilation.messages.filter(m=>m.type==='error');
      if(errors.length)throw new Error(JSON.stringify(errors.map(e=>({message:e.message,line:e.lineNum}))));
      const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
      function upload(array){const b=device.createBuffer({size:array.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,array);return b;}
      const coeff=upload(new Float32Array(coefficients)),data=upload(new Float32Array(inputs));
      const byteLength=inputs.length*85*6*4;
      const output=device.createBuffer({size:byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
      const staging=device.createBuffer({size:byteLength,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:coeff}},{binding:1,resource:{buffer:data}},{binding:2,resource:{buffer:output}}]});
      const t0=performance.now();
      const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(inputs.length/32));pass.end();
      encoder.copyBufferToBuffer(output,0,staging,0,byteLength);device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(staging.getMappedRange()));
      const elapsed=performance.now()-t0;
      const info=adapter.info;
      const result={values,wallMsIncludingReadback:elapsed,adapter:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter},timestampQueryAvailable:features.length>0,compilation:compilation.messages.map(m=>({message:m.message,type:m.type}))};
      staging.unmap();device.destroy();return result;
    },{wgsl,inputs:cases.map(c=>c.x),coefficients:Array.from(table)});
    const gpu={table:stats(),miller:stats(),...Object.fromEntries(Object.entries(gpuResult).filter(([k])=>k!=='values'))};
    for(let i=0;i<cases.length;i++)for(let n=-42;n<=42;n++){
      const at=(i*85+n+42)*6,want=target(i,n);
      observe(gpu.table,gpuResult.values.slice(at,at+3),want,i,n);
      observe(gpu.miller,gpuResult.values.slice(at+3,at+6),want,i,n);
    }
    assert.equal(gpu.table.nonfinite,0);assert.equal(gpu.miller.nonfinite,0);
    assert(gpu.table.maxAbs.every((v,i)=>v<certificate.unitAmplitudeQDerivativeAbsoluteErrorBounds[i]));
    assert(gpu.miller.maxAbs.every(v=>v<1e-5));
    summary.gpu=gpu;console.log('GPU',JSON.stringify(gpu));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
summary.gates='all passed';
writeFileSync(out,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(out);
