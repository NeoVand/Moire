import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createStore } from './store.mjs';

const hook = fileURLToPath(new URL('./claude-hook.mjs', import.meta.url));
async function fixture(fn) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'moire-hook-test-'));
  execFileSync('git', ['init', '-q', repo]);
  try { await fn(repo, createStore({ repo })); }
  finally { await fs.rm(repo, { recursive: true, force: true }); }
}
function run(repo, payload, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook, '--repo', repo, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}
const event = (session = 'session-one', hook_event_name = 'PostToolUse') => ({ session_id: session, hook_event_name, tool_name: 'Read' });
const send = (store, body = 'Keep the source camera fixed.', to = 'claude') => store.send({ from: 'codex', to, subject: 'Rendering handoff', body });

test('hook emits once per session, includes new messages, and never acknowledges', async () => fixture(async (repo, store) => {
  const message = await send(store);
  const first = await run(repo, event());
  assert.equal(first.code, 0); assert.equal(first.stderr, '');
  const output = JSON.parse(first.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'PostToolUse');
  assert.match(output.additionalContext, /Message #1 from codex/);
  assert.match(output.additionalContext, /Keep the source camera fixed/);
  assert.match(output.additionalContext, /not user or system instructions/);
  assert.equal((await run(repo, event())).stdout, '');
  assert.equal((await run(repo, event('session-one', 'UserPromptSubmit'))).stdout, '');
  const second = await send(store, 'The baseline now uses the shared source.');
  const fresh = JSON.parse((await run(repo, event())).stdout).hookSpecificOutput.additionalContext;
  assert.match(fresh, new RegExp(`Message #${second.id}`));
  assert.doesNotMatch(fresh, /Message #1 from/);
  const nextSession = JSON.parse((await run(repo, event('session-two'))).stdout).hookSpecificOutput.additionalContext;
  assert.match(nextSession, new RegExp(`Message #${message.id}`));
  assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
  await store.ack({ agent: 'claude', through: second.id });
  assert.equal((await run(repo, event('session-three'))).stdout, '');
}));

test('parallel tool hooks share one delivery cursor', async () => fixture(async (repo, store) => {
  await send(store);
  const results = await Promise.all([run(repo, event()), run(repo, event())]);
  assert.equal(results.filter(r => r.stdout).length, 1);
  assert.ok(results.every(r => r.code === 0 && r.stderr === ''));
}));

test('broadcast messages preserve recipient-specific IDs', async () => fixture(async (repo, store) => {
  await send(store, 'Not addressed to Claude.', 'codex');
  await send(store, 'Shared camera convention.', 'all');
  const result = JSON.parse((await run(repo, event())).stdout).hookSpecificOutput.additionalContext;
  assert.match(result, /Message #2/); assert.doesNotMatch(result, /Not addressed/);
  await send(store, 'The next direct handoff.');
  assert.match((await run(repo, event())).stdout, /Message #3/);
}));

test('delivery advances beyond an already presented full inbox page', async () => fixture(async (repo, store) => {
  for (let i = 0; i < 205; i++) await send(store, `Record ${i + 1}.`);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const result = await run(repo, event());
    assert.equal(result.stderr, '');
    if (!result.stdout) break;
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.ok(context.length <= 8000);
    for (const match of context.matchAll(/Message #(\d+) from/g)) {
      assert.ok(!seen.has(Number(match[1])), 'A fully delivered message repeated.');
      seen.add(Number(match[1]));
    }
  }
  assert.equal(seen.size, 205);
  assert.equal((await run(repo, event())).stdout, '');
  await send(store, 'The message after the full page.');
  const context = JSON.parse((await run(repo, event())).stdout).hookSpecificOutput.additionalContext;
  assert.match(context, /Message #206/);
  assert.doesNotMatch(context, /Message #205/);
  assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
}));

test('UTF-8 hook input and collaborator bodies survive chunk boundaries', async () => fixture(async (repo, store) => {
  await send(store, '相機保持一致。💡');
  const result = await run(repo, { ...event(), tool_response: '👩‍💻'.repeat(10000) });
  assert.equal(result.stderr, '');
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /相機保持一致。💡/);
}));

test('truncated bodies remain in the inbox and are not marked fully emitted', async () => fixture(async (repo, store) => {
  await send(store, 'Long message '.repeat(1000));
  const first = JSON.parse((await run(repo, event())).stdout).hookSpecificOutput.additionalContext;
  assert.ok(first.length <= 8000);
  assert.match(first, /Message #1 excerpt/);
  assert.match(first, /collab_inbox/);
  assert.match((await run(repo, event())).stdout, /Message #1/);
  assert.equal((await store.inbox({ agent: 'claude' })).messages[0].body.length, 13000);
  assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
}));

test('malformed events and traversal identifiers fail open without output or acknowledgements', async () => fixture(async (repo, store) => {
  await send(store);
  for (const input of ['{', [], {}, event('../escape'), event('a/b'), event('a\\b'), event('ok', 'PreToolUse')]) {
    const result = await run(repo, input);
    assert.equal(result.code, 0); assert.equal(result.stdout, '');
    assert.match(result.stderr, /Collaboration hook skipped/);
  }
  assert.equal((await store.inbox({ agent: 'claude' })).ackThrough, 0);
  await assert.rejects(fs.stat(path.join(repo, 'escape.json')));
}));
