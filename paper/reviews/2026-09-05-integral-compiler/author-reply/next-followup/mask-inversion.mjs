// CPU prototype: one Fourier inversion of a quadratic mask, keeping the entire
// polynomial-amplitude/quadratic-phase weight. Bounds concern the mathematical
// tail; adaptive finite quadrature and floating-point error remain estimates.
const PI=Math.PI;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
const scale=(a,s)=>[a[0]*s,a[1]*s];
const norm=Math.hypot;
const keys=['v','gx','gy','hxx','hxy','hyy'];
export const quadratic=(v=0,gx=0,gy=0,hxx=0,hxy=0,hyy=0)=>({v,gx,gy,hxx,hxy,hyy});
const opNorm=q=>Math.abs((q.hxx+q.hyy)/2)+Math.hypot((q.hxx-q.hyy)/2,q.hxy);
const whiten=(q,s)=>quadratic(q.v,q.gx*s,q.gy*s,q.hxx*s*s,q.hxy*s*s,q.hyy*s*s);
const poly=q=>[[0,0,q.v],[1,0,q.gx],[0,1,q.gy],[2,0,q.hxx/2],[1,1,q.hxy],[0,2,q.hyy/2]];
const multiplyPoly=(a,b)=>a.flatMap(([p,q,c])=>b.map(([r,s,d])=>[p+r,q+s,c*d]));

/** Gaussian transform for standard independent X,Y; phase is in RADIANS. */
export function gaussianQuadraticState(phase) {
  const {v,gx:x,gy:y,hxx:a,hxy:b,hyy:c}=phase;
  const dr=1-a*c+b*b,di=-a-c,den=dr*dr+di*di;
  const xx=[(dr-c*di)/den,(-di-c*dr)/den];
  const xy=[b*di/den,b*dr/den];
  const yy=[(dr-a*di)/den,(-di-a*dr)/den];
  const vx=add(scale(xx,x),scale(xy,y));
  const vy=add(scale(xy,x),scale(yy,y));
  const mx=[-vx[1],vx[0]],my=[-vy[1],vy[0]];
  const logarithm=-0.5*Math.log(Math.hypot(dr,di))-0.5*(x*vx[0]+y*vy[0]);
  const angle=v-0.5*Math.atan2(di,dr)-0.5*(x*vx[1]+y*vy[1]);
  const magnitude=Math.exp(logarithm);
  return {value:[magnitude*Math.cos(angle),magnitude*Math.sin(angle)],mx,my,xx,xy,yy};
}

export function gaussianPolynomialPhase(amplitude,phase) {
  const S=gaussianQuadraticState(phase);
  let P=[amplitude.v,0];
  P=add(P,add(scale(S.mx,amplitude.gx),scale(S.my,amplitude.gy)));
  P=add(P,scale(add(S.xx,mul(S.mx,S.mx)),amplitude.hxx/2));
  P=add(P,scale(add(S.xy,mul(S.mx,S.my)),amplitude.hxy));
  P=add(P,scale(add(S.yy,mul(S.my,S.my)),amplitude.hyy/2));
  return mul(S.value,P);
}

function polynomialMean(P,phase) {
  const S=gaussianQuadraticState(phase),cache=new Map();
  const moment=(p,q)=>{
    if(p<0||q<0) return [0,0];
    if(p===0&&q===0) return [1,0];
    const key=p+','+q;
    if(cache.has(key)) return cache.get(key);
    let result;
    if(p>0) result=add(mul(S.mx,moment(p-1,q)),add(scale(mul(S.xx,moment(p-2,q)),p-1),scale(mul(S.xy,moment(p-1,q-1)),q)));
    else result=add(mul(S.my,moment(0,q-1)),scale(mul(S.yy,moment(0,q-2)),q-1));
    cache.set(key,result);return result;
  };
  let result=[0,0];
  for(const [p,q,c] of P) result=add(result,scale(moment(p,q),c));
  return mul(S.value,result);
}

function absolutePolynomialMean(P) {
  const moments=[1,Math.sqrt(2/PI)];
  for(let k=2;k<=8;k++) moments.push((k-1)*moments[k-2]);
  return P.reduce((s,[p,q,c])=>s+Math.abs(c)*moments[p]*moments[q],0);
}

/** Build F(t), the removable t=0 integrand, and explicit mathematical tail bounds.
 * zeroWeight sets H(0) only for a constant zero mask (default strict >0: zero).
 * Positive mask normalization changes the inversion variable, not the region.
 */
export function compileMaskTerm({mask,amplitude=quadratic(1),phase=quadratic(),sigma=1,zeroWeight=0}) {
  if(!(sigma>0&&Number.isFinite(sigma)&&sigma*sigma>0&&Number.isFinite(sigma*sigma))||![0,0.5,1].includes(zeroWeight)
      ||![mask,amplitude,phase].every(q=>q&&keys.every(k=>Number.isFinite(q[k])))) throw new RangeError('Invalid quadratic term');
  const raw=whiten(mask,sigma),A=whiten(amplitude,sigma),P=whiten(phase,sigma);
  if(![raw,A,P].every(q=>keys.every(k=>Number.isFinite(q[k])))) throw new RangeError('Whitened coefficients overflow');
  for(const [before,after] of [[mask,raw],[amplitude,A],[phase,P]])
    if(keys.some(k=>before[k]!==0&&after[k]===0)) throw new RangeError('Whitened coefficient underflows; cannot classify the region');
  const normalization=Math.max(Math.abs(raw.v),Math.hypot(raw.gx,raw.gy),Math.hypot(raw.hxx,Math.SQRT2*raw.hxy,raw.hyy));
  const M=normalization?Object.fromEntries(keys.map(k=>[k,raw[k]/normalization])):quadratic();
  if(keys.some(k=>raw[k]!==0&&M[k]===0)) throw new RangeError('Mask normalization underflows a coefficient');
  const full=gaussianPolynomialPhase(A,P);
  const constant=M.gx===0&&M.gy===0&&M.hxx===0&&M.hxy===0&&M.hyy===0;
  if(constant) return {normalization,mask:M,amplitude:A,phase:P,full,constantValue:scale(full,M.v>0?1:M.v<0?0:zeroWeight),classification:'constant mask'};
  const H=opNorm(M),R=opNorm(P),C=opNorm(A),an=Math.hypot(A.gx,A.gy);
  const determinant=M.hxx*M.hyy-M.hxy*M.hxy;
  const smallest=H>0?Math.abs(determinant)/H:0;
  const F=t=>gaussianPolynomialPhase(A,Object.fromEntries(keys.map(k=>[k,P[k]+t*M[k]])));
  const atZero=scale(polynomialMean(multiplyPoly(poly(A),poly(M)),P),1/PI);
  const cube=multiplyPoly(multiplyPoly(poly(M).map(([p,q,c])=>[p,q,Math.abs(c)]),poly(M).map(([p,q,c])=>[p,q,Math.abs(c)])),poly(M).map(([p,q,c])=>[p,q,Math.abs(c)]));
  const smallTConstant=absolutePolynomialMean(multiplyPoly(poly(A).map(([p,q,c])=>[p,q,Math.abs(c)]),cube))/(6*PI);
  const integrand=t=>{
    if(t===0) return atZero;
    // Exact sine-Taylor remainder <= smallTConstant*t^2 at these points.
    if(Math.abs(t)<1e-7) return atZero;
    const plus=F(t),minus=F(-t);
    return [(plus[1]-minus[1])/(2*PI*t),-(plus[0]-minus[0])/(2*PI*t)];
  };
  if(smallest>1e-12*H) {
    const hx=(M.hyy*M.gx-M.hxy*M.gy)/determinant;
    const hy=(M.hxx*M.gy-M.hxy*M.gx)/determinant;
    const hnorm=Math.hypot(hx,hy);
    const dx=P.gx-P.hxx*hx-P.hxy*hy,dy=P.gy-P.hxy*hx-P.hyy*hy;
    const dn=Math.hypot(hx,hy,dx,dy);
    const shiftedA0=A.v-A.gx*hx-A.gy*hy+0.5*(A.hxx*hx*hx+2*A.hxy*hx*hy+A.hyy*hy*hy);
    const shiftedAn=Math.hypot(A.gx-A.hxx*hx-A.hxy*hy,A.gy-A.hxy*hx-A.hyy*hy);
    const kappa=M.v-0.5*(M.gx*hx+M.gy*hy);
    if(determinant>0&&((M.hxx+M.hyy>0&&kappa>=0)||(M.hxx+M.hyy<0&&kappa<=0)))
      return {normalization,mask:M,amplitude:A,phase:P,full,constantValue:M.hxx+M.hyy>0?full:[0,0],classification:'definite mask, constant region',kappa};
    const tail=T=>{
      const delta=smallest-R/T;
      if(!(delta>0)) return {bound:Infinity,reason:'T must exceed phase norm / smallest mask curvature'};
      const factor=Math.exp(-hnorm*hnorm/2+dn*dn/(2*delta*T))/delta;
      const p0=Math.abs(shiftedA0),p1=(shiftedAn*dn+C)/delta,p2=C*dn*dn/(2*delta*delta);
      const absolute=factor/PI*(p0/T+p1/(2*T*T)+p2/(3*T**3));
      const l1=H/delta,l2=H*dn*dn/(2*delta*delta);
      const r2=H*(shiftedAn*dn+C)/(delta*delta),r3=C*H*dn*dn/(delta**3);
      const boundary=p0/T**2+p1/T**3+p2/T**4;
      const derivative=(l1+1)*p0/(2*T**2)+((l1+1)*p1+l2*p0+r2)/(3*T**3)
        +((l1+1)*p2+l2*p1+r3)/(4*T**4)+l2*p2/(5*T**5);
      const oscillatory=kappa!==0?factor*(boundary+derivative)/(PI*Math.abs(kappa)):Infinity;
      return {bound:Math.min(absolute,oscillatory),absolute,oscillatory,delta};
    };
    return {normalization,mask:M,amplitude:A,phase:P,full,F,integrand,atZero,smallTConstant,tail,
      classification:determinant<0?'indefinite full rank':M.hxx+M.hyy>0?'positive definite':'negative definite',
      kappa,smallestCurvature:smallest,maskNorm:H,phaseNorm:R};
  }
  if(H===0) {
    const S=gaussianQuadraticState(P),vgx=add(scale(S.xx,M.gx),scale(S.xy,M.gy)),vgy=add(scale(S.xy,M.gx),scale(S.yy,M.gy));
    const c=0.5*(M.gx*vgx[0]+M.gy*vgy[0]);
    const d=Math.abs(P.gx*vgx[0]+P.gy*vgy[0]);
    const mu0=Math.hypot(...S.mx,...S.my),mut=Math.hypot(...vgx,...vgy);
    const p0=Math.abs(A.v)+an*mu0+C+0.5*C*mu0*mu0,p1=an*mut+C*mu0*mut,p2=C*mut*mut/2;
    const tail=T=>{
      const shift=d/(2*c),u=T-shift;
      if(!(c>0&&u>0)) return {bound:Infinity,reason:'Linear Gaussian tail requires T beyond its shifted peak'};
      const e=Math.exp(-c*T*T+d*T),j0=e/(2*c*u),j1=e/(2*c),j2=e*(u/(2*c)+1/(4*c*c*u));
      const bound=Math.hypot(...S.value)/(PI*T)*(p0*j0+p1*(j1+shift*j0)+p2*(j2+2*shift*j1+shift*shift*j0));
      return {bound,gaussian:bound};
    };
    return {normalization,mask:M,amplitude:A,phase:P,full,F,integrand,atZero,smallTConstant,tail,classification:'linear',kappa:M.v};
  }
  // A conservative O(T^-1/2) tail for a rank-one mask without null-space drift.
  // Diagonal rank-one inputs give unambiguous exact zero coefficients; nearly
  // singular/full matrices are not silently reclassified as this case.
  if(M.hxy===0 && (M.hxx===0||M.hyy===0)) {
    const alongX=M.hxx!==0,nullDrift=alongX?M.gy:M.gx;
    if(nullDrift===0) {
      const hx=alongX?M.gx/M.hxx:0,hy=alongX?0:M.gy/M.hyy;
      const dn=Math.hypot(hx,hy,P.gx-P.hxx*hx-P.hxy*hy,P.gy-P.hxy*hx-P.hyy*hy);
      const a0=A.v-A.gx*hx-A.gy*hy+0.5*(A.hxx*hx*hx+2*A.hxy*hx*hy+A.hyy*hy*hy);
      const ag=Math.hypot(A.gx-A.hxx*hx-A.hxy*hy,A.gy-A.hxy*hx-A.hyy*hy);
      const amp=Math.abs(a0)+ag*dn+C+C*dn*dn/2;
      const tail=T=>{
        const delta=H-R/T;
        return {bound:delta>0?2*Math.exp(-(hx*hx+hy*hy)/2+dn*dn/2)*amp/(PI*Math.sqrt(delta*T)):Infinity,rate:'T^-1/2'};
      };
      return {normalization,mask:M,amplitude:A,phase:P,full,F,integrand,atZero,smallTConstant,tail,classification:'rank one, zero null drift',kappa:M.v-0.5*(M.gx*hx+M.gy*hy)};
    }
  }
  return {normalization,mask:M,amplitude:A,phase:P,full,F,integrand,atZero,smallTConstant,
    tail:()=>({bound:Infinity,reason:'No implemented bound for this singular/ill-conditioned mask with null drift'}),classification:'unsupported tail',kappa:M.v};
}

function gaussLegendre(n) {
  const result=[];
  for(let i=0;i<n;i++) {
    let z=Math.cos(PI*(i+0.75)/(n+0.5)),dp;
    for(let it=0;it<100;it++) {
      let p0=1,p1=z;
      for(let k=2;k<=n;k++) {const next=((2*k-1)*z*p1-(k-1)*p0)/k;p0=p1;p1=next;}
      dp=n*(z*p1-p0)/(z*z-1);const dz=p1/dp;z-=dz;
      if(Math.abs(dz)<1e-15) break;
    }
    result.push([z,2/((1-z*z)*dp*dp)]);
  }
  return result;
}
const GL16=gaussLegendre(16),GL32=gaussLegendre(32);

/** Finite quadrature is checked by two rules and optional refinement. The tail
 * formula is analytic, but neither f64 evaluation nor quadrature is certified.
 */
export function invertMask(term,{T=1024,absTol=1e-6,panelWidth=4,maxEvaluations=500000,maxDepth=12}={}) {
  if(!(T>0&&Number.isFinite(T)&&absTol>0&&Number.isFinite(absTol)&&panelWidth>0&&Number.isFinite(panelWidth))) throw new RangeError('Invalid inversion options');
  if(!Number.isSafeInteger(maxEvaluations)||maxEvaluations<1||!Number.isSafeInteger(maxDepth)||maxDepth<0) throw new RangeError('Invalid work limits');
  if(term.constantValue) return {value:term.constantValue,status:'constant mask',T:0,evaluations:0,panels:0,tailBound:0,quadratureEstimate:0,toleranceMetByEstimate:true};
  let evaluations=0,panels=0,error=0,smallTError=0,limited=false;
  const rule=(a,b,gl)=>{
    let result=[0,0];const h=(b-a)/2,c=a+h;
    for(const [x,w] of gl) {
      if(evaluations+2>maxEvaluations) throw new RangeError('Mask inversion evaluation budget exceeded');
      const t=c+h*x;const value=term.integrand(t);evaluations+=2;
      if(t<1e-7) smallTError+=Math.abs(h*w)*term.smallTConstant*t*t;
      result=add(result,scale(value,h*w));
    }
    return result;
  };
  const integrate=(a,b,depth)=>{
    const low=rule(a,b,GL16),high=rule(a,b,GL32),difference=norm(high[0]-low[0],high[1]-low[1]);
    if(difference>absTol*(b-a)/(8*T)&&depth<maxDepth) {
      const mid=a+(b-a)/2;
      return add(integrate(a,mid,depth+1),integrate(mid,b,depth+1));
    }
    if(difference>absTol*(b-a)/(8*T)) limited=true;
    panels++;error+=difference;return high;
  };
  let total=[0,0];
  const width=Math.min(panelWidth,PI/(2*Math.max(0.25,Math.abs(term.kappa))));
  for(let lo=0;lo<T;) {
    const hi=Math.min(T,lo+(lo<8?Math.min(width,0.25):width));
    total=add(total,integrate(lo,hi,0));lo=hi;
  }
  const tail=term.tail(T),value=add(scale(term.full,0.5),total);
  const roundoffEstimate=64*Number.EPSILON*evaluations*(1+norm(...term.full)+norm(...total));
  const estimatedError=tail.bound+error+smallTError+roundoffEstimate;
  return {value,T,evaluations,panels,tailBound:tail.bound,tailDetails:tail,quadratureEstimate:error,smallTBound:smallTError,roundoffEstimate,estimatedError,
    toleranceMetByEstimate:!limited&&estimatedError<=absTol,
    status:limited?'quadrature refinement limited':!Number.isFinite(tail.bound)?'tail unestablished':estimatedError<=absTol?'estimated target met, analytic tail bounded':'target not met',
    note:'Finite quadrature and floating-point allowances are estimates, not machine-certified error bounds.'};
}
