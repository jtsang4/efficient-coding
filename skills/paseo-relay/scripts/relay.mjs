import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createPaseoApi } from '@getpaseo/client';
// Version-bound bridge: public PaseoClient does not expose server_info.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { ConnectionOfferSchema, parseConnectionOfferFromUrl } from '@getpaseo/protocol/connection-offer';
import { buildRelayWebSocketUrl, shouldUseTlsForDefaultHostedRelay } from '@getpaseo/protocol/daemon-endpoints';

export class ReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function check(value, code) {
  if (!value) throw new ReadError(code);
}

export async function deadline(task, ms) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ReadError('TIMEOUT')), ms);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function readPrivateFile(path) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    check(stat.isFile() && stat.size <= 1024 * 1024, 'INVALID_INPUT_FILE');
    if (process.platform !== 'win32') {
      check((stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'PRIVATE_FILE_REQUIRED');
    }
    return await file.readFile('utf8');
  } finally { await file.close(); }
}

export async function writePrivateFile(path, text) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(text, 'utf8'); }
  finally { await file.close(); }
}

// Accept a URL, pair --json output, or an explicitly exported HostProfile/registry.
// Never locate or dump app storage automatically.
export function parseMaterial(text, expectedServerId, connectionId) {
  try {
    const input = text.trim();
    let value = input;
    if (input.startsWith('{') || input.startsWith('[')) value = JSON.parse(input);
    if (Array.isArray(value)) {
      check(expectedServerId, 'EXPECTED_SERVER_REQUIRED');
      const matches = value.filter((p) => p.serverId === expectedServerId);
      check(matches.length === 1, 'AMBIGUOUS_HOST');
      value = matches[0];
    }
    let offer;
    if (typeof value === 'string' || typeof value.url === 'string') {
      offer = parseConnectionOfferFromUrl(typeof value === 'string' ? value : value.url);
    } else if (value.connections) {
      const matches = value.connections.filter((c) => c.type === 'relay' && (!connectionId || c.id === connectionId));
      const selected = connectionId ? matches[0]
        : matches.find((c) => c.id === value.preferredConnectionId) ?? (matches.length === 1 ? matches[0] : null);
      check(selected && (!connectionId || matches.length === 1), 'AMBIGUOUS_RELAY');
      offer = ConnectionOfferSchema.parse({
        v: 2, serverId: value.serverId, daemonPublicKeyB64: selected.daemonPublicKeyB64,
        relay: { endpoint: selected.relayEndpoint, ...(selected.useTls === undefined ? {} : { useTls: selected.useTls }) },
      });
    } else {
      offer = ConnectionOfferSchema.parse(value);
    }
    check(offer, 'OFFER_REQUIRED');
    check(!expectedServerId || offer.serverId === expectedServerId, 'OFFER_HOST_MISMATCH');
    return offer;
  } catch (error) {
    // Schema and URL errors can contain the original connection material.
    if (error instanceof ReadError) throw error;
    throw new ReadError('INVALID_OFFER');
  }
}

export async function loadOffer(env = process.env) {
  check(Boolean(env.PASEO_OFFER_FILE) !== Boolean(env.PASEO_HOST), 'CHOOSE_ONE_OFFER_SOURCE');
  const text = env.PASEO_OFFER_FILE ? await readPrivateFile(env.PASEO_OFFER_FILE) : env.PASEO_HOST;
  return parseMaterial(text, env.PASEO_EXPECT_SERVER_ID, env.PASEO_CONNECTION_ID);
}

export async function installedVersions() {
  const require = createRequire(import.meta.url);
  const versions = {};
  for (const [name, entry] of [
    ['@getpaseo/client', '@getpaseo/client'],
    ['@getpaseo/protocol', '@getpaseo/protocol/connection-offer'],
  ]) {
    let path = dirname(require.resolve(entry));
    let found = false;
    for (let n = 0; n < 6; n++, path = dirname(path)) {
      let pkg;
      try { pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')); }
      catch { continue; }
      if (pkg.name !== name) continue;
      check(pkg.version === '0.8.0', 'UNSUPPORTED_SDK_VERSION');
      versions[name] = pkg.version;
      found = true;
      break;
    }
    check(found, 'SDK_PACKAGE_NOT_FOUND');
  }
  return versions;
}

export function verifyIdentity(info, offer, expectedHostname) {
  check(info?.serverId === offer.serverId, 'HANDSHAKE_HOST_MISMATCH');
  check(!expectedHostname || info.hostname === expectedHostname, 'HOSTNAME_MISMATCH');
  return { serverId: info.serverId, hostname: info.hostname ?? null, daemonVersion: info.version ?? null };
}

export async function withRelay(offer, action, {
  expectedHostname, timeoutMs = 120000,
  makeClient = (config) => new DaemonClient(config),
  makeApi = createPaseoApi,
} = {}) {
  const client = makeClient({
    url: buildRelayWebSocketUrl({
      endpoint: offer.relay.endpoint, serverId: offer.serverId, role: 'client',
      useTls: offer.relay.useTls ?? shouldUseTlsForDefaultHostedRelay(offer.relay.endpoint),
    }),
    clientId: crypto.randomUUID(), clientType: 'cli',
    e2ee: { enabled: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 },
    connectTimeoutMs: Math.min(timeoutMs, 20000), reconnect: { enabled: false },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
  try {
    return await deadline(async () => {
      await client.connect();
      const host = verifyIdentity(client.getLastServerInfoMessage(), offer, expectedHostname);
      return await action({ api: makeApi(client), driver: client, host });
    }, timeoutMs);
  } finally {
    // Even failed connects and timed-out operations release the transport.
    await deadline(() => client.close(), 5000);
  }
}

export function profileConfig(profile) {
  check(profile?.provider && profile?.model, 'PROFILE_PROVIDER_MODEL_REQUIRED');
  return {
    provider: `${profile.provider}/${profile.model}`,
    ...Object.fromEntries(['modeId', 'thinkingOptionId', 'featureValues']
      .filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]])),
  };
}

// A bounded historical snapshot ending at the first tail page's endCursor.
// Later "before" pages normally have hasNewer=true: those rows are already read.
export async function readTimeline(fetchPage, agentId, {
  projection = 'canonical', pageSize = 200, maxPages = 100,
} = {}) {
  check(['canonical', 'projected'].includes(projection), 'INVALID_PROJECTION');
  check(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 1000, 'INVALID_PAGE_SIZE');
  check(Number.isInteger(maxPages) && maxPages > 0 && maxPages <= 10000, 'INVALID_MAX_PAGES');
  const result = { agentId, projection, complete: false, reason: null, boundary: null, pages: [], uniqueEntries: 0 };
  const seen = new Map();
  let cursor;
  let epoch;
  const fail = (reason) => ({ ...result, reason });
  for (let n = 0; n < maxPages; n++) {
    let page;
    try {
      page = await fetchPage({ direction: cursor ? 'before' : 'tail', ...(cursor ? { cursor } : {}), limit: pageSize, projection });
    } catch { return fail('FETCH_FAILED'); }
    result.pages.push(page);
    if (page.error !== null) return fail('PAGE_ERROR');
    if (page.agentId !== agentId || page.projection !== projection) return fail('PAGE_IDENTITY_MISMATCH');
    if (page.direction !== (cursor ? 'before' : 'tail')) return fail('PAGE_DIRECTION_MISMATCH');
    if (page.gap !== false || page.staleCursor !== false) return fail('GAP_OR_STALE_CURSOR');
    if (typeof page.hasOlder !== 'boolean' || typeof page.hasNewer !== 'boolean' || !Array.isArray(page.entries)) return fail('MISSING_COMPLETENESS_FIELDS');
    if (typeof page.epoch !== 'string' || !page.epoch) return fail('MISSING_EPOCH');
    if (epoch !== undefined && (epoch !== page.epoch || page.reset !== false)) return fail('TIMELINE_REPLACED');
    epoch = page.epoch;
    if (n === 0) {
      result.boundary = page.endCursor;
      if (page.hasNewer) return fail('TAIL_HAS_NEWER');
    }
    for (const bound of [page.startCursor, page.endCursor]) {
      if (bound !== null && (!bound || bound.epoch !== epoch || !Number.isInteger(bound.seq) || bound.seq < 0)) return fail('INVALID_PAGE_CURSOR');
    }
    if (page.entries.length && (!page.startCursor || !page.endCursor || page.startCursor.seq > page.endCursor.seq)) return fail('INVALID_PAGE_CURSOR');
    for (const entry of page.entries) {
      if (!Number.isInteger(entry.seqStart) || !Number.isInteger(entry.seqEnd) || entry.seqStart < 0 || entry.seqStart > entry.seqEnd) return fail('INVALID_ENTRY_RANGE');
      if (!result.boundary || entry.seqEnd > result.boundary.seq) return fail('BEYOND_BOUNDARY');
      const key = `${entry.seqStart}:${entry.seqEnd}`;
      const value = JSON.stringify(entry);
      if (seen.has(key) && seen.get(key) !== value) return fail('CHANGED_ENTRY');
      seen.set(key, value);
    }
    result.uniqueEntries = seen.size;
    if (cursor && (!page.entries.length || !page.startCursor || page.startCursor.seq >= cursor.seq)) return fail('CURSOR_NOT_ADVANCING');
    if (!page.hasOlder) return { ...result, complete: true };
    const next = page.startCursor;
    if (!page.entries.length || !next || next.epoch !== epoch || !Number.isInteger(next.seq)
      || (cursor && next.seq >= cursor.seq)) return fail('CURSOR_NOT_ADVANCING');
    cursor = next;
  }
  return fail('MAX_PAGES');
}
