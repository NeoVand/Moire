// Independent numerical divergence gate for all field terms, including masks.
import assert from 'node:assert/strict';
process.env.FIRE_CONTROLS_LIB='1';
const {evaluate,rawSource,controls,SIG,points}=await import('./fire-controls.mjs');
function field(x,y,zx,zy,j,k,sine,masked,branch){
 const phases=evaluate(x+zx,y+zy).phases,q=phases[j],r=Math.hypot(zx,zy);
 if(r>=5*SIG)return[0,0];
 let w=1;
 if(r>4*SIG){const t=(r-4*SIG)/SIG;w=1-10*t**3+15*t**4-6*t**5;}
 if(masked){
  if((Math.sin(phases[1].v)>=0?0:1)!==branch)return[0,0];
  for(const a of[6*phases[0].v,phases[1].v]){const s=Math.sin(a);w*=s*s/(s*s+.15**2);}
 }
 const D=k*k*(q.gx*q.gx+q.gy*q.gy)+1/(SIG*SIG);
 const f=w*k*(sine?-Math.cos(k*q.v):Math.sin(k*q.v))/D;
 return[f*q.gx,f*q.gy];
}
let tests=0,maxError=0,maxSourceError=0;
for(const [x,y]of[[300,12],[400,60],[100,120]]){
 const p=points(30,45619);
 const zs=Array.from({length:p.length/2},(_,i)=>[p[2*i],p[2*i+1]]);
 zs.push([4.3*SIG,0],[0,-4.6*SIG],[5.1*SIG,0]);
 for(const [zx,zy]of zs){
  const e=evaluate(x+zx,y+zy);maxSourceError=Math.max(maxSourceError,Math.abs(e.S-rawSource(x+zx,y+zy)));
  for(const K of[1,4,16])for(const masked of[false,true]){
   const h=controls(e.phases,zx,zy,K,masked);
   for(let j=0;j<2;j++)for(let sine=0;sine<2;sine++)for(let branch=0;branch<(masked?2:1);branch++){
    // Two decreasing steps detect unresolved oscillations in the finite difference.
    const q=e.phases[j],maskRate=masked?Math.max(6*Math.hypot(e.phases[0].gx,e.phases[0].gy),Math.hypot(e.phases[1].gx,e.phases[1].gy))/.15:0;
    const step=Math.min(1e-7,.0005/(1+Math.max(K*Math.hypot(q.gx,q.gy),maskRate)));
    const estimate=eps=>{
     const f=field(x,y,zx,zy,j,K,sine,masked,branch);
     const px=field(x,y,zx+eps,zy,j,K,sine,masked,branch),mx=field(x,y,zx-eps,zy,j,K,sine,masked,branch);
     const py=field(x,y,zx,zy+eps,j,K,sine,masked,branch),my=field(x,y,zx,zy-eps,j,K,sine,masked,branch);
     return (px[0]-mx[0]+py[1]-my[1])/(2*eps)-(zx*f[0]+zy*f[1])/(SIG*SIG);
    };
    const want=h[branch*4*K+j*2*K+2*K-2+sine],a=estimate(step),b=estimate(step/2);
    const error=Math.max(Math.abs(b-want),Math.abs(a-b))/(1+Math.abs(want));
    maxError=Math.max(maxError,error);tests++;
    assert(error<.0001,JSON.stringify({x,y,zx,zy,K,masked,j,sine,branch,want,a,b,error}));
   }
  }
 }
}
assert(maxSourceError<1e-9);
console.log(JSON.stringify({tests,maxRelativeDivergenceError:maxError,maxSourceError,meaning:'Finite differences of vector fields versus analytic Stein controls; full source, masks, branch restriction, and radial transition exercised. This is a numerical implementation gate; zero mean follows from the compact-support divergence identity.'}));
