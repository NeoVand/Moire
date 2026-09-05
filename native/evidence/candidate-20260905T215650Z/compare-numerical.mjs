// CPU-only comparison of archived results. No browser, renderer, or live kernel import.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(here, 'numerical-comparison.json');
const sha = data => createHash('sha256').update(data).digest('hex');
const relative = p => path.relative(root, p);
const paths = {
  candidate: path.join(here, 'materials.json'),
  frozen: path.join(root, 'docs/compare-evidence/bounded-materials-2026-09-05T20-20-28.274Z.json'),
  homography: path.join(here, 'homography.json'), watchdog: path.join(here, 'watchdog.json'),
  provenance: path.join(here, 'provenance.json'),
  compilation: path.join(here, '../compile-20260905T215656.380252Z/report.json'),
};
const raw = Object.fromEntries(Object.entries(paths).map(([key, p]) => [key, fs.readFileSync(p)]));
const data = Object.fromEntries(Object.entries(raw).map(([key, bytes]) => [key, JSON.parse(bytes)]));
const { candidate, frozen, homography, watchdog, provenance, compilation } = data;
const failures = [], checks = [];
const check = (name, passed, detail = null) => {
  checks.push({ name, passed, ...(detail === null ? {} : { detail }) });
  if (!passed) failures.push({ name, detail });
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('candidate material report passed', candidate.status === 'passed');
check('frozen material report passed', frozen.status === 'passed');
check('candidate source stable during GPU run', equal(candidate.sourceHashes, candidate.sourceHashesAfter));
check('frozen source stable during GPU run', equal(frozen.sourceHashes, frozen.sourceHashesAfter));
check('candidate archive and production file stable during GPU run', candidate.kernelSourceVerification?.valid === true);

const harnessComparison = Object.keys(frozen.sourceHashes).map(file => ({ file,
  frozen: frozen.sourceHashes[file], candidate: candidate.sourceHashes[file],
  same: frozen.sourceHashes[file] === candidate.sourceHashes[file] }));
check('numerical scene, adapters, browser capture, reference and production control match',
  harnessComparison.every(row => row.same || row.file === 'tests/compare/materials.mjs'), harnessComparison);
check('same adapter and browser', equal(candidate.adapter, frozen.adapter) && candidate.browser === frozen.browser);
check('candidate uses immutable committed core', candidate.kernelSource.mode === 'immutable-git-candidate'
  && candidate.kernelSource.commit === '6eddded0ef1f04479a9b0560ddda881307e4eece'
  && candidate.kernelSource.selectedExport === 'OURS_KERNEL_CORE' && candidate.kernelSource.workCounterShim === false);

const snapshotPath = path.resolve(here, candidate.kernelSource.snapshot);
const snapshot = fs.readFileSync(snapshotPath);
const adapterPath = path.resolve(here, candidate.kernelSource.adapter);
check('raw candidate snapshot hash', sha(snapshot) === candidate.kernelSource.sha256
  && candidate.kernelSource.sha256 === provenance.source_sha256);
check('recorded adapter hash', sha(fs.readFileSync(adapterPath)) === candidate.kernelSource.adapterSha256);
// The archived self-contained module is pure constant/string construction.
// A data URL cannot fall back to the working production module. This derives
// the selected WGSL hash; it is not a new GPU readback or compiler execution.
const module = await import('data:text/javascript;base64,' + snapshot.toString('base64'));
const core = module[candidate.kernelSource.selectedExport];
const coreHash = typeof core === 'string' ? sha(core) : null;
check('independently extracted core matches provenance and watchdog', coreHash !== null
  && coreHash === provenance.core_sha256 && coreHash === watchdog.versions[0].kernelHash);
check('direct fixtures share candidate module and selected export',
  homography.kernelSource.sha256 === candidate.kernelSource.sha256
  && homography.kernelSource.selectedExport === candidate.kernelSource.selectedExport
  && sha(fs.readFileSync(path.join(here, homography.kernelSource.snapshot))) === candidate.kernelSource.sha256);
check('HLSL compilation is from this candidate', compilation.status === 'passed'
  && compilation.jobs.length === 8 && compilation.jobs.every(job => job.exit_code === 0 && job.object_magic_valid)
  && compilation.source_unchanged_compilation === true && compilation.source_sha256 === provenance.hlsl_sha256
  && sha(fs.readFileSync(path.join(here, 'kernel.hlsl'))) === provenance.hlsl_sha256);

const key = c => JSON.stringify([c.width, c.height, c.motion, c.time, c.detail]);
const frozenCases = new Map(frozen.results.map(c => [key(c.configuration), c]));
check('same unique configurations', frozenCases.size === frozen.results.length
  && candidate.results.length === frozen.results.length
  && new Set(candidate.results.map(c => key(c.configuration))).size === candidate.results.length);
const paired = [], caseCounts = [];
for (const current of candidate.results) {
  const old = frozenCases.get(key(current.configuration));
  check('matching configuration ' + key(current.configuration), !!old);
  if (!old) continue;
  check('same float format ' + key(current.configuration),
    current.floatReadback.actual === 'RGBA32Float' && current.floatReadback.actual === old.floatReadback.actual);
  const pixels = new Map(old.probes.map(p => [`${p.x},${p.y}`, p]));
  check('same unique probe set ' + key(current.configuration), pixels.size === old.probes.length
    && current.probes.length === old.probes.length
    && new Set(current.probes.map(p => `${p.x},${p.y}`)).size === current.probes.length);
  for (const p of current.probes) {
    const q = pixels.get(`${p.x},${p.y}`);
    check('matching probe ' + key(current.configuration) + `:${p.x},${p.y}`, !!q);
    if (q) paired.push({ configuration: current.configuration, x: p.x, y: p.y, candidate: p, frozen: q });
  }
  caseCounts.push({ configuration: current.configuration, matchedPixels: current.probes.length });
}
check('all 120 archived probes matched', paired.length === 120);
const tolerance = 1e-4;
function compare(field, limit) {
  const rows = paired.map(p => ({ configuration: p.configuration, x: p.x, y: p.y,
    candidate: p.candidate[field], frozen: p.frozen[field], delta: p.candidate[field] - p.frozen[field] }));
  const bad = rows.filter(p => !Number.isFinite(p.candidate) || !Number.isFinite(p.frozen) || Math.abs(p.delta) > limit);
  const changed = rows.filter(p => p.delta !== 0);
  const max = rows.reduce((a, b) => Math.abs(b.delta) > Math.abs(a.delta) ? b : a);
  check(field + ' per-pixel difference', bad.length === 0, bad.length ? bad : null);
  return { pixels: rows.length, tolerance: limit, passed: bad.length === 0, changedPixels: changed.length,
    maxAbsoluteDifference: Math.abs(max.delta), rmsDifference: Math.sqrt(rows.reduce((s, p) => s + p.delta ** 2, 0) / rows.length),
    maximum: Math.abs(max.delta) ? max : null, changed };
}
const filtered = Object.fromEntries(['latticeFloat', 'homographyFloat'].map(field => [field, compare(field, tolerance)]));
const controls = Object.fromEntries(['reference', 'sequenceDifference', 'point', 'raw', 'rawError', 'spectral', 'spectralFloat',
  'spectralError', 'spectralFloatError', 'lattice', 'homography'].map(field => [field, compare(field, 0)]));
check('same source-stability and polarity labels', paired.every(p => ['pointStable', 'latticePolarityCheck', 'homographyPolarityCheck']
  .every(field => p.candidate[field] === p.frozen[field])));
for (const [name, file] of Object.entries(paths)) check('input file unchanged: ' + name, sha(fs.readFileSync(file)) === sha(raw[name]));
check('snapshot unchanged during CPU extraction', sha(fs.readFileSync(snapshotPath)) === sha(snapshot));

const report = {
  createdAt: new Date().toISOString(), status: failures.length ? 'failed' : 'passed', cpuOnly: true,
  utility: { path: relative(fileURLToPath(import.meta.url)), sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) },
  inputs: Object.fromEntries(Object.entries(paths).map(([name, file]) => [name, { path: relative(file), sha256: sha(raw[name]) }])),
  comparison: { frozenCommit: '1612267f55e9d00ec07482036427c69644e3cb19', candidate: candidate.kernelSource,
    selectedCoreSha256: coreHash, selectedCoreUtf8Bytes: typeof core === 'string' ? Buffer.byteLength(core) : null,
    coreHashOrigin: 'CPU extraction from the exact archived module; matches independent provenance and the pre-instrumentation watchdog hash. Original material report records raw-module hash plus selected export, not a separate device-observed core hash.',
    units: 'Linear intensity [0,1], sampled first color channel from RGBA32Float captures.',
    threshold: tolerance, cases: caseCounts, filtered, controls },
  sourceAudit: { harnessComparison,
    runnerChange: 'Only candidate-selection and provenance plumbing differ between the archived material runners; captured shader adapters, scene, reference and browser capture source hashes are identical.',
    productionDependency: 'The production file must exist for normal Vite resolution and is read only for integrity hashing. Its shader body is not loaded in candidate mode: the pre-load plugin returns the archived candidate via a private virtual module. This test host still uses the explicitly recorded live scene and adapters.',
    candidateDependency: 'The selector rejects external module imports, re-exports, dynamic imports and import.meta; this archived module constructs its exports without external artifacts. No WORK declaration is injected.' },
  gateSummary: { directFixtures: { status: homography.status, count: homography.results.length },
    materialProbes: { status: candidate.status, count: paired.length },
    watchdog: { status: watchdog.status, checks: watchdog.versions[0].watchdogChecks.length,
      note: 'Includes an intentionally infinite negative control that must exhaust its budget; non-exhaustion does not certify numerical accuracy or timing.' },
    compilation: { status: compilation.status, jobs: compilation.jobs.length, note: 'Standalone DXC checker/circle pixel and compute entry wrappers, DXIL and SPIR-V; not Unreal material or Metal execution.' } },
  limitations: ['120 fixed checkerboard material probes in three poses; not a bound on every image pixel or all scenes.',
    'The separate 122 direct fixtures include circles, but these full-scene material probes are checkerboard only.',
    'Unchanged noisy Gaussian references enable a candidate-vs-frozen comparison; sequence disagreement remains an observation, not an error bound.',
    'Selecting OURS_KERNEL_CORE excludes the ripple extension. This package does not validate ripple rendering.',
    'No candidate performance measurement, native rendering validation, or production promotion is claimed.'],
  checks, failures,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, report: out,
  latticeMax: filtered.latticeFloat.maxAbsoluteDifference, homographyMax: filtered.homographyFloat.maxAbsoluteDifference,
  controlsExactlyEqual: Object.values(controls).every(c => c.changedPixels === 0), failures }, null, 2));
if (failures.length) process.exitCode = 1;
