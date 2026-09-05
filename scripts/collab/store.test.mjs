import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createStore, resolveRepo } from './store.mjs';

const filename = fileURLToPath(import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.argv[2] === 'worker') {
  const [, , , repo, stateDir, operation, agent, amount] = process.argv;
  const store = createStore({ repo, stateDir });
  if (operation === 'send') {
    const ids = [];
    for (let i = 0; i < Number(amount); i++) ids.push((await store.send({ from: agent, to: 'claude', subject: `Message ${i}`, body: `Durable body ${agent}/${i}` })).id);
    process.stdout.write(JSON.stringify(ids));
  } else {
    process.stdout.write(JSON.stringify(await store.claim({ agent, paths: ['src'], task: `Exclusive task for ${agent}` })));
  }
} else {
  async function fixture(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moire-collab-store-'));
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo);
    execFileSync('git', ['init', '--quiet', repo]);
    const stateDir = path.join(root, 'state');
    try { await run({ root, repo, stateDir, store: createStore({ repo, stateDir }) }); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
  }
  function worker(repo, stateDir, operation, agent, amount = 1) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [filename, 'worker', repo, stateDir, operation, agent, String(amount)], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) { reject(new Error(`Worker failed (${code}): ${stderr}`)); return; }
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
    });
  }

  test('worktrees resolve the same Git common mailbox, outside the tracked tree', () => fixture(async ({ repo, root }) => {
    execFileSync('git', ['-C', repo, '-c', 'user.name=Mailbox Test', '-c', 'user.email=mailbox@example.invalid', 'commit', '--allow-empty', '--quiet', '-m', 'fixture']);
    const worktree = path.join(root, 'worktree');
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--quiet', '--detach', worktree]);
    const a = resolveRepo(repo), b = resolveRepo(worktree);
    assert.equal(a.commonDir, b.commonDir);
    assert.equal(a.stateDir, b.stateDir);
    const left = createStore({ repo }), right = createStore({ repo: worktree });
    assert.ok(Object.isFrozen(left));
    await left.send({ from: 'codex', to: 'claude', subject: 'Worktree', body: 'Same repository, shared mailbox.' });
    assert.equal((await right.inbox({ agent: 'claude' })).messages.length, 1);
  }));

  test('concurrent processes retain every message and allocate monotonic IDs', () => fixture(async ({ repo, stateDir, store }) => {
    const groups = await Promise.all(Array.from({ length: 8 }, (_, i) => worker(repo, stateDir, 'send', `worker${i}`, 30)));
    const ids = groups.flat().sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 240 }, (_, i) => i + 1));
    const first = await store.inbox({ agent: 'claude', limit: 100 });
    const second = await store.inbox({ agent: 'claude', after: first.messages.at(-1).id, limit: 100 });
    const third = await createStore({ repo, stateDir }).inbox({ agent: 'claude', after: second.messages.at(-1).id, limit: 100 });
    assert.equal(first.messages.length + second.messages.length + third.messages.length, 240);
    assert.equal(first.ackThrough, 0);
    assert.equal(third.lastId, 240);
    const raw = JSON.parse(await fs.readFile(path.join(stateDir, 'state.json'), 'utf8'));
    assert.equal(raw.messages.length, 240);
    assert.equal(raw.revision, 240);
    const mode = (await fs.stat(path.join(stateDir, 'state.json'))).mode & 0o777;
    assert.equal(mode, 0o600);
  }));

  test('reading never consumes; ack is monotonic, explicit, and recipient-independent', () => fixture(async ({ store }) => {
    const first = await store.send({ from: 'codex', to: 'claude', subject: 'One', body: 'First body' });
    await store.send({ from: 'claude', to: 'codex', subject: 'Two', body: 'Different recipient', replyTo: first.id });
    const broadcast = await store.send({ from: 'codex', to: 'all', subject: 'All', body: 'Broadcast body' });
    assert.deepEqual((await store.inbox({ agent: 'claude' })).messages.map(m => m.id), [first.id, broadcast.id]);
    assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
    await store.ack({ agent: 'claude', through: broadcast.id });
    const acknowledged = await store.status({ agent: 'claude' });
    await store.ack({ agent: 'claude', through: first.id });
    assert.equal((await store.status()).revision, acknowledged.revision);
    assert.equal((await store.inbox({ agent: 'claude' })).messages.length, 2);
    assert.equal((await store.inbox({ agent: 'claude', after: broadcast.id })).messages.length, 0);
    assert.equal((await store.status()).acks.claude, broadcast.id);
    await assert.rejects(store.ack({ agent: 'claude', through: 999 }), { code: 'INVALID_ARGUMENT' });
    await assert.rejects(store.send({ from: 'codex', to: 'claude', subject: 'Bad reply', body: 'No such parent', replyTo: 999 }), { code: 'NOT_FOUND' });
  }));

  test('concurrent overlapping claims have one winner, with exact ancestor boundaries', () => fixture(async ({ repo, stateDir, store }) => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => worker(repo, stateDir, 'claim', `worker${i}`)));
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.ok(results.filter(result => !result.ok).every(result => result.conflicts.length === 1));
    const winner = results.find(result => result.ok).claim;
    assert.equal((await store.claim({ agent: 'other', paths: ['src/file.ts'], task: 'Descendant' })).ok, false);
    assert.equal((await store.claim({ agent: 'other', paths: ['.'], task: 'Ancestor' })).ok, false);
    assert.equal((await store.claim({ agent: 'other', paths: ['src-other'], task: 'Sibling' })).ok, true);
    await assert.rejects(store.release({ agent: 'other', claimId: winner.id }), { code: 'NOT_OWNER' });
    assert.equal((await store.release({ agent: winner.agent, claimId: winner.id })).released, true);
    assert.equal((await store.release({ agent: winner.agent, claimId: winner.id })).released, false);
  }));

  test('leases normalize, renew, expire visibly and cannot reclaim a newer owner', () => fixture(async ({ store }) => {
    const first = await store.claim({ agent: 'codex', paths: ['./src//gpu/', 'docs', 'docs'], task: 'Implementation', ttlSeconds: 1 });
    assert.deepEqual(first.claim.paths, ['docs', 'src/gpu']);
    const renewed = await store.claim({ agent: 'codex', paths: ['docs/', 'src/gpu'], task: 'Implementation', ttlSeconds: 1 });
    assert.equal(renewed.claim.id, first.claim.id); assert.equal(renewed.renewed, true); assert.equal(renewed.wasExpired, false);
    assert.equal((await store.claim({ agent: 'codex', paths: ['src'], task: 'Different scope' })).ok, false);
    await delay(1100);
    const expired = await store.status();
    assert.equal(expired.claims.length, 0); assert.equal(expired.expiredClaims[0].id, first.claim.id);
    const replacement = await store.claim({ agent: 'claude', paths: ['src/gpu/shader.ts'], task: 'New owner' });
    assert.equal(replacement.ok, true);
    const blocked = await store.claim({ agent: 'codex', paths: ['docs', 'src/gpu'], task: 'Implementation' });
    assert.equal(blocked.ok, false); assert.equal(blocked.conflicts[0].agent, 'claude');
    await store.release({ agent: 'claude', claimId: replacement.claim.id });
    const restored = await store.claim({ agent: 'codex', paths: ['docs', 'src/gpu'], task: 'Implementation' });
    assert.equal(restored.claim.id, first.claim.id); assert.equal(restored.wasExpired, true);
  }));

  test('unsafe identities, paths and payload sizes are rejected without prototype mutation', () => fixture(async ({ store }) => {
    for (const agent of ['__proto__', 'constructor', 'prototype', 'a/b', 'Two words', '', 'a'.repeat(41)]) {
      await assert.rejects(store.inbox({ agent }), { code: 'INVALID_AGENT' });
      await assert.rejects(store.send({ from: 'codex', to: agent, subject: 'No', body: 'No' }), { code: 'INVALID_AGENT' });
    }
    for (const claimed of ['/tmp/file', '../escape', 'src/../escape', 'C:\\escape', '\\\\server\\share', 'src\0file', 'src\nfile']) {
      await assert.rejects(store.claim({ agent: 'codex', paths: [claimed], task: 'No' }), { code: 'INVALID_PATH' });
    }
    await assert.rejects(store.send({ from: 'codex', to: 'claude', subject: 'Large', body: 'x'.repeat(16001) }), { code: 'INVALID_ARGUMENT' });
    await assert.rejects(store.inbox({ agent: 'claude', after: -1 }), { code: 'INVALID_ARGUMENT' });
    await assert.rejects(store.claim({ agent: 'codex', paths: ['src'], task: 'Long lease', ttlSeconds: 86401 }), { code: 'INVALID_ARGUMENT' });
    assert.equal({}.polluted, undefined);
    assert.equal((await store.status()).revision, 0);
  }));

  test('wait wakes on a message, times out without consuming, and cancels promptly', () => fixture(async ({ store }) => {
    const waiting = store.wait({ agent: 'claude', timeoutMs: 2000 });
    await delay(30);
    const message = await store.send({ from: 'codex', to: 'claude', subject: 'Wake', body: 'Ready' });
    const delivered = await waiting;
    assert.equal(delivered.timedOut, false); assert.equal(delivered.messages[0].id, message.id);
    assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
    assert.equal((await store.wait({ agent: 'claude', after: message.id, timeoutMs: 20 })).timedOut, true);
    const controller = new AbortController();
    const start = Date.now();
    const cancelled = store.wait({ agent: 'claude', after: message.id, timeoutMs: 30000, signal: controller.signal });
    const rejection = assert.rejects(cancelled, { code: 'ABORTED' });
    setTimeout(() => controller.abort(), 20);
    await rejection;
    assert.ok(Date.now() - start < 500);
  }));

  test('corrupt state is preserved and existing locks are never stolen', () => fixture(async ({ store, stateDir }) => {
    await fs.mkdir(stateDir);
    const target = path.join(stateDir, 'state.json');
    await fs.writeFile(target, '{ broken');
    await assert.rejects(store.send({ from: 'codex', to: 'claude', subject: 'No', body: 'No' }), { code: 'CORRUPT_STATE' });
    assert.equal(await fs.readFile(target, 'utf8'), '{ broken');
    await fs.unlink(target);
    const lock = path.join(stateDir, 'write.lock');
    await fs.mkdir(lock);
    const owner = JSON.stringify({ pid: process.pid, purpose: 'Test lock must survive.' });
    await fs.writeFile(path.join(lock, 'owner.json'), owner);
    assert.equal((await store.inbox({ agent: 'claude' })).messages.length, 0);
    await assert.rejects(store.send({ from: 'codex', to: 'claude', subject: 'Blocked', body: 'Do not steal' }), { code: 'LOCK_TIMEOUT' });
    assert.equal(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'), owner);
  }));
}
