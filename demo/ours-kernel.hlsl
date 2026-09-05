// Generated from demo/ours-kernel.wgsl.js: the same kernel in HLSL.
static const float OURS_TAU = 6.283185307179586;
static const float OURS_PI = 3.141592653589793;

// erf, Abramowitz and Stegun 7.1.26 (|error| < 1.5e-7)
float erfA(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}
float Phi(float x) { return 0.5 * (1.0 + erfA(x * 0.7071067811865476)); }
// the unit square wave, +1 where fract < 1/2
float wOf(float u) { return ((frac(u) < 0.5) ? (1.0) : (-1.0)); }

// Re E[exp(i (phi0 + b . x + x^T Q x / 2))], x ~ N(0, S I): the multiplier
// theorem at second order in closed form
float multRe(float phi0, float2 b, float3 q, float S) {
  float tr = q.x + q.z;
  float dt = q.x * q.z - q.y * q.y;
  float disc = sqrt(max(0.25 * tr * tr - dt, 0.0));
  float l1 = 0.5 * tr + disc;
  float l2 = 0.5 * tr - disc;
  float modu = pow((1.0 + S * S * l1 * l1) * (1.0 + S * S * l2 * l2), -0.25);
  float ph = 0.5 * (atan(S * l1) + atan(S * l2));
  // b^T adj(I - i S Q) b / det, adj = [[1 - i S q11, i S q01], [i S q01, 1 - i S q00]]
  float Ar = b.x * b.x + b.y * b.y;
  float Ai = -S * (q.z * b.x * b.x - 2.0 * q.y * b.x * b.y + q.x * b.y * b.y);
  float Dr = 1.0 - S * S * dt;
  float Di = -S * tr;
  float dd = Dr * Dr + Di * Di;
  float Er = -0.5 * S * (Ar * Dr + Ai * Di) / dd;
  float Ei = -0.5 * S * (Ai * Dr - Ar * Di) / dd;
  return modu * exp(Er) * cos(phi0 + ph + Ei);
}

struct Jets { float u0; float v0; float2 gu; float2 gv; float3 Hu; float3 Hv; };
// exact jets of the two counts from a homography: (Nu, Nv, D) = (hu, hv, hd) . (x, y, 1),
// counts (Nu, Nv) / D / period; the caller's pixel-centre convention is in (x, y)
Jets jetsFromHomography(float3 hu, float3 hv, float3 hd, float x, float y, float period) {
  float3 p = float3(x, y, 1.0);
  float Nu = dot(hu, p);
  float Nv = dot(hv, p);
  float D = dot(hd, p);
  float2 dD = hd.xy;
  Jets J;
  J.u0 = Nu / D / period;
  J.v0 = Nv / D / period;
  float2 gu = (hu.xy * D - Nu * dD) / (D * D);
  float2 gv = (hv.xy * D - Nv * dD) / (D * D);
  J.gu = gu / period;
  J.gv = gv / period;
  J.Hu = float3(-2.0 * dD.x * gu.x / D, -(dD.y * gu.x + dD.x * gu.y) / D, -2.0 * dD.y * gu.y / D) / period;
  J.Hv = float3(-2.0 * dD.x * gv.x / D, -(dD.y * gv.x + dD.x * gv.y) / D, -2.0 * dD.y * gv.y / D) / period;
  return J;
}

// the lattice of recipes k gu + l gv, Lagrange-Gauss reduced: (k, l) = m T0 + n T1
struct Lattice { float2 b1; float2 b2; float2 T0; float2 T1; };
Lattice reduceLattice(float2 gu, float2 gv) {
  Lattice L;
  L.b1 = gu;
  L.b2 = gv;
  L.T0 = float2(1.0, 0.0);
  L.T1 = float2(0.0, 1.0);
  for (int it = 0; it < 12; it++) {
    if (dot(L.b1, L.b1) > dot(L.b2, L.b2)) {
      float2 tb = L.b1; L.b1 = L.b2; L.b2 = tb;
      float2 tT = L.T0; L.T0 = L.T1; L.T1 = tT;
    }
    float m = round(dot(L.b1, L.b2) / max(dot(L.b1, L.b1), 1e-30));
    if (m == 0.0) { break; }
    L.b2 = L.b2 - m * L.b1;
    L.T1 = L.T1 - m * L.T0;
  }
  return L;
}
// the reach in cycles per pixel of the lattice enumeration, grown by the
// curvature the recipes can reach
float latticeReach(Jets J, float S) {
  float fu = sqrt(J.Hu.x * J.Hu.x + 2.0 * J.Hu.y * J.Hu.y + J.Hu.z * J.Hu.z);
  float fv = sqrt(J.Hv.x * J.Hv.x + 2.0 * J.Hv.y * J.Hv.y + J.Hv.z * J.Hv.z);
  float lam = OURS_TAU * (fu + fv) * 8.0;
  return min(1.6 * sqrt(1.0 + S * S * lam * lam), 12.0);
}

// the checkerboard's spectral path: 1/2 - (2 / pi^2) sum over odd (k, l) of
// Re E[e^{2 pi i (k u + l v)}] / (k l) over the reduced lattice within reach
float checkerSpectral(Jets J, float S) {
  Lattice L = reduceLattice(J.gu, J.gv);
  float R = latticeReach(J, S);
  float n1 = length(L.b1);
  float perp = sqrt(max(dot(L.b2, L.b2) - dot(L.b1, L.b2) * dot(L.b1, L.b2) / dot(L.b1, L.b1), 1e-30));
  float nMax = floor(R / perp);
  float acc = 0.5;
  float count = 0.0;
  float n = -nMax;
  while (true) {
    if (n > nMax) { break; }
    float2 c = n * L.b2;
    float mStar = -dot(c, L.b1) / dot(L.b1, L.b1);
    float hw = sqrt(max(R * R - n * n * perp * perp, 0.0)) / n1;
    float m = ceil(mStar - hw);
    float mEnd = floor(mStar + hw);
    while (true) {
      if (m > mEnd) { break; }
      float2 kl = m * L.T0 + n * L.T1;
      float k = kl.x;
      float l = kl.y;
      bool ok = (abs(k - 2.0 * round(0.5 * (k - 1.0)) - 1.0) < 0.5) && (abs(l - 2.0 * round(0.5 * (l - 1.0)) - 1.0) < 0.5);
      if (ok) {
        float coef = -2.0 / (OURS_PI * OURS_PI * k * l);
        float2 bb = OURS_TAU * (k * J.gu + l * J.gv);
        float3 qq = OURS_TAU * (k * J.Hu + l * J.Hv);
        float phi0 = OURS_TAU * (k * J.u0 + l * J.v0);
        acc += coef * multRe(phi0, bb, qq, S);
        count += 1.0;
      }
      m += 1.0;
      if (count > 2048.0) { break; }
    }
    n += 1.0;
    if (count > 2048.0) { break; }
  }
  return acc;
}

static const float DISC_R = 0.4166666666666667; // 25/3 over the cell 20

// J1(x)/x, the disc's coefficient shape (Numerical Recipes rational forms, |err| ~ 1e-8)
float j1overx(float x) {
  float ax = abs(x);
  if (ax < 1e-3) { return 0.5 - x * x / 16.0; }
  if (ax < 8.0) {
    float y = x * x;
    float num = 72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606)))));
    float den = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den; // J1(x) = x * num / den
  }
  float z = 8.0 / ax;
  float y = z * z;
  float xx = ax - 2.356194491;
  float p1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  float p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  float j1 = sqrt(0.636619772 / ax) * (cos(xx) * p1 - z * sin(xx) * p2);
  return j1 / ax; // even in x
}
// the circles' spectral path: the disc's series over the reduced lattice,
// coefficient (-1)^(k + l) rho J1(2 pi rho |kappa|) / |kappa|, DC pi rho^2
float circlesSpectral(Jets J, float S) {
  Lattice L = reduceLattice(J.gu, J.gv);
  float R = latticeReach(J, S);
  float n1 = length(L.b1);
  float perp = sqrt(max(dot(L.b2, L.b2) - dot(L.b1, L.b2) * dot(L.b1, L.b2) / dot(L.b1, L.b1), 1e-30));
  float nMax = floor(R / perp);
  float acc = 0.0;
  float count = 0.0;
  float n = -nMax;
  while (true) {
    if (n > nMax) { break; }
    float2 c = n * L.b2;
    float mStar = -dot(c, L.b1) / dot(L.b1, L.b1);
    float hw = sqrt(max(R * R - n * n * perp * perp, 0.0)) / n1;
    float m = ceil(mStar - hw);
    float mEnd = floor(mStar + hw);
    while (true) {
      if (m > mEnd) { break; }
      float2 kl = m * L.T0 + n * L.T1;
      float k = kl.x;
      float l = kl.y;
      float kap = OURS_TAU * DISC_R * sqrt(k * k + l * l);
      float coef = OURS_TAU * DISC_R * DISC_R * j1overx(kap);
      float parity = k + l - 2.0 * floor(0.5 * (k + l));
      if (parity > 0.5) { coef = -coef; }
      float2 bb = OURS_TAU * (k * J.gu + l * J.gv);
      float3 qq = OURS_TAU * (k * J.Hu + l * J.Hv);
      float phi0 = OURS_TAU * (k * J.u0 + l * J.v0);
      acc += coef * multRe(phi0, bb, qq, S);
      count += 1.0;
      m += 1.0;
      if (count > 2048.0) { break; }
    }
    n += 1.0;
    if (count > 2048.0) { break; }
  }
  return acc;
}

// the probability under N(0, sigma^2) of the set where lin/2 y^2 + b y + c <= 0
float innerProb(float lin, float b, float c, float sig) {
  if (abs(lin) < 1e-9) {
    if (abs(b) < 1e-12) { return ((c <= 0.0) ? (1.0) : (0.0)); }
    float y = -c / b;
    return ((b > 0.0) ? (Phi(y / sig)) : (1.0 - Phi(y / sig)));
  }
  float D = b * b - 2.0 * lin * c;
  if (D <= 0.0) { return ((lin < 0.0) ? (1.0) : (0.0)); }
  float sq = sqrt(D);
  float y1 = (-b - sq) / lin;
  float y2 = (-b + sq) / lin;
  float p = Phi(max(y1, y2) / sig) - Phi(min(y1, y2) / sig);
  return ((lin > 0.0) ? (p) : (1.0 - p));
}
// P(q(X) <= 0), X ~ N(0, S I), q(x) = a0 + g . x + x^T H x / 2, exact up to
// quadrature: the outer coordinate along the gradient's perpendicular when
// the linear term dominates over the pixel, else the Hessian's eigenframe;
// the inner interval is between the roots of a quadratic; the outer integral
// is split where the discriminant changes sign, in panels of two sigma,
// Gauss-Legendre 8, with the panels that end at a root mapped so the root's
// square-root behaviour is smooth
float quadRegion(float a0, float2 g, float3 H, float S) {
  float sig = sqrt(S);
  float gn = length(g);
  float hn = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
  float2 ein = float2(1.0, 0.0);
  if (gn > 0.5 * hn * sig && gn > 1e-20) {
    ein = g / gn;
  } else {
    float tr = H.x + H.z;
    float dt = H.x * H.z - H.y * H.y;
    float disc = sqrt(max(0.25 * tr * tr - dt, 0.0));
    float l1 = 0.5 * tr + disc;
    if (abs(H.y) > 1e-12) { ein = normalize(float2(l1 - H.z, H.y)); }
    else if (H.z > H.x) { ein = float2(0.0, 1.0); }
  }
  float2 eout = float2(-ein.y, ein.x);
  float lin = H.x * ein.x * ein.x + 2.0 * H.y * ein.x * ein.y + H.z * ein.y * ein.y;
  float lout = H.x * eout.x * eout.x + 2.0 * H.y * eout.x * eout.y + H.z * eout.y * eout.y;
  float lmix = H.x * ein.x * eout.x + H.y * (ein.x * eout.y + ein.y * eout.x) + H.z * ein.y * eout.y;
  float gin = dot(g, ein);
  float gout = dot(g, eout);
  float L = 5.5 * sig;
  // the discriminant D(t) = (gin + lmix t)^2 - 2 lin (a0 + gout t + lout t^2 / 2), a quadratic in t; its roots cut the range
  float A = lmix * lmix - lin * lout;
  float B = 2.0 * gin * lmix - 2.0 * lin * gout;
  float C = gin * gin - 2.0 * lin * a0;
  float c1 = L; // the inner cuts, sorted, L when absent
  float c2 = L;
  if (abs(lin) > 1e-9) {
    if (abs(A) > 1e-12) {
      float dd = B * B - 4.0 * A * C;
      if (dd > 0.0) {
        float sq = sqrt(dd);
        float r1 = min((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        float r2 = max((-B - sq) / (2.0 * A), (-B + sq) / (2.0 * A));
        if (r1 > -L && r1 < L) { c1 = r1; }
        if (r2 > -L && r2 < L) { if (c1 < L) { c2 = r2; } else { c1 = r2; } }
      }
    } else if (abs(B) > 1e-12) {
      float rr = -C / B;
      if (rr > -L && rr < L) { c1 = rr; }
    }
  }
  float acc = 0.0;
  for (int seg = 0; seg < 3; seg++) {
    float a = ((seg == 2) ? (c2) : (((seg == 1) ? (c1) : (-L))));
    float b = ((seg == 2) ? (L) : (((seg == 1) ? (c2) : (c1))));
    if (b - a < 1e-9) { continue; }
    float tm = 0.5 * (a + b);
    float Dm = (gin + lmix * tm) * (gin + lmix * tm) - 2.0 * lin * (a0 + gout * tm + 0.5 * lout * tm * tm);
    if (abs(lin) > 1e-9 && Dm <= 0.0 && lin > 0.0) { continue; } // the region is empty here
    bool rootA = seg > 0 && a > -L;
    bool rootB = b < L;
    float panels = ceil((b - a) / (2.0 * sig));
    float dz = (b - a) / panels;
    float q = 0.0;
    while (true) {
      if (q >= panels) { break; }
      float pa = a + q * dz;
      float half = 0.5 * dz;
      float mid = pa + half;
      bool mapA = rootA && q < 0.5;
      bool mapB = rootB && q > panels - 1.5;
    {
      float x = 0.9602898565;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.1012285363 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = 0.7966664774;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.2223810345 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = 0.5255324099;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.3137066459 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = 0.1834346425;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.3626837834 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = -0.1834346425;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.3626837834 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = -0.5255324099;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.3137066459 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = -0.7966664774;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.2223810345 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
    {
      float x = -0.9602898565;
      float t = mid + half * x;
      float jac = half;
      if (mapA && mapB) { t = mid + half * sin(0.5 * OURS_PI * x); jac = half * 0.5 * OURS_PI * cos(0.5 * OURS_PI * x); }
      else if (mapA) { float sN = 0.5 * (x + 1.0); t = pa + dz * sN * sN; jac = dz * sN; }
      else if (mapB) { float sN = 0.5 * (1.0 - x); t = pa + dz - dz * sN * sN; jac = dz * sN; }
      float phi = 0.3989422804014327 * exp(-0.5 * t * t / S) / sig;
      acc += 0.1012285363 * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
    }
      q += 1.0;
    }
  }
  return acc;
}
// P(X > h, Y > k) for standard normals with correlation r: Genz 2004 for
// |r| <= 0.925 (six nodes below 0.3, twelve above), the conditional integral
// split at its transition beyond
float bvnu(float h, float k, float r) {
  float hk = h * k;
  float hs = 0.5 * (h * h + k * k);
  float asr = asin(r);
  float bvn = 0.0;
  if (abs(r) < 0.3) {
  { float sn = sin(0.9662347571 * asr); bvn += 0.1713244924 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.8306046932 * asr); bvn += 0.3607615730 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.6193095930 * asr); bvn += 0.4679139346 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.3806904070 * asr); bvn += 0.4679139346 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.1693953068 * asr); bvn += 0.3607615730 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.03376524290 * asr); bvn += 0.1713244924 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  } else {
  { float sn = sin(0.9907803171 * asr); bvn += 0.04717533639 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.9520586282 * asr); bvn += 0.1069393260 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.8849513371 * asr); bvn += 0.1600783285 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.7936589771 * asr); bvn += 0.2031674267 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.6839157495 * asr); bvn += 0.2334925365 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.5626167043 * asr); bvn += 0.2491470458 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.4373832957 * asr); bvn += 0.2491470458 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.3160842505 * asr); bvn += 0.2334925365 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.2063410229 * asr); bvn += 0.2031674267 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.1150486629 * asr); bvn += 0.1600783285 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.04794137181 * asr); bvn += 0.1069393260 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  { float sn = sin(0.009219682877 * asr); bvn += 0.04717533639 * exp((sn * hk - hs) / (1.0 - sn * sn)); }
  }
  return bvn * asr / (2.0 * OURS_TAU) + Phi(-h) * Phi(-k);
}
float bvnuHigh(float h, float k, float r) {
  float s = sqrt(max(1.0 - r * r, 1e-14));
  float xs = k / r;
  float halfw = 6.0 * s / abs(r);
  float a = xs - halfw;
  float b = xs + halfw;
  float acc = 0.0;
  if (b > h) {
    float lo = max(h, a);
    if (r > 0.0) { acc += Phi(-max(b, h)); }
    else if (a > h) { acc += Phi(-h) - Phi(-a); }
    if (lo < b) {
      float hw = 0.5 * (b - lo);
      float mid = 0.5 * (b + lo);
  { float xx = mid + hw * 0.9894009350; acc += 0.02715245941 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.9445750231; acc += 0.06225352394 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.8656312024; acc += 0.09515851168 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.7554044084; acc += 0.1246289713 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.6178762444; acc += 0.1495959888 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.4580167777; acc += 0.1691565194 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.2816035508; acc += 0.1826034150 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * 0.09501250984; acc += 0.1894506105 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.09501250984; acc += 0.1894506105 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.2816035508; acc += 0.1826034150 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.4580167777; acc += 0.1691565194 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.6178762444; acc += 0.1495959888 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.7554044084; acc += 0.1246289713 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.8656312024; acc += 0.09515851168 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.9445750231; acc += 0.06225352394 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
  { float xx = mid + hw * -0.9894009350; acc += 0.02715245941 * hw * 0.3989422804014327 * exp(-0.5 * xx * xx) * Phi(-(k - r * xx) / s); }
    }
  } else {
    acc = ((r > 0.0) ? (Phi(-h)) : (0.0));
  }
  return acc;
}
float bvnuAny(float h, float k, float r) {
  float rc = clamp(r, -0.999999, 0.999999);
  if (abs(rc) <= 0.925) { return bvnu(h, k, rc); }
  return bvnuHigh(h, k, rc);
}

// ---------------------------------------------------------------------------
// the homography entry points
// ---------------------------------------------------------------------------
// the edge list of a rational-linear count is not stored: the edges are
// re-derived per pair from the half-integer index h, u(X) - b =
// (delta + (g + delta r) . X) / (1 + r . X), b = h / 2
struct EdgeRange { float hlo; float hhi; float low; bool ok; };
EdgeRange edgeRange(float u0, float2 g, float2 r, float sig) {
  EdgeRange E;
  E.ok = true;
  E.low = wOf(u0);
  E.hlo = 1.0;
  E.hhi = 0.0;
  float L = 5.5;
  float denom = 1.0 - L * sig * length(r);
  if (denom <= 0.05) { E.ok = false; return E; }
  float reach = L * sig * length(g) / denom;
  // a count beyond 2^20 periods has no sub-period precision in float32 for
  // any method: the picture is not representable there
  if (abs(u0) > 1048576.0) { E.ok = false; return E; }
  float hlo = ceil(2.0 * (u0 - reach));
  float hhi = floor(2.0 * (u0 + reach));
  if (hhi - hlo > 9.0) { E.ok = false; return E; }
  // the edges actually within reach; the value of w below the lowest of
  // them follows from that edge's parity (an integer edge jumps -1 to +1,
  // a half-integer edge +1 to -1), with no epsilon, so it holds at any
  // distance from the origin in float32
  float count = 0.0;
  float first = 1e30;
  float last = -1e30;
  int nh = int(hhi - hlo) + 1; // the loops run on integer counters: a float step can stall at large phases
  for (int ih = 0; ih < nh; ih++) {
    float h = hlo + float(ih);
    float b = 0.5 * h;
    float delta = u0 - b;
    float2 n = g + delta * r;
    float dist = delta / max(length(n), 1e-30);
    if (abs(dist) < L * sig) {
      count += 1.0;
      first = min(first, h);
      last = max(last, h);
    }
  }
  if (count > 5.0) { E.ok = false; return E; }
  if (count > 0.0) {
    bool even = abs(first - 2.0 * round(0.5 * first)) < 0.5;
    E.low = ((even) ? (-1.0) : (1.0));
    E.hlo = first;
    E.hhi = last;
  }
  return E;
}
// mode 4: the exact part only (the fallback returns the mean), mode 5: the fallback only; for timing
float2 checkerMeanHMode(float3 hu, float3 hv, float3 hd, float x, float y, float period, float S, uint mode) {
  float sig = sqrt(S);
  float L = 5.5;
  float3 p = float3(x, y, 1.0);
  float Nu = dot(hu, p);
  float Nv = dot(hv, p);
  float D = dot(hd, p);
  float2 dD = hd.xy;
  float2 r = dD / D;
  float u0 = Nu / D / period;
  float v0 = Nv / D / period;
  float2 gu = (hu.xy * D - Nu * dD) / (D * D) / period;
  float2 gv = (hv.xy * D - Nv * dD) / (D * D) / period;
  EdgeRange eu = edgeRange(u0, gu, r, sig);
  EdgeRange ev = edgeRange(v0, gv, r, sig);
  if (!eu.ok || !ev.ok) {
    if (mode == 4) { return float2(0.5, 3.0); }
    Jets J = jetsFromHomography(hu, hv, hd, x, y, period);
    return float2(checkerSpectral(J, S), 3.0);
  }
  if (mode == 5) { return float2(0.5, 1.0); }
  float acc = eu.low * ev.low;
  int nu = int(eu.hhi - eu.hlo) + 1;
  int nvE = int(ev.hhi - ev.hlo) + 1;
  for (int ih = 0; ih < nu; ih++) {
    float h = eu.hlo + float(ih);
    float bu = 0.5 * h;
    float du = u0 - bu;
    float2 nuv = gu + du * r;
    float nun = max(length(nuv), 1e-30);
    float distU = du / nun;
    if (abs(distU) < L * sig) {
      float ju = ((abs(h - 2.0 * round(0.5 * h)) < 0.5) ? (2.0) : (-2.0));
      acc += ev.low * ju * Phi(distU / sig);
      for (int ik = 0; ik < nvE; ik++) {
        float k = ev.hlo + float(ik);
        float bv = 0.5 * k;
        float dv = v0 - bv;
        float2 nvv = gv + dv * r;
        float nvn = max(length(nvv), 1e-30);
        float distV = dv / nvn;
        if (abs(distV) < L * sig) {
          float jv = ((abs(k - 2.0 * round(0.5 * k)) < 0.5) ? (2.0) : (-2.0));
          float corr = dot(nuv, nvv) / (nun * nvn);
          acc += ju * jv * bvnuAny(-distU / sig, -distV / sig, corr);
        }
      }
    }
  }
  for (int ik = 0; ik < nvE; ik++) {
    float k = ev.hlo + float(ik);
    float bv = 0.5 * k;
    float dv = v0 - bv;
    float2 nvv = gv + dv * r;
    float distV = dv / max(length(nvv), 1e-30);
    if (abs(distV) < L * sig) {
      float jv = ((abs(k - 2.0 * round(0.5 * k)) < 0.5) ? (2.0) : (-2.0));
      acc += eu.low * jv * Phi(distV / sig);
    }
  }
  return float2(0.5 + 0.5 * acc, 1.0);
}
float2 checkerMeanH(float3 hu, float3 hv, float3 hd, float x, float y, float period, float S) { return checkerMeanHMode(hu, hv, hd, x, y, period, S, 0); }
float2 circlesMeanHMode(float3 hu, float3 hv, float3 hd, float x, float y, float period, float S, uint mode) {
  float sig = sqrt(S);
  float3 p = float3(x, y, 1.0);
  float Nu = dot(hu, p);
  float Nv = dot(hv, p);
  float D = dot(hd, p);
  float2 dD = hd.xy;
  float rn = length(dD) / abs(D);
  float u0 = Nu / D / period;
  float v0 = Nv / D / period;
  float2 gu = (hu.xy * D - Nu * dD) / (D * D) / period;
  float2 gv = (hv.xy * D - Nv * dD) / (D * D) / period;
  float denom = 1.0 - 5.5 * sig * rn;
  // the cells whose disc can reach the footprint: per axis, the disc's
  // radius plus the count's 5.5 sigma excursion, the same reach the conic
  // rule keeps below
  float reachU = 5.5 * sig * length(gu) / max(denom, 1e-6) + DISC_R;
  float reachV = 5.5 * sig * length(gv) / max(denom, 1e-6) + DISC_R;
  float nu0 = floor(u0 - reachU);
  float nu1 = floor(u0 + reachU);
  float nv0 = floor(v0 - reachV);
  float nv1 = floor(v0 + reachV);
  if (denom <= 0.05 || (nu1 - nu0 + 1.0) * (nv1 - nv0 + 1.0) > 9.5 || abs(u0) > 1048576.0 || abs(v0) > 1048576.0) {
    if (mode == 4) { return float2(0.5454, 3.0); }
    Jets J = jetsFromHomography(hu, hv, hd, x, y, period);
    return float2(circlesSpectral(J, S), 3.0);
  }
  if (mode == 5) { return float2(0.5454, 1.0); }
  // the affine numerators in cells and their gradients
  float nuA = Nu / period;
  float nvA = Nv / period;
  float2 dnu = hu.xy / period;
  float2 dnv = hv.xy / period;
  float s2 = 1.0 / (D * D);
  float L = 5.5 * sig;
  float acc = 0.0;
  int cellsU = int(nu1 - nu0) + 1;
  int cellsV = int(nv1 - nv0) + 1;
  for (int iu = 0; iu < cellsU; iu++) {
    for (int iv = 0; iv < cellsV; iv++) {
      float cu = nu0 + float(iu) + 0.5;
      float cv = nv0 + float(iv) + 0.5;
      // q(X) = (nu - cu D)^2 + (nv - cv D)^2 - R^2 D^2, scaled by 1 / D^2: exact in screen space
      float A0 = nuA - cu * D;
      float B0 = nvA - cv * D;
      float2 dA = dnu - cu * dD;
      float2 dB = dnv - cv * dD;
      float a0 = (A0 * A0 + B0 * B0 - DISC_R * DISC_R * D * D) * s2;
      float2 g = (2.0 * A0 * dA + 2.0 * B0 * dB - 2.0 * DISC_R * DISC_R * D * dD) * s2;
      float3 H = float3(
        2.0 * (dA.x * dA.x + dB.x * dB.x - DISC_R * DISC_R * dD.x * dD.x),
        2.0 * (dA.x * dA.y + dB.x * dB.y - DISC_R * DISC_R * dD.x * dD.y),
        2.0 * (dA.y * dA.y + dB.y * dB.y - DISC_R * DISC_R * dD.y * dD.y)) * s2;
      // the quadratic's range over the footprint: outside, inside, or integrate
      float hn = sqrt(H.x * H.x + 2.0 * H.y * H.y + H.z * H.z);
      float range = L * length(g) + 0.5 * L * L * hn;
      if (a0 - range > 0.0) { }
      else if (a0 + range < 0.0) { acc += 1.0; }
      else { acc += quadRegion(a0, g, H, S); }
    }
  }
  return float2(acc, 1.0);
}
float2 circlesMeanH(float3 hu, float3 hv, float3 hd, float x, float y, float period, float S) { return circlesMeanHMode(hu, hv, hd, x, y, period, S, 0); }
