import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import { createCandidateSource, assertCandidateUnchanged, PRODUCTION_KERNEL } from './candidate-source.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t, source = "export const OURS_KERNEL = 'candidate';\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moire-candidate-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(root, 'demo'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(root, PRODUCTION_KERNEL), "export const OURS_KERNEL = 'production';\n");
  fs.writeFileSync(path.join(root, 'demo/candidate.js'), source);
  fs.symlinkSync('candidate.js', path.join(root, 'demo/link.js'));
  git(['init', '-q']);
  git(['add', '.']);
  git(['-c', 'user.name=Candidate Test', '-c', 'user.email=candidate-test@example.invalid', 'commit', '-qm', 'Fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  const args = ['--kernel-ref=' + commit, '--kernel-path=demo/candidate.js'];
  return { root, git, commit, args,
    select: (argv = args, name = 'report.json') => createCandidateSource({ root, argv, evidencePath: path.join(root, name) }) };
}

test('default leaves the working-tree module and export selection unchanged', t => {
  const f = fixture(t);
  const selection = f.select([]);
  assert.deepEqual(selection.plugins, []);
  assert.equal(selection.metadata.mode, 'working-tree');
  assert.equal(selection.metadata.selectedExport, 'OURS_KERNEL');
  assert.match(selection.readSource(), /production/);
  assert.equal(assertCandidateUnchanged(selection).valid, true);
  assert.equal(fs.existsSync(path.join(f.root, 'report.json.kernel')), false);
});

test('exact Git bytes survive working candidate edits; only the production module is overridden', async t => {
  const source = Buffer.from("// exact CRLF snapshot\r\nexport const OURS_KERNEL_CORE = 'core';\r\nexport const OURS_KERNEL = 'full ripple module';\r\nexport const HAS_WORK_COUNTER = true;\r\nexport const other = 19;\r\nexport default 'kept';\r\n");
  const f = fixture(t, source);
  const before = fs.readFileSync(path.join(f.root, PRODUCTION_KERNEL));
  fs.writeFileSync(path.join(f.root, 'demo/candidate.js'), "throw Error('mutable file must never load');\n");
  const selection = f.select();
  assert.equal(selection.metadata.commit, f.commit);
  assert.equal(selection.metadata.sha256, sha(source));
  assert.equal(selection.metadata.selectedExport, 'OURS_KERNEL_CORE');
  assert.equal(selection.metadata.workCounterShim, false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, selection.metadata.snapshot)), source);
  assert.equal(selection.readSource(), source.toString('utf8'));
  const plugin = selection.plugins[0];
  assert.equal(plugin.enforce, 'pre');
  assert.equal(plugin.load(path.join(f.root, 'demo/candidate.js')), null);
  assert.equal(plugin.load('/other/demo/ours-kernel.wgsl.js'), null);
  assert.equal(plugin.load('/demo/ours-kernel.wgsl.js'), null);
  const server = await createServer({ root: f.root, configFile: false, plugins: selection.plugins,
    server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  try {
    const client = await server.transformRequest('/demo/ours-kernel.wgsl.js');
    assert.match(client.code, /OURS_KERNEL_CORE as OURS_KERNEL/);
    const module = await server.ssrLoadModule('/demo/ours-kernel.wgsl.js');
    assert.equal(module.OURS_KERNEL, 'core');
    assert.equal(module.OURS_KERNEL_CORE, 'core');
    assert.equal(module.HAS_WORK_COUNTER, true);
    assert.equal(module.other, 19);
    assert.equal(module.default, 'kept');
    assert.equal(assertCandidateUnchanged(selection).valid, true);
    assert.deepEqual(fs.readFileSync(path.join(f.root, PRODUCTION_KERNEL)), before);
  } finally { await server.close(); }
});

test('missing core preserves OURS_KERNEL and existing evidence cannot be overwritten', t => {
  const f = fixture(t);
  const selection = f.select();
  assert.equal(selection.metadata.selectedExport, 'OURS_KERNEL');
  assert.match(selection.plugins[0].load(fs.realpathSync(path.join(f.root, PRODUCTION_KERNEL))), /OURS_KERNEL as OURS_KERNEL/);
  assert.throws(() => f.select(), /EEXIST/);
});

test('bad or partial refs and unsafe/non-blob paths reject before creating evidence', t => {
  const f = fixture(t);
  const failures = [
    ['--kernel-ref=HEAD'], ['--kernel-path=demo/candidate.js'], ['--kernel-ref', '--kernel-path=demo/candidate.js'],
    ['--kernel-ref=', '--kernel-path=demo/candidate.js'], [...f.args, '--kernel-ref=HEAD'],
    ['--kernel-ref=--help', '--kernel-path=demo/candidate.js'],
    ['--kernel-ref=not-a-commit', '--kernel-path=demo/candidate.js'],
    ...['../candidate.js', '/demo/candidate.js', 'demo/../candidate.js', 'demo//candidate.js', 'demo\\candidate.js',
      'demo/link.js', 'demo/missing.js', 'demo', 'demo/candidate.js:evil', 'demo/candidate.js\n'].map(p => ['--kernel-ref=HEAD', '--kernel-path=' + p]),
  ];
  for (const argv of failures) assert.throws(() => f.select(argv), undefined, argv.join(' '));
  assert.equal(fs.existsSync(path.join(f.root, 'report.json.kernel')), false);
});

test('immutable module cannot borrow mutable imports or hide a missing shader export', t => {
  const f = fixture(t);
  const sources = [
    "import './working.js'; export const OURS_KERNEL = 'x';",
    "export * from './working.js';",
    "export { kernel as OURS_KERNEL } from './working.js';",
    "export const OURS_KERNEL = 'x'; const later = () => import('./working.js');",
    "export const OURS_KERNEL = import.meta.url;",
    "export const other = 'not a kernel';",
  ];
  for (const [index, source] of sources.entries()) {
    fs.writeFileSync(path.join(f.root, 'demo/candidate.js'), source);
    f.git(['add', '.']);
    f.git(['-c', 'user.name=Candidate Test', '-c', 'user.email=candidate-test@example.invalid', 'commit', '-qm', 'Rejected fixture']);
    assert.throws(() => f.select(['--kernel-ref=HEAD', '--kernel-path=demo/candidate.js'], `rejected${index}.json`));
    assert.equal(fs.existsSync(path.join(f.root, `rejected${index}.json.kernel`)), false);
  }
});

test('verification exposes production edits and archive tampering without changing served bytes', t => {
  const f = fixture(t);
  const selection = f.select();
  const captured = selection.readSource();
  fs.writeFileSync(path.join(f.root, PRODUCTION_KERNEL), 'production changed');
  assert.equal(selection.verify().productionUnchanged, false);
  assert.throws(() => assertCandidateUnchanged(selection), /changed/);
  const snapshot = path.join(f.root, selection.metadata.snapshot);
  fs.chmodSync(snapshot, 0o644);
  fs.writeFileSync(snapshot, 'tampered archive');
  assert.equal(selection.verify().snapshotUnchanged, false);
  assert.equal(selection.readSource(), captured);
});
