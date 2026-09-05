import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('./server.mjs', import.meta.url));

async function repository(t) {
  const repo = await mkdtemp(join(tmpdir(), 'moire-collab-stdio-'));
  execFileSync('git', ['init', '--quiet', repo]);
  t.after(() => rm(repo, { recursive: true, force: true }));
  return repo;
}

function peer(t, repo, agent) {
  const child = spawn(process.execPath, [server, '--repo', repo, '--agent', agent], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  const messages = [];
  let nextId = 1;
  let stderr = '';
  let exited = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', value => { stderr += value; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const message = JSON.parse(line); // A stray log on stdout fails the real transport.
    messages.push(message);
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); }
  });
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      exited = true;
      for (const resolvePending of pending.values()) resolvePending({ closed: true });
      pending.clear();
      resolve({ code, signal, stderr });
    });
  });
  t.after(async () => {
    if (!exited) child.stdin.end();
    const timer = setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 1500);
    try { await exit; } finally { clearTimeout(timer); }
  });
  function expect(id, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`No response to ${String(id)} from ${agent}: ${stderr}`));
      }, timeoutMs);
      pending.set(id, value => { clearTimeout(timer); resolve(value); });
    });
  }
  function rpc(method, params = {}, id = nextId++) {
    const response = expect(id);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return response;
  }
  const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  return {
    child, exit, messages, rpc, notify,
    async raw(line, id = null) {
      const response = expect(id);
      child.stdin.write(`${line}\n`);
      return response;
    },
    async init(protocolVersion = '2025-06-18') {
      const reply = await rpc('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: agent, version: 'test' } });
      assert(!reply.error, JSON.stringify(reply));
      notify('notifications/initialized');
      return reply.result;
    },
    async tool(name, args = {}) {
      const response = await rpc('tools/call', { name, arguments: args });
      assert(!response.error, JSON.stringify(response));
      assert(response.result.content[0].type === 'text');
      return { data: JSON.parse(response.result.content[0].text), isError: response.result.isError };
    },
  };
}

test('stdio protocol negotiation, tool list, bound identity, and parse errors', { timeout: 10000 }, async t => {
  const repo = await repository(t);
  const codex = peer(t, repo, 'codex');
  assert.deepEqual((await codex.rpc('ping')).result, {});
  assert.equal((await codex.rpc('tools/list')).error.code, -32002);
  assert.equal((await codex.raw('{not-json')).error.code, -32700);
  assert.equal((await codex.raw('[]')).error.code, -32600);
  const initialization = await codex.init('2099-01-01');
  assert.equal(initialization.protocolVersion, '2024-11-05');
  assert.deepEqual(initialization.capabilities, { tools: {} });
  assert(initialization.instructions.includes('Connected as codex'));
  const listing = await codex.rpc('tools/list');
  assert.equal(listing.result.tools.length, 7);
  assert(listing.result.tools.every(item => item.inputSchema.additionalProperties === false));
  assert.equal((await codex.rpc('tools/call', {
    name: 'collab_send', arguments: { to: 'claude', from: 'claude', subject: 'spoof', body: 'x' },
  })).error.code, -32602);
  assert.equal((await codex.rpc('tools/call', { name: 'collab_wait', arguments: { timeoutMs: 30001 } })).error.code, -32602);
  assert.equal((await codex.rpc('not-a-method', {}, 'string-request-id')).id, 'string-request-id');
  assert.equal((await codex.rpc('not-a-method')).error.code, -32601);
  const status = await codex.tool('collab_status');
  assert.equal(status.data.connectedAs, 'codex');
});

test('two actual stdio peers exchange durable messages and explicit acknowledgements', { timeout: 10000 }, async t => {
  const repo = await repository(t);
  const codex = peer(t, repo, 'codex'), claude = peer(t, repo, 'claude');
  await Promise.all([codex.init(), claude.init('2025-03-26')]);
  const sent = await codex.tool('collab_send', { to: 'claude', subject: 'GPU work split', body: 'I own the comparison shell.\nPlease own the compiler emitter.' });
  assert.equal(sent.isError, false);
  assert.equal(sent.data.from, 'codex');
  const firstRead = await claude.tool('collab_inbox');
  assert.deepEqual(firstRead.data.messages.map(message => message.id), [sent.data.id]);
  const repeatedRead = await claude.tool('collab_inbox');
  assert.deepEqual(repeatedRead.data.messages, firstRead.data.messages); // Reads never auto-ack.
  await claude.tool('collab_ack', { through: sent.data.id });
  assert.equal((await claude.tool('collab_inbox')).data.messages.length, 0);
  assert.equal((await claude.tool('collab_inbox', { after: 0 })).data.messages.length, 1);
  const reply = await claude.tool('collab_send', {
    to: 'codex', subject: 'Emitter owned', body: 'Agreed. Please keep the shared shader contract stable.', replyTo: sent.data.id,
  });
  assert.equal(reply.data.from, 'claude');
  assert.equal(reply.data.replyTo, sent.data.id);
  const received = await codex.tool('collab_wait', { timeoutMs: 500 });
  assert.equal(received.data.timedOut, false);
  assert.equal(received.data.messages[0].id, reply.data.id);
  await codex.tool('collab_ack', { through: reply.data.id });
  const broadcast = await codex.tool('collab_send', { to: 'all', subject: 'Checkpoint', body: 'Both participants can read this.' });
  assert((await claude.tool('collab_inbox')).data.messages.some(message => message.id === broadcast.data.id));
});

test('claims catch path overlap and cannot be released by the other connection', { timeout: 10000 }, async t => {
  const repo = await repository(t);
  const codex = peer(t, repo, 'codex'), claude = peer(t, repo, 'claude');
  await Promise.all([codex.init(), claude.init()]);
  const claim = await codex.tool('collab_claim', { paths: ['src/compare'], task: 'Comparison interface' });
  assert.equal(claim.data.ok, true);
  const overlap = await claude.tool('collab_claim', { paths: ['src/compare/renderer.ts'], task: 'Conflicting renderer' });
  assert.equal(overlap.data.ok, false);
  assert(overlap.data.conflicts.length > 0);
  const forbidden = await claude.tool('collab_release', { claimId: claim.data.claim.id });
  assert.equal(forbidden.isError, true);
  assert.equal(forbidden.data.code, 'NOT_OWNER');
  await codex.tool('collab_release', { claimId: claim.data.claim.id });
  assert.equal((await claude.tool('collab_claim', { paths: ['src/compare/renderer.ts'], task: 'Agreed handover' })).data.ok, true);
});

test('bounded waits allow ping/send, support cancellation, and close promptly on EOF', { timeout: 10000 }, async t => {
  const repo = await repository(t);
  const codex = peer(t, repo, 'codex'), claude = peer(t, repo, 'claude');
  await Promise.all([codex.init(), claude.init()]);
  const timeout = await claude.tool('collab_wait', { timeoutMs: 30 });
  assert.equal(timeout.data.timedOut, true);
  assert.equal(timeout.data.messages.length, 0);
  const waiting = claude.rpc('tools/call', { name: 'collab_wait', arguments: { timeoutMs: 30000 } }, 'waiting');
  assert.deepEqual((await claude.rpc('ping')).result, {});
  await codex.tool('collab_send', { to: 'claude', subject: 'Wake waiting call', body: 'This arrives over the shared durable store.' });
  const delivered = JSON.parse((await waiting).result.content[0].text);
  assert.equal(delivered.timedOut, false);
  await claude.tool('collab_ack', { through: delivered.messages[0].id });
  const cancelled = claude.rpc('tools/call', { name: 'collab_wait', arguments: { timeoutMs: 30000 } }, 'cancel-me');
  claude.notify('notifications/cancelled', { requestId: 'cancel-me', reason: 'Test cancellation.' });
  const cancellation = await cancelled;
  assert.equal(cancellation.result.isError, true);
  assert.equal(JSON.parse(cancellation.result.content[0].text).code, 'ABORTED');
  const pendingAtExit = claude.rpc('tools/call', { name: 'collab_wait', arguments: { timeoutMs: 30000 } }, 'close-me');
  await claude.rpc('ping');
  const started = performance.now();
  claude.child.stdin.end();
  const result = await claude.exit;
  assert.equal(result.code, 0, result.stderr);
  assert(performance.now() - started < 1500, 'EOF must cancel the 30-second wait.');
  await pendingAtExit;
});
