// CPU float32 mirror of bessel.wgsl. No compiler/app dependencies.
export const MAX_ORDER = 42;
export const MAX_ARGUMENT = 40;
const f = Math.fround;
const add = (a,b) => f(f(a)+f(b));
const sub = (a,b) => f(f(a)-f(b));
const mul = (a,b) => f(f(a)*f(b));
const div = (a,b) => f(f(a)/f(b));

function check(x,n=0) {
  if(!Number.isFinite(x)||Math.abs(x)>40||!Number.isInteger(n)||Math.abs(n)>42) throw new RangeError('Bessel domain: finite |x|<=40, integer |n|<=42');
}
const signOrder = (v,n) => n<0&&Math.abs(n)%2 ? -v : v;
export function tableJ(table,n,argument) {
  const x=f(argument);check(x,n);
  const ax=Math.abs(x), an=Math.abs(n);
  // Avoid x/2 + 0.5: addition near a segment midpoint can round across it.
  let cell=Math.trunc(mul(ax,.5));
  if(sub(ax,2*cell)>1) cell++;
  const h=sub(ax,2*cell), base=(cell*43+an)*13;
  let p=table[base+12];
  for(let d=11;d>=0;d--) p=add(mul(p,h),table[base+d]);
  if((n<0)!==(x<0) && an%2) p=-p;
  return p;
}

export function millerRow(argument) {
  const x=f(argument);check(x);
  const ax=Math.abs(x), row=new Float32Array(43);
  if(ax<.25) {
    const z=mul(mul(ax,ax),-.25);
    let lead=1;
    for(let n=0;n<=42;n++) {
      if(n>0) lead=div(mul(lead,mul(ax,.5)),n);
      let term=1, sum=1;
      for(let k=1;k<=4;k++) {term=mul(term,div(z,k*(n+k)));sum=add(sum,term);}
      row[n]=mul(lead,sum);
    }
  } else {
    let current=1, following=0, evenSum=2;
    const inv=div(1,ax);
    // Fixed order80 protects requested orders0..42 for |x|<=40.
    // The fixed start is empirically validated here, not a uniform Miller
    // termination+roundoff certificate. Taylor provider carries that bound.
    for(let j=80;j>0;j--) {
      let previous=sub(mul(mul(2*j,inv),current),following);
      if(Math.abs(previous)>2**60) {
        previous=mul(previous,2**-60); current=mul(current,2**-60);
        following=mul(following,2**-60); evenSum=mul(evenSum,2**-60);
        for(let n=j;n<=42;n++) row[n]=mul(row[n],2**-60);
      }
      const n=j-1;
      if(n<=42) row[n]=previous;
      if(n%2===0) evenSum=add(evenSum,mul(previous,n===0?1:2));
      following=current;current=previous;
    }
    for(let n=0;n<=42;n++) row[n]=div(row[n],evenSum);
  }
  if(x<0) for(let n=1;n<=42;n+=2) row[n]=-row[n];
  return row;
}
export function rowJ(row,n) {return signOrder(row[Math.abs(n)],n);}
export function jetFrom(get,n) {
  if(!Number.isInteger(n)||Math.abs(n)>40) throw new RangeError('Q derivatives require |n|<=40');
  return new Float32Array([get(n),mul(sub(get(n-1),get(n+1)),.5),
    mul(add(sub(get(n-2),mul(2,get(n))),get(n+2)),.25)]);
}
export function tableJet(table,n,x) {return jetFrom(k=>tableJ(table,k,x),n);}
export function tableRow(table,x) {return Float32Array.from({length:43},(_,n)=>tableJ(table,n,x));}
export function millerJet(n,x) {const row=millerRow(x);return jetFrom(k=>rowJ(row,k),n);}
