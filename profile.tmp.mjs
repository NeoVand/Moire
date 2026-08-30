import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const root='/Users/neo/repos/Moire';
function layer(id,over={}){return {id,name:id,type:'straight-lines',visible:true,color:'#000000',rotation:0,opacity:1,spacing:12,thickness:2,phase:0,position:{x:0,y:0},offset:{x:0,y:0},scale:{x:1,y:1},rotationOffset:0,sides:6,vertexSize:2.5,drawEdges:true,lineCount:8,bend:0,frequency:1,tiling:'kagome',field:{source:'',amount:3,scale:200},...over};}
function view(o={}){return {envelope:false,envelopeContrast:3,envelopeTaps:24,envelopeSweep:1,envelopeLift:0,envelopeMask:0,envelopeContours:false,contourWidth:1.6,contourBands:0.4,ratio:false,ratioBlend:1,ratioThreshold:0.25,...o};}
function scene(ls,v){return {app:'moire',version:1,layers:ls,selectedLayerId:ls[0].id,camera:{zoom:1,pan:{x:0,y:0}},backgroundColor:'#ffffff',view:v};}
const til=(id,o={})=>layer('a',{type:'tiling-periodic',tiling:id,spacing:22,thickness:2,...o});
const til2=(id,o={})=>layer('b',{type:'tiling-periodic',tiling:id,spacing:22,thickness:2,rotation:5,...o});
const SCENES={
 'grid-pair-plain':scene([layer('a',{type:'grid-square',spacing:22}),layer('b',{type:'grid-square',spacing:22,rotation:5})],view()),
 'tiling1-plain':scene([til('kagome')],view()),
 'tiling2-plain':scene([til('kagome'),til2('kagome')],view()),
 'tiling2-envelope':scene([til('kagome'),til2('kagome')],view({envelope:true})),
 'tiling2-snubtri-env':scene([til('snub-trihex'),til2('snub-trihex')],view({envelope:true})),
};
const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{port:5203,strictPort:false,host:'127.0.0.1'},logLevel:'silent'});
await server.listen(); const port=server.httpServer.address().port;
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu','--hide-scrollbars','--mute-audio']});
try{
 const page=await browser.newPage(); page.setDefaultTimeout(300000);
 page.on('pageerror',e=>console.error('page error:',e.message));
 await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
 await page.goto(`http://127.0.0.1:${port}/?zoo`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__zoo&&window.__zoo.info()!==null);
 for(const [n,s] of Object.entries(SCENES)){
  const r=await page.evaluate(async ({json})=>{
   window.__zoo.load(json);
   const run=async(w,h,n)=>{ await window.__zoo.capture({width:w,height:h});
     const t=[]; for(let i=0;i<n;i++){const a=performance.now(); await window.__zoo.capture({width:w,height:h}); t.push(performance.now()-a);} t.sort((x,y)=>x-y); return t[Math.floor(t.length/2)];};
   const big=await run(1400,1000,8), small=await run(200,150,8);
   return {big,small};
  },{json:JSON.stringify(s)});
  const px=(1400*1000-200*150)/1e6;
  console.log(`${n}\tperMpx=${((r.big-r.small)/px).toFixed(1)}ms`);
 }
} finally { await browser.close(); await server.close(); }
