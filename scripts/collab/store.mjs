import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const AGENT = /^[a-z][a-z0-9_-]{0,39}$/;
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);
const MAX_BODY = 16000;
const LOCK_TIMEOUT = 5000;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function agentName(value) {
  if (typeof value !== 'string' || !AGENT.test(value) || RESERVED.has(value)) fail('INVALID_AGENT', 'Agent names must match /^[a-z][a-z0-9_-]{0,39}$/ and cannot be prototype keys.');
  return value;
}
function text(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail('INVALID_ARGUMENT', `${name} must contain 1–${maximum} characters.`);
  return value;
}
function integer(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_ARGUMENT', `${name} must be an integer from ${min} through ${max}.`);
  return value;
}
function pathsOf(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 64) fail('INVALID_PATH', 'Supply 1–64 repository-relative paths.');
  const normalized = values.map(value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\0\r\n]/.test(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail('INVALID_PATH', 'Claims require repository-relative paths, not absolute paths.');
    const segments = value.replaceAll('\\', '/').split('/');
    if (segments.includes('..')) fail('INVALID_PATH', 'Parent traversal is not allowed in claimed paths.');
    const result = segments.filter(part => part && part !== '.').join('/');
    return result || '.';
  });
  return [...new Set(normalized)].sort();
}
const overlaps = (a, b) => a === '.' || b === '.' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const active = (claim, now) => !claim.releasedAt && Date.parse(claim.expiresAt) > now;
const samePaths = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function sleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { const e = new Error('Wait cancelled.'); e.code = 'ABORTED'; reject(e); return; }
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); const e = new Error('Wait cancelled.'); e.code = 'ABORTED'; reject(e); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Fixed read-only git queries; no shell, hooks, or caller-provided commands. */
export function resolveRepo(repo = process.cwd()) {
  text(repo, 'repo', 4096);
  const git = args => execFileSync('git', ['-C', repo, 'rev-parse', ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const root = realpathSync(git(['--show-toplevel']));
    const commonDir = realpathSync(git(['--path-format=absolute', '--git-common-dir']));
    return { repo: root, commonDir, stateDir: path.join(commonDir, 'moire-collab') };
  } catch (error) { fail('INVALID_REPO', `Cannot resolve Git repository ${repo}: ${error.message}`); }
}

function emptyState() { return { version: 1, revision: 0, nextMessageId: 1, nextClaimId: 1, messages: [], acks: Object.create(null), claims: [] }; }
function checkedState(value) {
  try {
    if (!value || value.version !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.claims) || !value.acks || typeof value.acks !== 'object' || Array.isArray(value.acks)) throw new Error('Invalid schema.');
    integer(value.revision, 'revision', 0);
    integer(value.nextMessageId, 'nextMessageId', 1);
    integer(value.nextClaimId, 'nextClaimId', 1);
    let previous = 0;
    for (const m of value.messages) {
      integer(m.id, 'message ID', previous + 1); previous = m.id;
      agentName(m.from); agentName(m.to); text(m.subject, 'subject', 200); text(m.body, 'body', MAX_BODY);
      if (!Number.isFinite(Date.parse(m.createdAt))) throw new Error('Invalid message timestamp.');
      if (m.replyTo !== undefined) integer(m.replyTo, 'replyTo', 1, m.id - 1);
    }
    if (value.nextMessageId !== previous + 1) throw new Error('Inconsistent message counter.');
    const acks = Object.create(null);
    for (const [agent, through] of Object.entries(value.acks)) { agentName(agent); acks[agent] = integer(through, 'acknowledgement', 0, previous); }
    const ids = new Set();
    for (const c of value.claims) {
      if (!/^c[1-9]\d*$/.test(c.id) || ids.has(c.id)) throw new Error('Invalid claim ID.');
      integer(Number(c.id.slice(1)), 'claim ID', 1, value.nextClaimId - 1); ids.add(c.id);
      agentName(c.agent); text(c.task, 'task', 1000);
      if (!samePaths(c.paths, pathsOf(c.paths))) throw new Error('Unnormalized claim paths.');
      for (const key of ['createdAt', 'updatedAt', 'expiresAt']) if (!Number.isFinite(Date.parse(c[key]))) throw new Error(`Invalid claim ${key}.`);
      if (c.releasedAt !== undefined && !Number.isFinite(Date.parse(c.releasedAt))) throw new Error('Invalid release timestamp.');
    }
    return { version: 1, revision: value.revision, nextMessageId: value.nextMessageId, nextClaimId: value.nextClaimId, messages: value.messages, acks, claims: value.claims };
  } catch (error) { fail('CORRUPT_STATE', `Mailbox state is invalid; it was not overwritten: ${error.message}`); }
}

/**
 * One durable mailbox per Git common directory, shared across worktrees.
 * Claims are advisory leases. They do not enforce filesystem access.
 * Readers see complete atomic snapshots; writers serialize with mkdir locks.
 * A lock is never stolen, even if its owner appears to have exited.
 */
export function createStore({ repo = process.cwd(), stateDir: override } = {}) {
  const location = resolveRepo(repo);
  if (override !== undefined) text(override, 'stateDir', 4096);
  const stateDir = override === undefined ? location.stateDir : path.resolve(override);
  const stateFile = path.join(stateDir, 'state.json');
  const lockDir = path.join(stateDir, 'write.lock');

  async function read() {
    let data;
    try { data = await fs.readFile(stateFile, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return emptyState(); throw error; }
    try { return checkedState(JSON.parse(data)); }
    catch (error) { if (error.code === 'CORRUPT_STATE') throw error; fail('CORRUPT_STATE', `Mailbox state could not be parsed; it was not overwritten: ${error.message}`); }
  }
  async function write(state) {
    const temporary = path.join(stateDir, `.state-${process.pid}-${randomUUID()}.tmp`);
    let file;
    try {
      file = await fs.open(temporary, 'wx', 0o600);
      await file.writeFile(`${JSON.stringify(state)}\n`, 'utf8');
      await file.sync(); await file.close(); file = null;
      await fs.rename(temporary, stateFile);
      const directory = await fs.open(stateDir, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { if (file) await file.close(); await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function mutate(fn) {
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT;
    for (;;) {
      try { await fs.mkdir(lockDir, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) fail('LOCK_TIMEOUT', `Mailbox lock remains held at ${lockDir}; no lock was removed or stolen. Inspect its owner.json before manual recovery.`);
        await sleep(20);
      }
    }
    try {
      await fs.writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      const state = await read();
      const result = await fn(state);
      if (result.changed) {
        integer(state.revision + 1, 'revision', 1);
        state.revision++;
        await write(state);
      }
      return typeof result.value === 'function' ? result.value(state) : result.value;
    } finally { await fs.rm(lockDir, { recursive: true }); }
  }

  async function send({ from, to, subject, body, replyTo } = {}) {
    agentName(from); agentName(to); text(subject, 'subject', 200); text(body, 'body', MAX_BODY);
    if (replyTo !== undefined) integer(replyTo, 'replyTo', 1);
    return mutate(state => {
      if (replyTo !== undefined && !state.messages.some(message => message.id === replyTo)) fail('NOT_FOUND', `Message ${replyTo} does not exist.`);
      integer(state.nextMessageId + 1, 'next message ID', 2);
      const message = { id: state.nextMessageId++, createdAt: new Date().toISOString(), from, to, subject, body, ...(replyTo === undefined ? {} : { replyTo }) };
      state.messages.push(message);
      return { changed: true, value: message };
    });
  }
  async function inbox({ agent, after = 0, limit = 50 } = {}) {
    agentName(agent); integer(after, 'after', 0); integer(limit, 'limit', 1, 200);
    const state = await read();
    const messages = state.messages.filter(message => message.id > after && (message.to === agent || message.to === 'all')).slice(0, limit);
    return { revision: state.revision, agent, ackThrough: own(state.acks, agent) ? state.acks[agent] : 0, lastId: state.nextMessageId - 1, messages };
  }
  async function ack({ agent, through } = {}) {
    agentName(agent); integer(through, 'through', 0);
    return mutate(state => {
      integer(through, 'through', 0, state.nextMessageId - 1);
      const old = own(state.acks, agent) ? state.acks[agent] : 0;
      state.acks[agent] = Math.max(old, through);
      return { changed: through > old, value: updated => ({ revision: updated.revision, agent, through: updated.acks[agent] }) };
    });
  }
  async function claim({ agent, paths, task, ttlSeconds = 1800 } = {}) {
    agentName(agent); const normalized = pathsOf(paths); text(task, 'task', 1000); integer(ttlSeconds, 'ttlSeconds', 1, 86400);
    return mutate(state => {
      const now = Date.now();
      const exact = [...state.claims].reverse().find(c => !c.releasedAt && c.agent === agent && c.task === task && samePaths(c.paths, normalized));
      const conflicts = state.claims.filter(c => c !== exact && active(c, now) && c.paths.some(a => normalized.some(b => overlaps(a, b))));
      if (conflicts.length) return { changed: false, value: { ok: false, conflicts } };
      const stamp = new Date(now).toISOString();
      const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
      if (exact) {
        const wasExpired = !active(exact, now);
        exact.updatedAt = stamp; exact.expiresAt = expiresAt;
        return { changed: true, value: { ok: true, claim: exact, renewed: true, wasExpired } };
      }
      integer(state.nextClaimId + 1, 'next claim ID', 2);
      const record = { id: `c${state.nextClaimId++}`, agent, paths: normalized, task, createdAt: stamp, updatedAt: stamp, expiresAt };
      state.claims.push(record);
      return { changed: true, value: { ok: true, claim: record, renewed: false, wasExpired: false } };
    });
  }
  async function release({ agent, claimId } = {}) {
    agentName(agent);
    if (typeof claimId !== 'string' || !/^c[1-9]\d*$/.test(claimId)) fail('INVALID_ARGUMENT', 'claimId must identify a claim such as c1.');
    return mutate(state => {
      const record = state.claims.find(c => c.id === claimId);
      if (!record) fail('NOT_FOUND', `Claim ${claimId} does not exist.`);
      if (record.agent !== agent) fail('NOT_OWNER', `Claim ${claimId} belongs to ${record.agent}.`);
      if (record.releasedAt) return { changed: false, value: { released: false, claimId } };
      record.releasedAt = new Date().toISOString(); record.updatedAt = record.releasedAt;
      return { changed: true, value: { released: true, claimId } };
    });
  }
  async function status({ agent } = {}) {
    if (agent !== undefined) agentName(agent);
    const state = await read(), now = Date.now();
    const relevant = c => agent === undefined || c.agent === agent;
    const acks = Object.create(null);
    for (const [name, through] of Object.entries(state.acks)) if (agent === undefined || name === agent) acks[name] = through;
    return { revision: state.revision, lastId: state.nextMessageId - 1, acks, claims: state.claims.filter(c => relevant(c) && active(c, now)), expiredClaims: state.claims.filter(c => relevant(c) && !c.releasedAt && !active(c, now)), repo: location.repo, commonDir: location.commonDir, stateDir };
  }
  async function wait({ agent, after = 0, limit = 50, timeoutMs = 30000, signal } = {}) {
    agentName(agent); integer(after, 'after', 0); integer(limit, 'limit', 1, 200); integer(timeoutMs, 'timeoutMs', 0, 30000);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal?.aborted) fail('ABORTED', 'Wait cancelled.');
      const result = await inbox({ agent, after, limit });
      if (result.messages.length) return { ...result, timedOut: false };
      if (Date.now() >= deadline) return { ...result, timedOut: true };
      await sleep(Math.min(100, deadline - Date.now()), signal);
    }
  }
  return Object.freeze({ repo: location.repo, commonDir: location.commonDir, stateDir, send, inbox, ack, claim, release, status, wait });
}
