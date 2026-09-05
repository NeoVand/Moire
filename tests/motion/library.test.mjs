// Exercise the real library/history subscriptions with an in-memory storage
// boundary and a controllable autosave timer; no browser or GPU is needed.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = await mkdtemp(join(tmpdir(), 'moire-library-'));
const database = `
  export const state = { session: null, records: new Map(), writes: [] };
  export const storageAvailable = () => true;
  export const requestPersistence = async () => true;
  export const readSession = async () => state.session;
  export const writeSession = async (projectId, scene) => {
    state.session = { projectId, scene }; state.writes.push(state.session);
  };
  export const readProject = async (id) => state.records.get(id);
  export const putProject = async (record) => state.records.set(record.id, record);
  export const listProjects = async () => [...state.records.values()];
  export const deleteProject = async (id) => state.records.delete(id);
  export const newProjectId = () => 'new-project';
`;
const test = `
  import assert from 'node:assert/strict';
  import { useLibraryStore as library } from './src/store/library';
  import { useHistoryStore as history } from './src/store/history';
  import { useProjectStore as project, sceneOf } from './src/store/project';
  import { useTransportStore as transport, applyMotionAt } from './src/store/transport';
  import { createAnimator } from './src/types/motion';
  import { serializeScene } from './src/store/scene';
  import { state as db } from './src/store/db';

  const realTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = new Map(); let next = 1;
  globalThis.setTimeout = (fn) => { const id = next++; timers.set(id, fn); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const flush = async () => {
    const pending = [...timers.values()]; timers.clear();
    pending.forEach((fn) => fn()); await Promise.resolve();
  };
  try {
    project.getState().resetProject();
    const animator = createAnimator('view.envelopeContrast', { from: 1, to: 5, mode: 'once', period: 1 });
    project.getState().setMotion({ animators: [animator], playOnLoad: false });
    project.getState().setView({ envelopeContrast: 4 });
    const saved = serializeScene(sceneOf());
    db.records.set('saved', { id: 'saved', name: 'Saved pose', scene: saved });
    db.session = { projectId: 'saved', scene: saved };
    await library.getState().hydrate();
    assert.equal(project.getState().view.envelopeContrast, 4, 'loading must keep a manual once pose');
    assert.equal(transport.getState().state, 'stopped');
    assert.equal(history.getState().canUndo, false, 'history empty after load or new');

    project.getState().setView({ envelopeContrast: 2 });
    await flush();
    assert.equal(library.getState().dirty, true);
    history.getState().undo();
    await flush();
    assert.equal(project.getState().view.envelopeContrast, 4);
    assert.equal(library.getState().dirty, false, 'undo should match named save');
    assert.equal(JSON.parse(db.session.scene).view.envelopeContrast, 4);

    project.getState().setView({ envelopeContrast: 3 });
    const writesBefore = db.writes.length;
    transport.setState({ recording: true, state: 'paused' });
    await flush();
    applyMotionAt(0.75);
    await flush();
    assert.equal(db.writes.length, writesBefore, 'a take cannot persist a sampled frame');
    project.getState().setView({ envelopeContrast: 3 });
    transport.setState({ recording: false });
    await flush();
    assert.equal(db.writes.length, writesBefore + 1);
    assert.equal(JSON.parse(db.session.scene).view.envelopeContrast, 3);
    history.getState().undo();
    assert.equal(project.getState().view.envelopeContrast, 4, 'capture cannot add an undo entry');

    project.getState().setView({ envelopeContrast: 2 });
    assert.equal(history.getState().canUndo, true);
    await library.getState().open('saved');
    assert.equal(project.getState().view.envelopeContrast, 4);
    assert.equal(history.getState().canUndo, false, 'history empty after load or new');
    library.getState().createNew();
    assert.equal(history.getState().canUndo, false, 'history empty after load or new');
    assert.equal(transport.getState().state, 'stopped');
    console.log('library: manual-pose loading, undo dirty-state, recording autosave isolation and document history passed');
  } finally {
    globalThis.setTimeout = realTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
`;

try {
  const outfile = join(out, 'library.mjs');
  await build({
    stdin: { contents: test, resolveDir: root }, outfile,
    bundle: true, platform: 'node', format: 'esm', define: { 'import.meta.env.DEV': 'false' },
    plugins: [{
      name: 'library-boundaries',
      setup(build) {
        build.onResolve({ filter: /(?:\/db|\/gpu\/(?:capture|recorder|video))$/ }, (args) => ({ path: args.path.endsWith('/db') ? 'db' : args.path, namespace: 'boundary' }));
        build.onLoad({ filter: /.*/, namespace: 'boundary' }, (args) => ({ contents:
          args.path === 'db' ? database : args.path.endsWith('/capture')
            ? 'export const capturePng = async () => { throw new Error("No thumbnail renderer in store test"); };'
            : '',
        }));
      },
    }],
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(out, { recursive: true, force: true });
}
