// Integer Bessel J: finite |x|<=40; J orders |n|<=42, jet orders |n|<=40.
// Invalid arguments return status=0. x is the already-formed Bessel argument.
// Taylor table binding is optional if only bessel_miller_row is used.
// Storage contains little-endian floats [centerIndex][absOrder][power].
@group(0) @binding(0) var<storage, read> bessel_coefficients: array<f32>;

struct BesselValue { value: f32, valid: u32 }
struct BesselJet { q: f32, d1: f32, d2: f32, valid: u32 }
struct BesselRow { values: array<f32,43>, valid: u32 }

fn bessel_table(n: i32, x: f32) -> BesselValue {
  // Host must reject nonfinite x: WGSL finite-math rules do not provide a
  // portable runtime NaN/Infinity rejection contract.
  if (n < -42i || n > 42i || abs(x)>40.0) { return BesselValue(0.0,0u); }
  let ax=abs(x);
  let an=u32(abs(n));
  var cell=u32(ax*0.5);
  if (ax-f32(2u*cell)>1.0) { cell+=1u; }
  let h=ax-f32(2u*cell);
  let base=(cell*43u+an)*13u;
  var value=bessel_coefficients[base+12u];
  for (var d=11i;d>=0i;d-=1i) {
    // The arithmetic certificate concerns this Horner graph. fma is not
    // required to be fused by WGSL; allowing separate operations is safe.
    value=value*h+bessel_coefficients[base+u32(d)];
  }
  if ((n<0i)!=(x<0.0) && (an&1u)==1u) { value=-value; }
  return BesselValue(value,1u);
}

fn bessel_table_row(x: f32) -> BesselRow {
  var out: BesselRow;
  if (abs(x)>40.0) { return out; }
  for (var n=0u;n<=42u;n+=1u) { out.values[n]=bessel_table(i32(n),x).value; }
  out.valid=1u;
  return out;
}

fn bessel_miller_row(x: f32) -> BesselRow {
  var out: BesselRow;
  if (abs(x)>40.0) { return out; }
  let ax=abs(x);
  if (ax<0.25) {
    let z=ax*ax*(-0.25);
    var leading=1.0;
    for (var n=0u;n<=42u;n+=1u) {
      if (n>0u) { leading=(leading*(ax*0.5))/f32(n); }
      var term=1.0;
      var sum=1.0;
      for (var k=1u;k<=4u;k+=1u) {
        term=term*(z/f32(k*(n+k)));
        sum=sum+term;
      }
      out.values[n]=leading*sum;
    }
  } else {
    var current=1.0;
    var following=0.0;
    var even_sum=2.0;
    let inverse=1.0/ax;
    for (var j=80i;j>0i;j-=1i) {
      var previous=(f32(2i*j)*inverse)*current-following;
      if (abs(previous)>1152921504606846976.0) {
        // Exact powers of two preserve the ratio while keeping the recurrence
        // far from overflow. Previously stored row values must scale too.
        previous=previous*8.673617379884035e-19;
        current=current*8.673617379884035e-19;
        following=following*8.673617379884035e-19;
        even_sum=even_sum*8.673617379884035e-19;
        for (var n=j;n<=42i;n+=1i) {out.values[u32(n)]=out.values[u32(n)]*8.673617379884035e-19;}
      }
      let n=j-1i;
      if (n<=42i) {out.values[u32(n)]=previous;}
      if ((n&1i)==0i) {even_sum=even_sum+previous*select(2.0,1.0,n==0i);}
      following=current;
      current=previous;
    }
    for (var n=0u;n<=42u;n+=1u) {out.values[n]=out.values[n]/even_sum;}
  }
  if (x<0.0) {for(var n=1u;n<=42u;n+=2u){out.values[n]=-out.values[n];}}
  out.valid=1u;
  return out;
}

fn bessel_row_at(row: BesselRow,n: i32) -> f32 {
  let value=row.values[u32(abs(n))];
  return select(value,-value,n<0i && (abs(n)&1i)==1i);
}
fn bessel_table_jet(n: i32,x: f32) -> BesselJet {
  if(n < -40i || n > 40i || abs(x)>40.0){return BesselJet(0.0,0.0,0.0,0u);}
  let q=bessel_table(n,x).value;
  let d1=(bessel_table(n-1i,x).value-bessel_table(n+1i,x).value)*0.5;
  let d2=((bessel_table(n-2i,x).value-2.0*q)+bessel_table(n+2i,x).value)*0.25;
  return BesselJet(q,d1,d2,1u);
}
fn bessel_row_jet(row: BesselRow,n: i32) -> BesselJet {
  if(n < -40i || n > 40i || row.valid==0u){return BesselJet(0.0,0.0,0.0,0u);}
  let q=bessel_row_at(row,n);
  let d1=(bessel_row_at(row,n-1i)-bessel_row_at(row,n+1i))*0.5;
  let d2=((bessel_row_at(row,n-2i)-2.0*q)+bessel_row_at(row,n+2i))*0.25;
  return BesselJet(q,d1,d2,1u);
}
