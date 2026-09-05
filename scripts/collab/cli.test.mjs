import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));

async function fixture(t) {
  const repo = await mkdtemp(join(tmpdir(), 'moire-collab-cli-'));
  await exec('git', ['init', '--quiet', repo]);
  t.after(() => rm(repo, { recursive: true, force: true }));
  const run = async (command, options = [], expectedCode = 0) => {
    const args = [cli, command, '--repo', repo, ...options];
    let code = 0, stdout = '', stderr = '';
    try {
      ({ stdout, stderr } = await exec(process.execPath, args, { timeout: 5000, maxBuffer: 1024 * 1024 }));
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      code = error.code;
      stdout = error.stdout;
      stderr = error.stderr;
    }
    assert.equal(code, expectedCode, `${command} exited ${code}: ${stderr}`);
    if (expectedCode === 0) assert.equal(stderr, '', `${command} wrote unexpected stderr.`);
    return { code, stdout, stderr, data: stdout.trim() ? JSON.parse(stdout) : undefined };
  };
  const send = async (subject, body = subject) => (await run('send', [
    '--agent', 'codex', '--to', 'claude', '--subject', subject, '--message', body,
  ])).data;
  return { repo, run, send };
}

test('CLI sync, inbox, and wait default to unread messages; explicit after=0 reads history', { timeout: 15000 }, async t => {
  const { run, send } = await fixture(t);
  const first = await send('Own comparison shell');
  const second = await send('Keep emitter separate');
  const read = async (command, options = []) => (await run(command, [
    '--agent', 'claude', ...(command === 'wait' ? ['--timeout', '0'] : []), ...options,
  ])).data;

  for (const command of ['sync', 'inbox', 'wait']) {
    const result = await read(command);
    assert.deepEqual(result.messages.map(message => message.id), [first.id, second.id]);
    assert.equal(result.ackThrough, 0, 'Reading must not acknowledge a message.');
    if (command === 'wait') assert.equal(result.timedOut, false);
    if (command === 'sync') assert(result.coordination && result.note.includes('Acknowledge after reading'));
  }
  await run('ack', ['--agent', 'claude', '--through', String(first.id)]);
  for (const command of ['sync', 'inbox', 'wait']) {
    const result = await read(command);
    assert.deepEqual(result.messages.map(message => message.id), [second.id]);
    assert.equal(result.ackThrough, first.id);
  }
  await run('ack', ['--agent', 'claude', '--through', String(second.id)]);
  for (const command of ['sync', 'inbox', 'wait']) {
    const empty = await read(command);
    assert.deepEqual(empty.messages, []);
    if (command === 'wait') assert.equal(empty.timedOut, true);
    const history = await read(command, ['--after', '0']);
    assert.deepEqual(history.messages.map(message => message.id), [first.id, second.id]);
  }
  const next = await send('Next checkpoint');
  const waited = await read('wait', ['--timeout', '100']);
  assert.deepEqual(waited.messages.map(message => message.id), [next.id]);
  assert.equal(waited.timedOut, false);
});

test('CLI body-file preserves multiline text literally and rejects competing body sources', { timeout: 10000 }, async t => {
  const { repo, run } = await fixture(t);
  const file = join(repo, 'handoff with spaces.md');
  const body = 'First line: “Moiré”\nSecond: $HOME $(printf untouched) `printf untouched`\nLiteral backslash: \\n\nLast line.\n';
  await writeFile(file, body, 'utf8');
  const sent = (await run('send', [
    '--agent', 'codex', '--to', 'claude', '--subject', 'Literal handoff', '--body-file', file,
  ])).data;
  assert.equal(sent.body, body);
  const received = (await run('inbox', ['--agent', 'claude'])).data.messages[0];
  assert.equal(received.body, body);
  assert.equal(received.from, 'codex');
  const reply = (await run('send', [
    '--agent', 'claude', '--to', 'codex', '--subject', 'Read exactly', '--message', 'Received without expansion.', '--reply-to', String(sent.id),
  ])).data;
  assert.equal(reply.replyTo, sent.id);
  assert.equal(reply.from, 'claude');
  const denied = await run('send', [
    '--agent', 'codex', '--to', 'claude', '--subject', 'Ambiguous body', '--message', 'Ignored?', '--body-file', file,
  ], 1);
  assert.equal(denied.stdout, '');
  assert.match(denied.stderr, /Use --message or --body-file, not both/);
  assert.equal((await run('inbox', ['--agent', 'claude'])).data.messages.length, 1);
});

test('CLI path conflict exits 2 and foreign claim release is denied without changing ownership', { timeout: 10000 }, async t => {
  const { run } = await fixture(t);
  const claim = (await run('claim', [
    '--agent', 'codex', '--paths', 'src/compare/,tests/compare/', '--task', 'Comparison shell',
  ])).data;
  assert.equal(claim.ok, true);
  assert.deepEqual(claim.claim.paths, ['src/compare', 'tests/compare']);
  const conflict = await run('claim', [
    '--agent', 'claude', '--paths', 'src/compare/renderer.ts', '--task', 'Duplicate renderer',
  ], 2);
  assert.equal(conflict.data.ok, false);
  assert.equal(conflict.data.conflicts[0].agent, 'codex');
  const denied = await run('release', ['--agent', 'claude', '--claim-id', claim.claim.id], 1);
  assert.equal(denied.stdout, '');
  assert.match(denied.stderr, /^NOT_OWNER:/);
  const status = (await run('status')).data;
  assert.equal(status.claims.length, 1);
  assert.equal(status.claims[0].id, claim.claim.id);
  assert.equal(status.claims[0].agent, 'codex');
  const released = (await run('release', ['--agent', 'codex', '--claim-id', claim.claim.id])).data;
  assert.equal(released.released, true);
  const handedOver = (await run('claim', [
    '--agent', 'claude', '--paths', 'src/compare/renderer.ts', '--task', 'Agreed renderer handover',
  ])).data;
  assert.equal(handedOver.ok, true);
});
