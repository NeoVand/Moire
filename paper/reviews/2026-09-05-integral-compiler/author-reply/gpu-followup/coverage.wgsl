// Bounded float32 Gaussian-chirp moment reference. No renderer dependencies.
// Parameters are STANDARDIZED: t=W/sigma, B=beta*sigma, Q=q*sigma^2.
// x = (center or finite halfline endpoint, halfWidth, B, Q).
// control = (mode, absolute tolerance per standardized moment, sign, reserved).
// mode: 0 finite center/halfWidth; 1 (-infinity,endpoint); 2 (endpoint,infinity);
//       3 full line. The sign is +1 or -1, allowing reversed original bounds.
// status: 0 estimated target met; 1 invalid/range; 2 work cap; 4 accuracy estimate.
// Error estimates are NOT certified WGSL floating-point bounds. See coverage-gpu.md.
struct CoverageInput { x: vec4f, control: vec4f }
struct CoverageResult {
  m01: vec4f,
  m2_bounds: vec4f, // M2 complex, max analytic truncation bound, max roundoff estimate
  errors: vec4f,   // estimated absolute errors j=0,1,2; unused
  diagnostics: vec4u, // status, panel count, coefficient count, mode
}

const COVERAGE_MAX_PANELS: u32 = 128u;
const COVERAGE_DEGREE: u32 = 16u;
const COVERAGE_L: f32 = 6.0;
const COVERAGE_EPS: f32 = 1.1920928955078125e-7;
const COVERAGE_INV_SQRT_TAU: f32 = 0.3989422804014327;

fn coverage_mul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x);
}
fn coverage_cis(phase: f32) -> vec2f {
  // |phase|<=1024 in the declared B,Q scope. The high pi/2 part has
  // sufficiently few bits that quadrant*high is exact in this range.
  // Avoid WGSL's much looser sin/cos/atan accuracy allowance, especially
  // native sin/cos outside [-pi,pi]. This is still not an f32 certificate.
  let quadrant=floor(phase*0.6366197723675814+0.5);
  let r=(phase-quadrant*1.5703125)-quadrant*0.0004838267948966192;
  let z=r*r;
  let s=r+r*z*(-0.16666666666666667+z*(0.008333333333333333+z*(-0.0001984126984126984+z*(0.0000027557319223985893-z*0.00000002505210838544172))));
  let c=1.0+z*(-0.5+z*(0.041666666666666664+z*(-0.001388888888888889+z*(0.0000248015873015873-z*0.0000002755731922398589))));
  switch(u32(i32(quadrant)&3)) {
    case 0u: { return vec2f(c,s); }
    case 1u: { return vec2f(-s,c); }
    case 2u: { return vec2f(-c,-s); }
    default: { return vec2f(s,-c); }
  }
}
fn coverage_tail(t: f32) -> vec3f {
  let p = exp(-0.5*t*t)*COVERAGE_INV_SQRT_TAU;
  return max(vec3f(p/t, p, (t+1.0/t)*p),vec3f(1e-37));
}
fn coverage_failure(status: u32, panels: u32, mode: u32) -> CoverageResult {
  return CoverageResult(vec4f(0.0), vec4f(0.0), vec4f(1e30), vec4u(status,panels,0u,mode));
}

fn coverage_moments(input: CoverageInput) -> CoverageResult {
  let B=input.x.z; let Q=input.x.w;
  let tolerance=input.control.y; let orientation=input.control.z;
  if (!(abs(B)<=64.0 && abs(Q)<=16.0 && tolerance>0.0 && tolerance<=1.0
      && abs(input.x.x)<=1e10 && input.x.y>=0.0 && input.x.y<=1e10
      && input.control.x>=0.0 && input.control.x<=3.0
      && (orientation==1.0 || orientation == -1.0))) {
    return coverage_failure(1u,0u,0u);
  }
  let mode=u32(input.control.x);
  if (f32(mode)!=input.control.x) { return coverage_failure(1u,0u,mode); }
  if (mode==3u) {
    let den=1.0+Q*Q;
    let inv=vec2f(1.0,Q)/den;
    let rootDen=sqrt(den);
    let rootReal=sqrt(0.5*(rootDen+1.0));
    let inverseRoot=vec2f(rootReal,Q/(2.0*rootReal))/rootDen;
    let phase=-0.5*B*B*Q/den;
    let m0=exp(-0.5*B*B/den)*coverage_mul(inverseRoot,coverage_cis(phase));
    let m1=coverage_mul(vec2f(-B*inv.y,B*inv.x),m0);
    let m2=coverage_mul(inv-B*B*coverage_mul(inv,inv),m0);
    let roundoff=vec3f(1e-33)+32.0*COVERAGE_EPS*(1.0+B*B/den+abs(B*B*Q/den))
      *vec3f(length(m0),length(m1),length(m2));
    let status=select(0u,4u,any(roundoff>vec3f(tolerance)));
    return CoverageResult(orientation*vec4f(m0,m1),vec4f(orientation*m2,0.0,max(roundoff.x,max(roundoff.y,roundoff.z))),
      vec4f(roundoff,0.0),vec4u(status,0u,0u,mode));
  }

  var center=input.x.x;
  var halfWidth=input.x.y;
  var tail=vec3f(0.0);
  if (mode==1u) {
    if (center<=-COVERAGE_L) {
      tail=coverage_tail(max(COVERAGE_L,-center));
      let status=select(0u,4u,any(tail>vec3f(tolerance)));
      return CoverageResult(vec4f(0.0),vec4f(0.0,0.0,max(tail.x,max(tail.y,tail.z)),0.0),vec4f(tail,0.0),vec4u(status,0u,0u,mode));
    }
    tail=coverage_tail(COVERAGE_L);
    if (center>COVERAGE_L) { tail*=2.0; }
    halfWidth=0.5*(min(center,COVERAGE_L)+COVERAGE_L);
    center=-COVERAGE_L+halfWidth;
  } else if (mode==2u) {
    if (center>=COVERAGE_L) {
      tail=coverage_tail(max(COVERAGE_L,center));
      let status=select(0u,4u,any(tail>vec3f(tolerance)));
      return CoverageResult(vec4f(0.0),vec4f(0.0,0.0,max(tail.x,max(tail.y,tail.z)),0.0),vec4f(tail,0.0),vec4u(status,0u,0u,mode));
    }
    tail=coverage_tail(COVERAGE_L);
    if (center< -COVERAGE_L) { tail*=2.0; }
    halfWidth=0.5*(COVERAGE_L-max(center,-COVERAGE_L));
    center=COVERAGE_L-halfWidth;
  } else if (halfWidth==0.0) {
    return CoverageResult(vec4f(0.0),vec4f(0.0),vec4f(0.0),vec4u(0u));
  } else {
    let left=center-halfWidth; let right=center+halfWidth;
    if (left< -COVERAGE_L) { tail+=coverage_tail(max(COVERAGE_L,-right)); }
    if (right>COVERAGE_L) { tail+=coverage_tail(max(COVERAGE_L,left)); }
    if (right< -COVERAGE_L || left>COVERAGE_L) {
      let status=select(0u,4u,any(tail>vec3f(tolerance)));
      return CoverageResult(vec4f(0.0),vec4f(0.0,0.0,max(tail.x,max(tail.y,tail.z)),0.0),vec4f(tail,0.0),vec4u(status,0u,0u,mode));
    }
    if (left< -COVERAGE_L || right>COVERAGE_L) {
      halfWidth=0.5*(min(right,COVERAGE_L)-max(left,-COVERAGE_L));
      center=max(left,-COVERAGE_L)+halfWidth;
    }
    // Otherwise preserve halfWidth, even when center +/- halfWidth rounds equal.
  }
  let left=center-halfWidth; let right=center+halfWidth;
  let H=length(vec2f(1.0,Q));
  let maxA=max(length(vec2f(left,B+Q*left)),length(vec2f(right,B+Q*right)));
  let maxHalfWidth=1.0/(maxA+sqrt(maxA*maxA+H));
  let requested=max(1.0,ceil(halfWidth/maxHalfWidth));
  if (requested>f32(COVERAGE_MAX_PANELS)) { return coverage_failure(2u,u32(requested),mode); }
  let panels=u32(requested);
  let h=halfWidth/f32(panels);
  var m0=vec2f(0.0); var m1=vec2f(0.0); var m2=vec2f(0.0);
  var compensation0=vec2f(0.0); var compensation1=vec2f(0.0); var compensation2=vec2f(0.0);
  var analytic=tail; var roundoff=vec3f(0.0);
  for(var panel=0u;panel<COVERAGE_MAX_PANELS;panel++) {
    if(panel>=panels) { break; }
    let c=center+halfWidth*(2.0*(f32(panel)+0.5)/f32(panels)-1.0);
    let alpha=h*vec2f(-c,B+Q*c);
    let gamma=0.5*h*h*vec2f(-1.0,Q);
    var prev=vec2f(1.0,0.0); var prev2=vec2f(0.0);
    var i0=vec2f(0.0); var i1=vec2f(0.0); var i2=vec2f(0.0);
    for(var n=0u;n<=COVERAGE_DEGREE;n++) {
      var d=prev;
      if(n>0u) {
        d=(coverage_mul(alpha,prev)+2.0*coverage_mul(gamma,prev2))/f32(n);
        prev2=prev; prev=d;
      }
      if(n%2u==0u) { i0+=2.0*d/f32(n+1u); i2+=2.0*d/f32(n+3u); }
      else { i1+=2.0*d/f32(n+2u); }
    }
    let prefactor=h*exp(-0.5*c*c)*COVERAGE_INV_SQRT_TAU;
    let phase=B*c+0.5*Q*c*c;
    let rotation=prefactor*coverage_cis(phase);
    let y0=coverage_mul(rotation,i0)-compensation0;
    let y1=coverage_mul(rotation,c*i0+h*i1)-compensation1;
    let y2=coverage_mul(rotation,c*c*i0+2.0*c*h*i1+h*h*i2)-compensation2;
    let t0=m0+y0; let t1=m1+y1; let t2=m2+y2;
    compensation0=(t0-m0)-y0; compensation1=(t1-m1)-y1; compensation2=(t2-m2)-y2;
    m0=t0; m1=t1; m2=t2;
    let radius=abs(c)+h;
    let mass=2.0*prefactor*vec3f(1.0,radius,radius*radius);
    // Cauchy radius 4: sum_(n>N)|d_n| <= exp(4|alpha|+16|gamma|)*4^-N/3.
    analytic+=mass*exp(4.0*length(alpha)+16.0*length(gamma))*7.761021455128987e-11;
    roundoff+=8.0*COVERAGE_EPS*(f32(COVERAGE_DEGREE)+8.0+abs(B*c)+abs(0.5*Q*c*c))
      *mass*exp(length(alpha)+length(gamma));
  }
  let errors=analytic+roundoff;
  let status=select(0u,4u,any(errors>vec3f(tolerance)));
  return CoverageResult(orientation*vec4f(m0,m1),vec4f(orientation*m2,max(analytic.x,max(analytic.y,analytic.z)),max(roundoff.x,max(roundoff.y,roundoff.z))),
    vec4f(errors,0.0),vec4u(status,panels,panels*(COVERAGE_DEGREE+1u),mode));
}

@group(0) @binding(0) var<storage,read> coverage_inputs: array<CoverageInput>;
@group(0) @binding(1) var<storage,read_write> coverage_outputs: array<CoverageResult>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if(id.x>=arrayLength(&coverage_inputs)) { return; }
  coverage_outputs[id.x]=coverage_moments(coverage_inputs[id.x]);
}
