import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseMaterial, verifyIdentity, withRelay, readTimeline, profileConfig, readPrivateFile, writePrivateFile, installedVersions } from './relay.mjs';

const offer = { v: 2, serverId: 'srv_fixture', daemonPublicKeyB64: 'synthetic-key', relay: { endpoint: 'relay.example.invalid:443', useTls: true } };
const url = `https://app.paseo.sh/#offer=${Buffer.from(JSON.stringify(offer)).toString('base64url')}`;
const info = { serverId: offer.serverId, hostname: 'fixture-host', version: '0.8.0' };
const entry = (seq) => ({ seqStart: seq, seqEnd: seq, item: { type: 'assistant_message', text: `fixture ${seq}` } });
function page(rows, overrides = {}) {
  return {
    agentId: 'agent_fixture', projection: 'canonical', direction: 'tail', epoch: 'epoch_fixture',
    reset: false, staleCursor: false, gap: false, error: null,
    hasOlder: false, hasNewer: false,
    window: { minSeq: 1, maxSeq: 4, nextSeq: 5 },
    startCursor: rows.length ? { epoch: 'epoch_fixture', seq: rows[0] } : null,
    endCursor: rows.length ? { epoch: 'epoch_fixture', seq: rows.at(-1) } : null,
    entries: rows.map(entry), ...overrides,
  };
}

test('published packages resolve with the pinned versions', async () => {
  assert.deepEqual(await installedVersions(), { '@getpaseo/client': '0.8.0', '@getpaseo/protocol': '0.8.0' });
});

test('parse authorized URL and pair JSON; reject wrong host without echoing material', () => {
  assert.deepEqual(parseMaterial(url, offer.serverId), offer);
  assert.deepEqual(parseMaterial(JSON.stringify({ url, relayEnabled: true })), offer);
  assert.throws(() => parseMaterial(url, 'srv_other'), { code: 'OFFER_HOST_MISMATCH' });
  assert.throws(() => parseMaterial('https://private.invalid/#offer=secret-invalid'), { message: 'INVALID_OFFER' });
  assert.throws(() => parseMaterial('fixture-host'), { code: 'OFFER_REQUIRED' });
});

test('registry selection uses exact server identity and an unambiguous relay connection', () => {
  const relay = { id: 'relay_fixture', type: 'relay', relayEndpoint: offer.relay.endpoint, useTls: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 };
  const host = { serverId: offer.serverId, label: 'Display name', connections: [relay] };
  assert.deepEqual(parseMaterial(JSON.stringify([host]), offer.serverId), offer);
  assert.throws(() => parseMaterial(JSON.stringify([host])), { code: 'EXPECTED_SERVER_REQUIRED' });
  const ambiguous = { ...host, connections: [relay, { ...relay, id: 'second' }] };
  assert.throws(() => parseMaterial(JSON.stringify(ambiguous)), { code: 'AMBIGUOUS_RELAY' });
  assert.deepEqual(parseMaterial(JSON.stringify(ambiguous), offer.serverId, 'second'), offer);
  assert.throws(() => parseMaterial(JSON.stringify([host, host]), offer.serverId), { code: 'AMBIGUOUS_HOST' });
});

test('identity checks server and optional advertised hostname', () => {
  assert.equal(verifyIdentity(info, offer, info.hostname).serverId, offer.serverId);
  assert.throws(() => verifyIdentity({ ...info, serverId: 'srv_other' }, offer), { code: 'HANDSHAKE_HOST_MISMATCH' });
  assert.throws(() => verifyIdentity(info, offer, 'other-host'), { code: 'HOSTNAME_MISMATCH' });
});

test('connection always closes; action is inaccessible before verified identity', async () => {
  let called = 0;
  for (const mode of ['success', 'connect-error', 'wrong-host', 'action-error', 'timeout']) {
    let closed = 0;
    const driver = {
      connect: async () => { if (mode === 'connect-error') throw new Error('fixture connect failed'); },
      getLastServerInfoMessage: () => mode === 'wrong-host' ? { ...info, serverId: 'srv_wrong' } : info,
      close: async () => { closed++; },
    };
    const action = async () => {
      called++;
      if (mode === 'action-error') throw new Error('fixture action failed');
      if (mode === 'timeout') return new Promise(() => {});
      return 'done';
    };
    const run = () => withRelay(offer, action, { makeClient: () => driver, makeApi: () => ({}), timeoutMs: 20 });
    if (mode === 'success') assert.equal(await run(), 'done');
    else await assert.rejects(run);
    assert.equal(closed, 1, mode);
  }
  assert.equal(called, 3);
});

test('read all pages to the initial boundary; later before pages can have newer rows', async () => {
  const calls = [];
  const responses = [page([3, 4], { hasOlder: true }), page([1, 2], { direction: 'before', hasNewer: true })];
  const result = await readTimeline(async (options) => { calls.push(options); return responses.shift(); }, 'agent_fixture');
  assert.equal(result.complete, true);
  assert.equal(result.uniqueEntries, 4);
  assert.deepEqual(result.boundary, { epoch: 'epoch_fixture', seq: 4 });
  assert.deepEqual(calls[1].cursor, { epoch: 'epoch_fixture', seq: 3 });
  assert.equal(calls[1].direction, 'before');
  assert.equal(result.pages.length, 2);
});

test('empty history is complete; identical overlapping rows count once', async () => {
  assert.equal((await readTimeline(async () => page([]), 'agent_fixture')).complete, true);
  const responses = [page([3, 4], { hasOlder: true }), page([1, 2, 3], { direction: 'before', hasNewer: true })];
  const result = await readTimeline(async () => responses.shift(), 'agent_fixture');
  assert.equal(result.complete, true);
  assert.equal(result.uniqueEntries, 4);
});

test('partial/incorrect first pages never claim complete history', async () => {
  for (const [overrides, reason] of [
    [{ gap: true }, 'GAP_OR_STALE_CURSOR'],
    [{ staleCursor: true }, 'GAP_OR_STALE_CURSOR'],
    [{ error: 'private fixture error' }, 'PAGE_ERROR'],
    [{ error: undefined }, 'PAGE_ERROR'],
    [{ hasOlder: undefined }, 'MISSING_COMPLETENESS_FIELDS'],
    [{ hasNewer: true }, 'TAIL_HAS_NEWER'],
    [{ projection: 'projected' }, 'PAGE_IDENTITY_MISMATCH'],
    [{ agentId: 'different' }, 'PAGE_IDENTITY_MISMATCH'],
    [{ direction: 'after' }, 'PAGE_DIRECTION_MISMATCH'],
    [{ endCursor: { epoch: 'other', seq: 4 } }, 'INVALID_PAGE_CURSOR'],
    [{ startCursor: undefined }, 'INVALID_PAGE_CURSOR'],
  ]) {
    const result = await readTimeline(async () => page([3, 4], overrides), 'agent_fixture');
    assert.equal(result.complete, false);
    assert.equal(result.reason, reason);
  }
});

test('budget, transport failure, replacement, and stalled cursor remain incomplete', async () => {
  const bounded = await readTimeline(async () => page([3, 4], { hasOlder: true }), 'agent_fixture', { maxPages: 1 });
  assert.equal(bounded.reason, 'MAX_PAGES');
  const failed = await readTimeline(async () => { throw new Error('private upstream error'); }, 'agent_fixture');
  assert.equal(failed.reason, 'FETCH_FAILED');
  for (const [second, reason] of [
    [page([1, 2], { direction: 'before', epoch: 'replaced' }), 'TIMELINE_REPLACED'],
    [page([1, 2], { direction: 'before', reset: true }), 'TIMELINE_REPLACED'],
    [page([3, 4], { direction: 'before', hasOlder: true }), 'CURSOR_NOT_ADVANCING'],
    [page([3, 4], { direction: 'before', hasOlder: false }), 'CURSOR_NOT_ADVANCING'],
    [page([5], { direction: 'before' }), 'BEYOND_BOUNDARY'],
    [page([3], { direction: 'before', entries: [{ ...entry(3), item: { type: 'different' } }] }), 'CHANGED_ENTRY'],
  ]) {
    const responses = [page([3, 4], { hasOlder: true }), second];
    const result = await readTimeline(async () => responses.shift(), 'agent_fixture');
    assert.equal(result.complete, false);
    assert.equal(result.reason, reason);
  }
});

test('projected reads retain projection and invalid limits are rejected', async () => {
  const result = await readTimeline(async (options) => {
    assert.equal(options.projection, 'projected');
    return page([1], { projection: 'projected' });
  }, 'agent_fixture', { projection: 'projected' });
  assert.equal(result.complete, true);
  await assert.rejects(() => readTimeline(() => {}, 'agent_fixture', { pageSize: 0 }), { code: 'INVALID_PAGE_SIZE' });
});

test('profile mapping preserves supported settings and omits absent ones', () => {
  assert.deepEqual(profileConfig({ provider: 'fixture', model: 'model' }), { provider: 'fixture/model' });
  assert.deepEqual(profileConfig({ provider: 'fixture', model: 'model', modeId: 'mode', thinkingOptionId: 'thinking', featureValues: { feature: false } }), {
    provider: 'fixture/model', modeId: 'mode', thinkingOptionId: 'thinking', featureValues: { feature: false },
  });
  assert.throws(() => profileConfig({ provider: 'fixture' }), { code: 'PROFILE_PROVIDER_MODEL_REQUIRED' });
});

test('private file IO refuses overwrites and unsafe inputs; CLI errors withhold secrets', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'paseo-relay-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'offer.txt');
  await writePrivateFile(path, url);
  assert.equal(await readPrivateFile(path), url);
  await assert.rejects(() => writePrivateFile(path, 'overwrite'), { code: 'EEXIST' });
  assert.equal(await readFile(path, 'utf8'), url);
  if (process.platform !== 'win32') {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await symlink(path, join(dir, 'link'));
    await assert.rejects(() => readPrivateFile(join(dir, 'link')));
    await chmod(path, 0o644);
    await assert.rejects(() => readPrivateFile(path), { code: 'PRIVATE_FILE_REQUIRED' });
  }
  const env = { ...process.env, PASEO_HOST: 'https://private.invalid/#offer=secret-invalid' };
  delete env.PASEO_OFFER_FILE;
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./read.mjs', import.meta.url)), 'identity'], { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(run.status, 2);
  assert.equal(JSON.parse(run.stderr).code, 'INVALID_OFFER');
  assert.doesNotMatch(run.stdout + run.stderr, /secret-invalid|private\.invalid/);
});
