// Character Hills — interactive 3D reference for Figure 4.
// A character k1*phi1 + k2*phi2 drawn as a lit surface over the real
// two-ring-family superposition; contours baked into the surface texture,
// bold exactly where the heterodyne ratio says the fringe stands.
import * as THREE from 'three';

type Panel = 'difference' | 'sum';

interface Params {
  panel: Panel;
  projection: 'perspective' | 'orthographic';
  F: number; // focus half-separation (patch units)
  levels: number; // fringe count: D spans -levels..levels (pitch s = 2F/levels)
  relief: number; // total surface height (patch units)
  z0: number; // float height of the surface mid-plane
  duty: number; // ring stroke width as a fraction of pitch
  band: number; // contour band half-width (index units)
  etaCut: number; // bold below
  tint: boolean; // tint family 1 cool
  fillMode: 'bands' | 'phi'; // cosmetic bands vs exact mean-ink profile
  fillAlpha: number; // band fill opacity
  outlineW: number; // integer-level outline half-width, patch px (0 = off)
  surfOpacity: number; // surface opacity
  showEdge: boolean; // surface boundary outline
  showFloor: boolean;
  showContours: boolean;
  showFringes: boolean;
  showPosts: boolean; // corner posts joining the two planes
  lightAz: number; // degrees
}

const P: Params = {
  panel: 'difference',
  projection: 'perspective',
  F: 0.2,
  levels: 5,
  relief: 0.5,
  z0: 0.55,
  duty: 0.45,
  band: 0.09,
  etaCut: 0.45,
  tint: true,
  fillMode: 'bands',
  fillAlpha: 0.92,
  outlineW: 1.4,
  surfOpacity: 1,
  showEdge: true,
  showFloor: true,
  showContours: false,
  showFringes: false,
  showPosts: true,
  lightAz: 145,
};

const INK = 0x15181c;
const ACCENT = '#C81E5A';
const SUMBLUE = '#1B6CA8';
const COOL = [0x1b / 2.55, 0x6c / 2.55, 0xa8 / 2.55]; // 0..100 scale unused; see tex
const PAPER = '#f4f2ee';
const C0 = 1.6;

const s = () => (2 * P.F) / P.levels;
// The top of the Bold-cut slider means "no cut": everything draws bold and
// the Phi profile never fades to the uncorrelated mean.
const etaCutEff = () => (P.etaCut >= 2.04 ? 1e9 : P.etaCut);

// ------------------------------------------------------------------ math
function radii(x: number, y: number): [number, number] {
  return [Math.hypot(x + P.F, y), Math.hypot(x - P.F, y)];
}
function H(x: number, y: number): number {
  const [r1, r2] = radii(x, y);
  return P.panel === 'difference' ? (r1 - r2) / s() : (r1 + r2 - C0) / s();
}
function eta(x: number, y: number): number {
  const [r1, r2] = radii(x, y);
  const a = Math.max(r1, 1e-9);
  const b = Math.max(r2, 1e-9);
  const u1x = (x + P.F) / a, u1y = y / a;
  const u2x = (x - P.F) / b, u2y = y / b;
  const sg = P.panel === 'difference' ? -1 : 1;
  const num = Math.hypot(u1x + sg * u2x, u1y + sg * u2y);
  const den = 0.5 * Math.hypot(u1x - sg * u2x, u1y - sg * u2y);
  return num / Math.max(den, 1e-9);
}

type Run = [number, number][];
function clipPatch(pts: Run, bound = 1): Run[] {
  const out: Run[] = [];
  let cur: Run = [];
  for (const p of pts) {
    if (Math.abs(p[0]) <= bound && Math.abs(p[1]) <= bound) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((r) => r.length > 3);
}
function splitEta(run: Run): { bold: boolean; pts: Run }[] {
  const out: { bold: boolean; pts: Run }[] = [];
  let cur: Run = [];
  let cls: boolean | null = null;
  for (const p of run) {
    const b = eta(p[0], p[1]) < etaCutEff();
    if (cls !== null && b !== cls && cur.length) { out.push({ bold: cls, pts: cur }); cur = []; }
    cls = b;
    cur.push(p);
  }
  if (cur.length && cls !== null) out.push({ bold: cls, pts: cur });
  return out.filter((r) => r.pts.length > 3);
}

function levelCurves(): { lv: number; pts: Run }[] {
  const out: { lv: number; pts: Run }[] = [];
  const F = P.F, pitch = s();
  if (P.panel === 'difference') {
    const line: Run = [];
    for (let i = 0; i <= 200; i++) line.push([0, -1 + (2 * i) / 200]);
    out.push({ lv: 0, pts: line });
    for (let n = 1; n < P.levels; n++) {
      const a = (n * pitch) / 2;
      const b = Math.sqrt(Math.max(F * F - a * a, 1e-12));
      for (const sign of [1, -1]) {
        const pts: Run = [];
        for (let i = 0; i <= 400; i++) {
          const t = -3.4 + (6.8 * i) / 400;
          pts.push([sign * a * Math.cosh(t), b * Math.sinh(t)]);
        }
        out.push({ lv: sign * n, pts });
      }
    }
    const rayR: Run = [], rayL: Run = [];
    for (let i = 0; i <= 120; i++) {
      rayR.push([F + ((1 - F) * i) / 120, 0]);
      rayL.push([-F - ((1 - F) * i) / 120, 0]);
    }
    out.push({ lv: P.levels, pts: rayR });
    out.push({ lv: -P.levels, pts: rayL });
  } else {
    const rmax = Math.hypot(1 + F, 1) + Math.hypot(1 - F, 1);
    const jmin = Math.ceil((2 * F - C0) / pitch);
    const jmax = Math.floor((rmax - C0) / pitch);
    const seg: Run = [];
    for (let i = 0; i <= 100; i++) seg.push([-F + (2 * F * i) / 100, 0]);
    out.push({ lv: (2 * F - C0) / pitch, pts: seg });
    for (let j = jmin; j <= jmax; j++) {
      const a = (C0 + j * pitch) / 2;
      const b2 = a * a - F * F;
      if (b2 <= 1e-12) continue;
      const b = Math.sqrt(b2);
      const pts: Run = [];
      for (let i = 0; i <= 520; i++) {
        const t = (2 * Math.PI * i) / 520;
        pts.push([a * Math.cos(t), b * Math.sin(t)]);
      }
      out.push({ lv: j, pts });
    }
  }
  return out;
}

function heightRange(): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 64; i++)
    for (let j = 0; j <= 64; j++) {
      const h = H(-1 + i / 32, -1 + j / 32);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  return [lo, hi];
}

// ------------------------------------------------------------------ three
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
const persp = new THREE.PerspectiveCamera(32, 1, 0.01, 80);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 80);
persp.up.set(0, 0, 1);
ortho.up.set(0, 0, 1);
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp;
let viewAspect = 1;
function activeCamera() {
  camera = P.projection === 'orthographic' ? ortho : persp;
  return camera;
}

const sun = new THREE.DirectionalLight(0xffffff, 2.1);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
fill.position.set(2, -3, 2.5);
scene.add(sun, fill, new THREE.AmbientLight(0xffffff, 0.85));
function placeSun() {
  const az = (P.lightAz * Math.PI) / 180;
  sun.position.set(2.4 * Math.cos(az), 2.4 * Math.sin(az), 2.2);
}

const dynamic = new THREE.Group();
scene.add(dynamic);

// -------- textures
function makeCanvas(n: number) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}
const floorCanvas = makeCanvas(2048);
const bandCanvas = makeCanvas(1024);

function paintFloor() {
  const n = floorCanvas.width;
  const ctx = floorCanvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const pitch = s(), hw = (P.duty * pitch) / 2, aa = 2.2 / n;
  const paper = [244, 242, 238];
  const cool = P.tint ? [38, 74, 104] : [21, 24, 28];
  const ink = [21, 24, 28];
  for (let j = 0; j < n; j++) {
    const y = -1 + (2 * (j + 0.5)) / n;
    for (let i = 0; i < n; i++) {
      const x = -1 + (2 * (i + 0.5)) / n;
      const [r1, r2] = radii(x, y);
      const t1 = Math.abs(r1 / pitch - Math.round(r1 / pitch)) * pitch;
      const t2 = Math.abs(r2 / pitch - Math.round(r2 / pitch)) * pitch;
      const i1 = Math.min(1, Math.max(0, (hw - t1) / aa + 0.5)) * 0.8;
      const i2 = Math.min(1, Math.max(0, (hw - t2) / aa + 0.5)) * 0.76;
      const o = (j * n + i) * 4;
      for (let k = 0; k < 3; k++) {
        let v = paper[k];
        v = v * (1 - i1) + cool[k] * i1;
        v = v * (1 - i2) + ink[k] * i2;
        d[o + k] = v;
      }
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintBands() {
  const n = bandCanvas.width;
  const ctx = bandCanvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const paper = [244, 242, 238];
  const ink = [21, 24, 28];
  const col = P.panel === 'difference' ? [200, 30, 90] : [27, 108, 168];
  const dark = col.map((c) => c * 0.62);
  const duty = P.duty;
  const flat = 2 * duty - duty * duty; // uncorrelated union coverage
  const lineHw = (P.outlineW * 2) / n; // patch units
  const eps = 2 / n;
  for (let j = 0; j < n; j++) {
    const y = -1 + (2 * (j + 0.5)) / n;
    for (let i = 0; i < n; i++) {
      const x = -1 + (2 * (i + 0.5)) / n;
      const h = H(x, y);
      const t = Math.abs(h - Math.round(h));
      const et = eta(x, y);
      const inRegime = et < etaCutEff();
      let r = paper[0], g = paper[1], b = paper[2];
      if (P.fillMode === 'phi') {
        // Exact mean ink along the diagonal: union of two duty-d strokes at
        // beat phase t is 2d - overlap, the saturating tent of Theorem 1 —
        // valid where the beat is slow; past the cut the true local mean is
        // the uncorrelated coverage, so the profile fades to it honestly.
        const overlap = Math.max(0, duty - t) + Math.max(0, duty - (1 - t));
        const tent = Math.min(1, 2 * duty - overlap);
        const fade = Math.min(1, Math.max(0, (et - 0.8 * etaCutEff()) / (0.8 * etaCutEff())));
        const a = (tent * (1 - fade) + flat * fade) * P.fillAlpha;
        r = r * (1 - a) + ink[0] * a;
        g = g * (1 - a) + ink[1] * a;
        b = b * (1 - a) + ink[2] * a;
      } else {
        const band = Math.pow(Math.max(0, 1 - t / P.band), 1.4);
        const a = (inRegime ? 1 : 0.3) * band * P.fillAlpha;
        r = r * (1 - a) + col[0] * a;
        g = g * (1 - a) + col[1] * a;
        b = b * (1 - a) + col[2] * a;
      }
      if (P.outlineW > 0.01) {
        // Constant-width isoline at the exact integer level: residual over
        // the local index gradient is distance to the level set.
        const gx = (H(x + eps, y) - H(x - eps, y)) / (2 * eps);
        const gy = (H(x, y + eps) - H(x, y - eps)) / (2 * eps);
        const dist = t / Math.max(Math.hypot(gx, gy), 1e-9);
        const lineA =
          Math.min(1, Math.max(0, (lineHw - dist) / (eps * 0.75) + 0.5)) *
          (inRegime ? 0.95 : 0.35);
        r = r * (1 - lineA) + dark[0] * lineA;
        g = g * (1 - lineA) + dark[1] * lineA;
        b = b * (1 - lineA) + dark[2] * lineA;
      }
      const o = (j * n + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const floorTex = new THREE.CanvasTexture(floorCanvas);
const bandTex = new THREE.CanvasTexture(bandCanvas);
// A repaint must never inherit stale GPU state: dispose forces three to
// reallocate and re-upload the whole canvas on the next render.
function hardRefreshTextures() {
  floorTex.dispose();
  bandTex.dispose();
  floorTex.needsUpdate = true;
  bandTex.needsUpdate = true;
}
for (const t of [floorTex, bandTex]) {
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
}

const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floorMat);
scene.add(floor);

const surfMat = new THREE.MeshStandardMaterial({
  map: bandTex,
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
  transparent: true,
});
const SEG = 320;
let surfGeo = new THREE.PlaneGeometry(2, 2, SEG, SEG);
const surf = new THREE.Mesh(surfGeo, surfMat);
scene.add(surf);

let zScale = 0.05, zMid = 0;
function reshapeSurface() {
  const [lo, hi] = heightRange();
  zMid = (lo + hi) / 2;
  zScale = P.relief / Math.max(hi - lo, 1e-9);
  const pos = surfGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, P.z0 + zScale * (H(x, y) - zMid));
  }
  pos.needsUpdate = true;
  surfGeo.computeVertexNormals();
}
const liftZ = (lv: number) => P.z0 + zScale * (lv - zMid);

// -------- curves (tubes for bold, lines for thin)
function curve3(pts: [number, number, number][]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
}
function rebuildCurves() {
  for (const child of [...dynamic.children]) {
    dynamic.remove(child);
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
  const colHex = P.panel === 'difference' ? ACCENT : SUMBLUE;
  const boldMat = new THREE.MeshBasicMaterial({ color: colHex });
  const thinMat = new THREE.LineBasicMaterial({ color: colHex, transparent: true, opacity: 0.4 });
  const levels = levelCurves();
  const addRun = (pts3: [number, number, number][], bold: boolean, radius: number) => {
    if (bold) {
      const g = new THREE.TubeGeometry(curve3(pts3), Math.min(200, pts3.length), radius, 5, false);
      dynamic.add(new THREE.Mesh(g, boldMat));
    } else {
      const g = new THREE.BufferGeometry().setFromPoints(
        pts3.map(([x, y, z]) => new THREE.Vector3(x, y, z))
      );
      dynamic.add(new THREE.Line(g, thinMat));
    }
  };
  // A tube has a body: clip its spine a radius inside the patch so nothing
  // overhangs the border, and lift it along the surface NORMAL so it hugs
  // the steep flanks instead of riding proud of them.
  const R_CONTOUR = 0.0034;
  const onSurface = ([x, y]: [number, number]): [number, number, number] => {
    const e = 1e-3;
    const gx = ((H(x + e, y) - H(x - e, y)) / (2 * e)) * zScale;
    const gy = ((H(x, y + e) - H(x, y - e)) / (2 * e)) * zScale;
    const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const lift = R_CONTOUR * 0.9;
    return [
      x - gx * inv * lift,
      y - gy * inv * lift,
      P.z0 + zScale * (H(x, y) - zMid) + inv * lift,
    ];
  };
  for (const { pts } of levels) {
    for (const run of clipPatch(pts, 1 - R_CONTOUR * 1.6)) {
      for (const seg of splitEta(run)) {
        if (P.showContours) addRun(seg.pts.map(onSurface), seg.bold, R_CONTOUR);
        if (P.showFringes) {
          addRun(seg.pts.map(([x, y]) => [x, y, 0.003] as [number, number, number]), seg.bold, 0.003);
        }
      }
    }
  }
  if (P.showEdge) {
    const edgeMat = new THREE.MeshBasicMaterial({ color: INK });
    const edges: Run[] = [[], [], [], []];
    for (let i = 0; i <= 160; i++) {
      const t = -1 + (2 * i) / 160;
      edges[0].push([t, -1]); edges[1].push([1, t]);
      edges[2].push([-t, 1]); edges[3].push([-1, -t]);
    }
    for (const e of edges) {
      const pts3 = e.map(([x, y]) => [x, y, P.z0 + zScale * (H(x, y) - zMid)] as [number, number, number]);
      const g = new THREE.TubeGeometry(curve3(pts3), 160, 0.004, 5, false);
      dynamic.add(new THREE.Mesh(g, edgeMat));
    }
    // the moire plane gets the same ink outline
    for (const e of edges) {
      const pts3 = e.map(([x, y]) => [x, y, 0.003] as [number, number, number]);
      const g = new THREE.TubeGeometry(curve3(pts3), 32, 0.004, 5, false);
      dynamic.add(new THREE.Mesh(g, edgeMat));
    }
  }
  if (P.showPosts) {
    const postMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.55 });
    const dash = 0.03, gap = 0.021;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const z = P.z0 + zScale * (H(cx, cy) - zMid);
      for (let z0 = 0.004; z0 < z; z0 += dash + gap) {
        const z1 = Math.min(z0 + dash, z);
        const g = new THREE.TubeGeometry(
          new THREE.LineCurve3(new THREE.Vector3(cx, cy, z0), new THREE.Vector3(cx, cy, z1)),
          1, 0.0028, 5, false
        );
        dynamic.add(new THREE.Mesh(g, postMat));
      }
    }
  }
}


// The curve of a fractional level: same conics as levelCurves, off-integer.
function offsetLevel(lv: number, off: number): Run[] {
  const L = lv + off;
  const F = P.F, pitch = s();
  if (P.panel === 'difference') {
    const a = Math.abs(L) * pitch / 2;
    if (a < 1e-6) return [Array.from({ length: 201 }, (_, i) => [0, -1 + i / 100] as [number, number])];
    if (a >= F) return [];
    const b = Math.sqrt(F * F - a * a);
    const sign = L > 0 ? 1 : -1;
    const pts: Run = [];
    for (let i = 0; i <= 400; i++) {
      const t = -3.4 + (6.8 * i) / 400;
      pts.push([sign * a * Math.cosh(t), b * Math.sinh(t)]);
    }
    return [pts];
  }
  const a = (C0 + L * pitch) / 2;
  const b2 = a * a - F * F;
  if (b2 <= 1e-9) return [];
  const b = Math.sqrt(b2);
  const pts: Run = [];
  for (let i = 0; i <= 520; i++) {
    const t = (2 * Math.PI * i) / 520;
    pts.push([a * Math.cos(t), b * Math.sin(t)]);
  }
  return [pts];
}

// ------------------------------------------------------------------ export
function settingsJson(): string {
  return JSON.stringify(
    {
      app: 'character-hills',
      version: 1,
      params: P,
      camera: { theta, phi, dist, target: [target.x, target.y, target.z] },
      viewport: { w: canvas.clientWidth, h: canvas.clientHeight },
    },
    null,
    2
  );
}

function viewSvg(): string {
  camera.updateMatrixWorld(true);
  const W = canvas.clientWidth, Hh = canvas.clientHeight;
  const v = new THREE.Vector3();
  const px = (x: number, y: number, z: number) => {
    v.set(x, y, z).project(camera);
    return [((v.x * 0.5 + 0.5) * W).toFixed(1), ((1 - (v.y * 0.5 + 0.5)) * Hh).toFixed(1)];
  };
  const poly = (pts: [number, number, number][], cls: string) =>
    `<polyline points="${pts.map(([x, y, z]) => px(x, y, z).join(',')).join(' ')}" class="${cls}"/>`;
  const col = P.panel === 'difference' ? '#C81E5A' : '#1B6CA8';
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">`,
    `<style>.bold{stroke:${col};stroke-width:2.4;fill:none}` +
      `.thin{stroke:${col};stroke-width:0.9;fill:none;opacity:.45}` +
      `.ring1{stroke:#26506a;stroke-width:0.7;fill:none}` +
      `.ring2{stroke:#15181c;stroke-width:0.7;fill:none}` +
      `.frame{stroke:#15181c;stroke-width:1.6;fill:none}` +
      `.post{stroke:#15181c;stroke-width:1.2;fill:none;opacity:.55;stroke-dasharray:7 5}</style>`,
  ];
  const lift = (run: Run, lv: number) =>
    run.map(([x, y]) => [x, y, liftZ(lv)] as [number, number, number]);
  const flat = (run: Run, z = 0) => run.map(([x, y]) => [x, y, z] as [number, number, number]);
  const border: Run = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  // floor ring families, clipped to the patch
  for (const [fam, cx] of [['ring1', -P.F], ['ring2', P.F]] as const) {
    parts.push(`<g id="floor-${fam === 'ring1' ? 'family1' : 'family2'}">`);
    const kmax = Math.ceil(1.6 / s());
    for (let k = 1; k <= kmax; k++) {
      const pts: Run = [];
      for (let i = 0; i <= 360; i++) {
        const a = (2 * Math.PI * i) / 360;
        pts.push([cx + k * s() * Math.cos(a), k * s() * Math.sin(a)]);
      }
      for (const run of clipPatch(pts)) parts.push(poly(flat(run, 0.001), fam));
    }
    parts.push('</g>');
  }
  const levels = levelCurves();
  // The band fills, as vectors: each band is a stack of sub-level curves
  // (H = n + j*w/N, all exact conics), graded in opacity — its envelope
  // widens precisely where the character runs flat, like the render.
  if (P.fillAlpha > 0.01) {
    const NSUB = 4;
    parts.push('<g id="surface-bandfill">');
    for (const { lv, pts: _ } of levels) {
      for (let j = -NSUB; j <= NSUB; j++) {
        const off = (j / NSUB) * P.band;
        const w = Math.pow(1 - Math.abs(j) / (NSUB + 1), 1.4) * P.fillAlpha;
        for (const sub of offsetLevel(lv, off)) {
          for (const run of clipPatch(sub)) {
            for (const seg of splitEta(run)) {
              const o = ((seg.bold ? 0.92 : 0.28) * w).toFixed(2);
              parts.push(
                `<polyline points="${lift(seg.pts, lv + off)
                  .map(([x, y, z]) => px(x, y, z).join(','))
                  .join(' ')}" fill="none" stroke="${col}" stroke-width="3.4" opacity="${o}"/>`
              );
            }
          }
        }
      }
    }
    parts.push('</g>');
  }
  parts.push('<g id="floor-fringes">');
  for (const { pts } of levels)
    for (const run of clipPatch(pts))
      for (const seg of splitEta(run))
        parts.push(poly(flat(seg.pts, 0.002), seg.bold ? 'bold' : 'thin'));
  parts.push('</g><g id="surface-contours">');
  for (const { lv, pts } of levels)
    for (const run of clipPatch(pts))
      for (const seg of splitEta(run))
        parts.push(poly(lift(seg.pts, lv), seg.bold ? 'bold' : 'thin'));
  parts.push('</g><g id="frames">');
  parts.push(poly(flat(border, 0.001), 'frame'));
  const edge: Run = [];
  for (let i = 0; i <= 640; i++) {
    const t = (i % 160) / 160;
    const side = Math.floor(i / 160) % 4;
    if (side === 0) edge.push([-1 + 2 * t, -1]);
    else if (side === 1) edge.push([1, -1 + 2 * t]);
    else if (side === 2) edge.push([1 - 2 * t, 1]);
    else edge.push([-1, 1 - 2 * t]);
  }
  edge.push([-1, -1]);
  parts.push(
    poly(edge.map(([x, y]) => [x, y, P.z0 + zScale * (H(x, y) - zMid)] as [number, number, number]), 'frame')
  );
  parts.push('</g>');
  if (P.showPosts) {
    parts.push('<g id="corner-posts">');
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const z = P.z0 + zScale * (H(cx, cy) - zMid);
      parts.push(poly([[cx, cy, 0], [cx, cy, z]], 'post'));
    }
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function openCopyModal(title: string, text: string) {
  let modal = document.getElementById('copymodal') as HTMLDivElement | null;
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'copymodal';
    modal.innerHTML =
      '<div class="cm-box"><div class="cm-head"><b id="cm-title"></b>' +
      '<span><button id="cm-copy">Copy</button> <button id="cm-close">Close</button></span></div>' +
      '<textarea id="cm-text" readonly spellcheck="false"></textarea>' +
      '<div class="cm-note">Downloads are sandboxed on this page \u2014 copy instead (\u2318A \u00b7 \u2318C works too).</div></div>';
    document.body.appendChild(modal);
    document.getElementById('cm-close')!.addEventListener('click', () => modal!.remove());
    document.getElementById('cm-copy')!.addEventListener('click', async () => {
      const ta = document.getElementById('cm-text') as HTMLTextAreaElement;
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
        (document.getElementById('cm-copy') as HTMLButtonElement).textContent = 'Copied';
      } catch {
        document.execCommand('copy');
        (document.getElementById('cm-copy') as HTMLButtonElement).textContent = 'Copied?';
      }
    });
  }
  (document.getElementById('cm-title') as HTMLElement).textContent = title;
  const ta = document.getElementById('cm-text') as HTMLTextAreaElement;
  ta.value = text;
  ta.focus();
  ta.select();
}

// ------------------------------------------------------------------ orbit
const target = new THREE.Vector3(0, 0, 0.34);
let theta = (-62 * Math.PI) / 180; // azimuth, from +x
let phi = (65 * Math.PI) / 180; // polar from +z
let dist = 4.6;
function placeCamera() {
  activeCamera();
  phi = Math.min(Math.max(phi, 0.002), Math.PI - 0.05);
  dist = Math.min(Math.max(dist, 1.2), 14);
  camera.position.set(
    target.x + dist * Math.sin(phi) * Math.cos(theta),
    target.y + dist * Math.sin(phi) * Math.sin(theta),
    target.z + dist * Math.cos(phi)
  );
  camera.lookAt(target);
  if (camera === ortho) {
    // Frustum height tracks the perspective framing at the same distance, so
    // switching projections holds the subject size and wheel-zoom still zooms.
    const hh = dist * Math.tan((persp.fov * Math.PI) / 360);
    ortho.top = hh; ortho.bottom = -hh;
    ortho.right = hh * viewAspect; ortho.left = -hh * viewAspect;
  }
  camera.updateProjectionMatrix();
}
let drag: { x: number; y: number; btn: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, btn: e.shiftKey ? 2 : e.button };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.btn === 2) {
    // Grab-style pan on the camera's own screen axes: the scene follows the
    // cursor, and the orbit target moves strictly in the view plane so the
    // centre of rotation never drifts toward or away from the camera.
    const k = dist * 0.0011;
    const forward = new THREE.Vector3().subVectors(target, camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, forward).normalize();
    target.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
  } else {
    theta -= dx * 0.0055;
    phi -= dy * 0.0055;
  }
  placeCamera();
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  dist *= Math.exp(e.deltaY * 0.0011);
  placeCamera();
}, { passive: false });

function preset(el: number, az: number, d: number) {
  phi = ((90 - el) * Math.PI) / 180;
  theta = (az * Math.PI) / 180;
  dist = d;
  target.set(0, 0, 0.34);
  placeCamera();
}

// ------------------------------------------------------------------ UI
const $ = (id: string) => document.getElementById(id)!;
let floorDirty = true, bandsDirty = true, shapeDirty = true;
let timer: number | undefined;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(apply, 60) as unknown as number;
}
function apply() {
  surfMat.opacity = P.surfOpacity;
  floor.visible = P.showFloor;
  if (shapeDirty) reshapeSurface();
  if (floorDirty) { paintFloor(); floorTex.needsUpdate = true; }
  if (bandsDirty) { paintBands(); bandTex.needsUpdate = true; }
  rebuildCurves();
  floorDirty = bandsDirty = shapeDirty = false;
  $('formula').textContent =
    P.panel === 'difference'
      ? `D = (r₁ − r₂)/s   ·   contours at D ∈ ℤ are the fringes`
      : `(r₁ + r₂ − ${C0})/s   ·   steep: contours crowd to carrier scale`;
}

function bindRange(id: string, get: () => number, set: (v: number) => void, fmt: (v: number) => string) {
  const el = $(id) as HTMLInputElement;
  const out = $(id + '-v');
  el.value = String(get());
  out.textContent = fmt(get());
  el.addEventListener('input', () => {
    set(parseFloat(el.value));
    out.textContent = fmt(parseFloat(el.value));
    schedule();
  });
}
bindRange('f', () => P.F, (v) => { P.F = v; floorDirty = bandsDirty = shapeDirty = true; }, (v) => v.toFixed(2));
bindRange('levels', () => P.levels, (v) => { P.levels = Math.round(v); floorDirty = bandsDirty = shapeDirty = true; }, (v) => `±${Math.round(v)}`);
bindRange('relief', () => P.relief, (v) => { P.relief = v; shapeDirty = true; }, (v) => v.toFixed(2));
bindRange('z0', () => P.z0, (v) => { P.z0 = v; shapeDirty = true; }, (v) => v.toFixed(2));
bindRange('sopacity', () => P.surfOpacity, (v) => { P.surfOpacity = v; }, (v) => v.toFixed(2));
bindRange('fillalpha', () => P.fillAlpha, (v) => { P.fillAlpha = v; bandsDirty = true; }, (v) => v.toFixed(2));
bindRange('outline', () => P.outlineW, (v) => { P.outlineW = v; bandsDirty = true; }, (v) => v.toFixed(1));
bindRange('duty', () => P.duty, (v) => { P.duty = v; floorDirty = true; }, (v) => v.toFixed(2));
bindRange('band', () => P.band, (v) => { P.band = v; bandsDirty = true; }, (v) => v.toFixed(2));
bindRange('etacut', () => P.etaCut, (v) => { P.etaCut = v; bandsDirty = true; }, (v) => (v >= 2.04 ? 'all' : v.toFixed(2)));
bindRange('light', () => P.lightAz, (v) => { P.lightAz = v; placeSun(); }, (v) => `${Math.round(v)}°`);

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void) {
  const el = $(id) as HTMLInputElement;
  el.checked = get();
  el.addEventListener('change', () => { set(el.checked); schedule(); });
}
bindCheck('contours', () => P.showContours, (v) => (P.showContours = v));
bindCheck('fringes', () => P.showFringes, (v) => (P.showFringes = v));
bindCheck('posts', () => P.showPosts, (v) => (P.showPosts = v));
bindCheck('tint', () => P.tint, (v) => { P.tint = v; floorDirty = true; });
bindCheck('edge', () => P.showEdge, (v) => (P.showEdge = v));
bindCheck('floorvis', () => P.showFloor, (v) => (P.showFloor = v));
for (const m of ['bands', 'phi'] as const) {
  $('mode-' + m).addEventListener('click', () => {
    P.fillMode = m;
    bandsDirty = true;
    $('mode-bands').classList.toggle('on', m === 'bands');
    $('mode-phi').classList.toggle('on', m === 'phi');
    schedule();
  });
}

for (const m of ['perspective', 'orthographic'] as const) {
  $('proj-' + (m === 'perspective' ? 'persp' : 'ortho')).addEventListener('click', () => {
    P.projection = m;
    $('proj-persp').classList.toggle('on', m === 'perspective');
    $('proj-ortho').classList.toggle('on', m === 'orthographic');
    placeCamera();
  });
}
for (const p of ['difference', 'sum'] as Panel[]) {
  $(p).addEventListener('click', () => {
    P.panel = p;
    hardRefreshTextures();
    bandsDirty = shapeDirty = true;
    $('difference').classList.toggle('on', p === 'difference');
    $('sum').classList.toggle('on', p === 'sum');
    schedule();
  });
}
$('view-paper').addEventListener('click', () => preset(25, -62, 4.6));
$('view-top').addEventListener('click', () => preset(88, -90, 4.2));
$('view-low').addEventListener('click', () => preset(10, -30, 4.2));
$('exp-json').addEventListener('click', () => openCopyModal('Settings JSON', settingsJson()));
$('exp-svg').addEventListener('click', () => openCopyModal('View SVG (current camera)', viewSvg()));

// ------------------------------------------------------------------ loop
// Chrome restores form controls across reloads and fires their events,
// which can push a previous session's values into P piecemeal. After any
// (re)load, write the true state back into every control.
function syncUi() {
  const pairs: [string, string | number | boolean][] = [
    ['f', P.F], ['levels', P.levels], ['duty', P.duty], ['relief', P.relief],
    ['z0', P.z0], ['sopacity', P.surfOpacity], ['fillalpha', P.fillAlpha],
    ['outline', P.outlineW], ['band', P.band], ['etacut', P.etaCut],
    ['light', P.lightAz],
  ];
  for (const [id, v] of pairs) {
    const el = $(id) as HTMLInputElement;
    el.value = String(v);
    const out = document.getElementById(id + '-v');
    if (out) out.textContent = id === 'etacut' && (v as number) >= 2.04 ? 'all'
      : id === 'levels' ? '\u00b1' + v : id === 'light' ? Math.round(v as number) + '\u00b0'
      : typeof v === 'number' ? (v as number).toFixed(2) : String(v);
  }
  for (const [id, v] of [['contours', P.showContours], ['fringes', P.showFringes],
    ['posts', P.showPosts], ['tint', P.tint], ['edge', P.showEdge], ['floorvis', P.showFloor]] as const) {
    ($(id) as HTMLInputElement).checked = v as boolean;
  }
  $('difference').classList.toggle('on', P.panel === 'difference');
  $('sum').classList.toggle('on', P.panel === 'sum');
  $('mode-bands').classList.toggle('on', P.fillMode === 'bands');
  $('mode-phi').classList.toggle('on', P.fillMode === 'phi');
  $('proj-persp').classList.toggle('on', P.projection !== 'orthographic');
  $('proj-ortho').classList.toggle('on', P.projection === 'orthographic');
  placeCamera();
}
window.addEventListener('pageshow', () => setTimeout(syncUi, 250));

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  viewAspect = w / h;
  persp.aspect = viewAspect;
  placeCamera();
}
addEventListener('resize', resize);
resize();
placeSun();
preset(25, -62, 4.6);
apply();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

// ---------------------------------------------------------------- harness
// Local figure production: apply a Settings JSON, raise texture resolution,
// render at print size, hand back a PNG. Inert unless called.
(window as any).__census = () => {
  const out: Record<string, number> = {};
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = (m.material as THREE.MeshBasicMaterial | undefined);
    const key = o.type + (mat && mat.color ? '#' + mat.color.getHexString() : '');
    out[key] = (out[key] || 0) + 1;
  });
  out['dynamicChildren'] = dynamic.children.length;
  return out;
};
(window as any).__applySettings = (o: any) => {
  clearTimeout(timer);
  Object.assign(P, o.params);
  hardRefreshTextures();
  if (o.camera) {
    theta = o.camera.theta; phi = o.camera.phi; dist = o.camera.dist;
    target.set(o.camera.target[0], o.camera.target[1], o.camera.target[2]);
  }
  placeSun();
  placeCamera();
  ($('difference') as HTMLElement).classList.toggle('on', P.panel === 'difference');
  ($('sum') as HTMLElement).classList.toggle('on', P.panel === 'sum');
  floorDirty = bandsDirty = shapeDirty = true;
  apply();
  syncUi();
};
(window as any).__setTexRes = (floorN: number, bandN: number) => {
  floorCanvas.width = floorCanvas.height = floorN;
  bandCanvas.width = bandCanvas.height = bandN;
  paintFloor();
  paintBands();
  hardRefreshTextures();
};
(window as any).__renderPng = (w: number, h: number, transparent = false) => {
  clearTimeout(timer);
  floorDirty = bandsDirty = shapeDirty = true;
  hardRefreshTextures();
  apply();
  scene.background = transparent ? null : new THREE.Color(PAPER);
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  viewAspect = w / h;
  persp.aspect = viewAspect;
  placeCamera();
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');
  scene.background = new THREE.Color(PAPER);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  resize();
  return url;
};
