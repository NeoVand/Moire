// Isolated compute-kernel timing; not a material/frame/GPU integration claim.
// node bessel-bench.mjs [--table DIR] [--out NEW.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const here=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const out=resolve(arg('--out',join(here,'bessel-benchmark-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')));
const bytes=readFileSync(join(arg('--table',join(here,'bessel-table-v1')),'bessel-table.f32'));
const coefficients=Array.from(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4));
const wgsl=readFileSync(join(here,'bessel.wgsl'),'utf8');
const server=createServer((_q,r)=>r.end('<!doctype html><title>Bessel kernel benchmark</title>'));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu','--mute-audio']});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async({wgsl,coefficients})=>{
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter?.features.has('timestamp-query'))throw new Error('Hardware GPU timestamps unavailable; no wall-time substitution');
  const device=await adapter.requestDevice({requiredFeatures:['timestamp-query']});
  const N=8192;
  const values=new Float32Array(N);let state=17193;
  for(let i=0;i<N;i++){state=(Math.imul(1664525,state)+1013904223)>>>0;values[i]=(state/2**32)*40;}
  function upload(a){const b=device.createBuffer({size:a.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,a);return b;}
  const table=upload(new Float32Array(coefficients)),input=upload(values);
  const output=device.createBuffer({size:N*41*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const layout=device.createBindGroupLayout({entries:[
   {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
   {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
   {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const bind=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:table}},{binding:1,resource:{buffer:input}},{binding:2,resource:{buffer:output}}]});
  const query=device.createQuerySet({type:'timestamp',count:2});
  const resolved=device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const runs=[];
  for(const method of ['miller','table'])for(const mode of ['single-jet','full-row']){
   let body='';
   if(method==='miller')body+='let row=bessel_miller_row(x);';
   else if(mode==='full-row')body+='let row=bessel_table_row(x);';
   if(mode==='single-jet')body+=`let n=i32(index%41u);let j=${method==='miller'?'bessel_row_jet(row,n)':'bessel_table_jet(n,x)'};outputs[index]=vec4<f32>(j.q,j.d1,j.d2,f32(j.valid));`;
   else body+=`for(var n=0i;n<=40i;n+=1i){let j=bessel_row_jet(row,n);outputs[index*41u+u32(n)]=vec4<f32>(j.q,j.d1,j.d2,f32(j.valid));}`;
   const module=device.createShaderModule({code:wgsl+`
@group(0) @binding(1) var<storage,read> inputs: array<f32>;
@group(0) @binding(2) var<storage,read_write> outputs: array<vec4<f32>>;
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) gid: vec3<u32>){let index=gid.x;if(index>=arrayLength(&inputs)){return;}let x=inputs[index];${body}}
`});
   const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(JSON.stringify(info.messages.map(m=>m.message)));
   const pipeline=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint:'main'}});
   const times=[];
   for(let trial=0;trial<6;trial++){
    const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass({timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});
    pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(N/32);pass.end();
    encoder.resolveQuerySet(query,0,2,resolved,0);encoder.copyBufferToBuffer(resolved,0,read,0,16);device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);const stamp=new BigUint64Array(read.getMappedRange());const milliseconds=Number(stamp[1]-stamp[0])/1e6;read.unmap();
    if(trial>0)times.push(milliseconds);
   }
   const sorted=times.slice().sort((a,b)=>a-b),median=sorted[2];
   runs.push({method,mode,arguments:N,jetsPerArgument:mode==='single-jet'?1:41,gpuMs:times,medianGpuMs:median,nanosecondsPerArgument:median*1e6/N});
  }
  const info=adapter.info;device.destroy();return {adapter:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter},runs};
 },{wgsl,coefficients});
 const record={dateUTC:new Date().toISOString(),scope:'8192 independent random arguments in[0,40], one warmup and five timestamp-query trials per kernel; includes storage writes, excludes compile/upload/readback. No full-frame speed claim.',...results};
 writeFileSync(out,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record,null,2));console.log(out);
}finally{await browser.close();await new Promise(r=>server.close(r));}
