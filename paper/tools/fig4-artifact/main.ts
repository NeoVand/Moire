// Character Hills — interactive 3D reference for Figure 4.
// A character k1*phi1 + k2*phi2 drawn as a lit surface over the real
// two-ring-family superposition; contours baked into the surface texture,
// bold exactly where the heterodyne ratio says the fringe stands.
import * as THREE from 'three';

type Panel = 'difference' | 'sum';

interface Params {
  panel: Panel;
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
  showDrops: boolean;
  lightAz: number; // degrees
}

const P: Params = {
  panel: 'difference',
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
  showDrops: true,
  lightAz: 145,
};

const INK = 0x15181c;
const ACCENT = '#C81E5A';
const WARM = '#D4761A';
const COOL = [0x1b / 2.55, 0x6c / 2.55, 0xa8 / 2.55]; // 0..100 scale unused; see tex
const PAPER = '#f4f2ee';
const C0 = 1.6;

const s = () => (2 * P.F) / P.levels;

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
function clipPatch(pts: Run): Run[] {
  const out: Run[] = [];
  let cur: Run = [];
  for (const p of pts) {
    if (Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1) cur.push(p);
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
    const b = eta(p[0], p[1]) < P.etaCut;
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
camera.up.set(0, 0, 1);

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
  const col = P.panel === 'difference' ? [200, 30, 90] : [212, 118, 26];
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
      const inRegime = et < P.etaCut;
      let r = paper[0], g = paper[1], b = paper[2];
      if (P.fillMode === 'phi') {
        // Exact mean ink along the diagonal: union of two duty-d strokes at
        // beat phase t is 2d - overlap, the saturating tent of Theorem 1 —
        // valid where the beat is slow; past the cut the true local mean is
        // the uncorrelated coverage, so the profile fades to it honestly.
        const overlap = Math.max(0, duty - t) + Math.max(0, duty - (1 - t));
        const tent = Math.min(1, 2 * duty - overlap);
        const fade = Math.min(1, Math.max(0, (et - 0.8 * P.etaCut) / (0.8 * P.etaCut)));
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
  const colHex = P.panel === 'difference' ? ACCENT : WARM;
  const boldMat = new THREE.MeshBasicMaterial({ color: colHex });
  const thinMat = new THREE.LineBasicMaterial({ color: colHex, transparent: true, opacity: 0.4 });
  const dropMat = new THREE.LineDashedMaterial({
    color: INK, dashSize: 0.028, gapSize: 0.02, transparent: true, opacity: 0.65,
  });
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
  for (const { lv, pts } of levels) {
    for (const run of clipPatch(pts)) {
      for (const seg of splitEta(run)) {
        if (P.showContours) {
          const z = liftZ(lv) + 0.006;
          addRun(seg.pts.map(([x, y]) => [x, y, z] as [number, number, number]), seg.bold, 0.005);
        }
        if (P.showFringes) {
          addRun(seg.pts.map(([x, y]) => [x, y, 0.004] as [number, number, number]), seg.bold, 0.004);
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
    const fl = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1, -1, 0.002), new THREE.Vector3(1, -1, 0.002),
      new THREE.Vector3(1, 1, 0.002), new THREE.Vector3(-1, 1, 0.002),
      new THREE.Vector3(-1, -1, 0.002),
    ]);
    dynamic.add(new THREE.Line(fl, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 })));
  }
  if (P.showDrops) {
    const drops: [number, number][] = [];
    if (P.panel === 'difference') {
      for (const [n, sign, t] of [[2, 1, 1.6], [3, -1, 1.3], [4, 1, -1.0]] as const) {
        if (n >= P.levels) continue;
        const a = (n * s()) / 2;
        const b = Math.sqrt(Math.max(P.F * P.F - a * a, 1e-12));
        drops.push([sign * a * Math.cosh(t), b * Math.sinh(t)]);
      }
    } else drops.push([0, 0]);
    for (const [x, y] of drops) {
      const z = P.z0 + zScale * (H(x, y) - zMid);
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, z),
      ]);
      const line = new THREE.Line(g, dropMat);
      line.computeLineDistances();
      dynamic.add(line);
    }
  }
}

// ------------------------------------------------------------------ orbit
const target = new THREE.Vector3(0, 0, 0.34);
let theta = (-62 * Math.PI) / 180; // azimuth, from +x
let phi = (65 * Math.PI) / 180; // polar from +z
let dist = 4.6;
function placeCamera() {
  phi = Math.min(Math.max(phi, 0.05), Math.PI - 0.05);
  dist = Math.min(Math.max(dist, 1.2), 14);
  camera.position.set(
    target.x + dist * Math.sin(phi) * Math.cos(theta),
    target.y + dist * Math.sin(phi) * Math.sin(theta),
    target.z + dist * Math.cos(phi)
  );
  camera.lookAt(target);
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
    const k = dist * 0.0011;
    const right = new THREE.Vector3().subVectors(camera.position, target).cross(camera.up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, new THREE.Vector3().subVectors(camera.position, target)).normalize();
    target.addScaledVector(right, dx * k).addScaledVector(upv, -dy * k);
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
bindRange('etacut', () => P.etaCut, (v) => { P.etaCut = v; bandsDirty = true; }, (v) => v.toFixed(2));
bindRange('light', () => P.lightAz, (v) => { P.lightAz = v; placeSun(); }, (v) => `${Math.round(v)}°`);

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void) {
  const el = $(id) as HTMLInputElement;
  el.checked = get();
  el.addEventListener('change', () => { set(el.checked); schedule(); });
}
bindCheck('contours', () => P.showContours, (v) => (P.showContours = v));
bindCheck('fringes', () => P.showFringes, (v) => (P.showFringes = v));
bindCheck('drops', () => P.showDrops, (v) => (P.showDrops = v));
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

for (const p of ['difference', 'sum'] as Panel[]) {
  $(p).addEventListener('click', () => {
    P.panel = p;
    bandsDirty = shapeDirty = true;
    $('difference').classList.toggle('on', p === 'difference');
    $('sum').classList.toggle('on', p === 'sum');
    schedule();
  });
}
$('view-paper').addEventListener('click', () => preset(25, -62, 4.6));
$('view-top').addEventListener('click', () => preset(88, -90, 4.2));
$('view-low').addEventListener('click', () => preset(10, -30, 4.2));

// ------------------------------------------------------------------ loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
placeSun();
preset(25, -62, 4.6);
apply();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
