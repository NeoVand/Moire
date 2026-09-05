import {
  Color, DataTexture, DoubleSide, LinearMipmapLinearFilter, LinearFilter,
  Mesh, MeshBasicNodeMaterial, NoColorSpace, PerspectiveCamera, PlaneGeometry,
  RepeatWrapping, RGBAFormat, Scene, UnsignedByteType, Vector3,
} from 'three/webgpu';
import { dot, float, mix, positionWorld, screenCoordinate, sign, sin, texture, uniform, vec3 } from 'three/tsl';
import { projectiveChecker } from './spectral';
import { authorChecker } from './authorKernel';

export type Method = 'raw' | 'temporal' | 'spectral';
export type Kernel = 'projective' | 'lattice';
export const METHODS: Method[] = ['raw', 'temporal', 'spectral'];
export const PERIOD = 4;
export const DARK = 0.025;
export const LIGHT = 0.82;
export const SIGMA = 0.5;
export type CameraMotion = 'glide' | 'approach' | 'still';
export type Homography = { u: [number, number, number]; v: [number, number, number]; d: [number, number, number] };

export function cameraPose(camera: PerspectiveCamera, time: number, motion: CameraMotion) {
  const t = motion === 'still' ? 0 : time;
  const x = motion === 'glide' ? Math.sin(t * 0.28) * 6 : 0;
  const z = motion === 'approach' ? 28 - Math.sin(t * 0.22) * 12 : 28;
  camera.position.set(x, 12, z);
  camera.lookAt(x * 0.45, 0, z - 50);
  camera.updateMatrixWorld();
}

export function homography(camera: PerspectiveCamera, width: number, height: number, period = PERIOD): Homography {
  const eye = camera.position;
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const tan = Math.tan(camera.fov * Math.PI / 360);
  const rx = right.clone().multiplyScalar(2 * tan * camera.aspect / width);
  const ry = up.clone().multiplyScalar(-2 * tan / height);
  const r0 = forward.clone().addScaledVector(right, -tan * camera.aspect).addScaledVector(up, tan);
  return {
    u: [rx, ry, r0].map(r => (eye.x * r.y - eye.y * r.x) / period) as [number, number, number],
    v: [rx, ry, r0].map(r => (eye.z * r.y - eye.y * r.z) / period) as [number, number, number],
    d: [rx.y, ry.y, r0.y],
  };
}

export function sourceAt(h: Homography, x: number, y: number) {
  const d = h.d[0] * x + h.d[1] * y + h.d[2];
  if (d >= 0) return null;
  const u = (h.u[0] * x + h.u[1] * y + h.u[2]) / d;
  const v = (h.v[0] * x + h.v[1] * y + h.v[2]) / d;
  return 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * u)) * Math.sign(Math.sin(2 * Math.PI * v));
}

function makeCheckerTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = (x < size / 2) === (y < size / 2) ? 255 : 0;
    const k = (y * size + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = c;
    data[k + 3] = 255;
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

export function createBenchmarkScene(method: Method, kernel: Kernel = 'projective') {
  const scene = new Scene();
  scene.background = new Color(0.105, 0.13, 0.16);
  const camera = new PerspectiveCamera(50, 1, 0.1, 100000);
  const a = uniform(new Vector3());
  const b = uniform(new Vector3());
  const d = uniform(new Vector3());
  const period = uniform(PERIOD);
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  const tile = method === 'temporal' ? makeCheckerTexture() : null;
  const uv = positionWorld.xz.div(period);
  let ink;
  if (tile) {
    ink = texture(tile, uv).r;
  } else if (method === 'raw') {
    ink = sin(uv.x.mul(Math.PI * 2)).sign().mul(sign(sin(uv.y.mul(Math.PI * 2)))).mul(0.5).add(0.5);
  } else {
    const p = vec3(screenCoordinate.xy, 1);
    const den = dot(d, p);
    const q = vec3(dot(a, p), dot(b, p), 0).xy.div(den);
    const dx = vec3(a.x, b.x, 0).xy.sub(q.mul(d.x)).div(den);
    const dy = vec3(a.y, b.y, 0).xy.sub(q.mul(d.y)).div(den);
    const dxx = dx.mul(d.x).mul(-2).div(den);
    const dxy = dx.mul(d.y).add(dy.mul(d.x)).negate().div(den);
    const dyy = dy.mul(d.y).mul(-2).div(den);
    ink = kernel === 'lattice'
      ? authorChecker(q, dx, dy, dxx, dxy, dyy, float(SIGMA))
      : projectiveChecker(q, dx, dy, dxx, dxy, dyy, float(SIGMA), d.xy.div(den));
  }
  // wgslFn's type declarations erase its declared scalar return type.
  material.colorNode = mix(vec3(DARK), vec3(LIGHT), ink as ReturnType<typeof float>);
  const geometry = new PlaneGeometry(100000, 100000);
  geometry.rotateX(-Math.PI / 2);
  scene.add(new Mesh(geometry, material));
  return {
    scene, camera,
    update(time: number, motion: CameraMotion, width: number, height: number, detail: number) {
      period.value = PERIOD / detail;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      cameraPose(camera, time, motion);
      const h = homography(camera, width, height, period.value);
      a.value.fromArray(h.u); b.value.fromArray(h.v); d.value.fromArray(h.d);
      return h;
    },
    dispose() { material.dispose(); geometry.dispose(); tile?.dispose(); },
  };
}
