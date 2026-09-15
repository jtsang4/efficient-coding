# Optional SDK reads

Use this supplement for an authenticated identity check when CLI status is local-only, for target profiles, or for exact timeline evidence. Use native Paseo commands for ordinary discovery and operations.

## Install and discover

From the installed `paseo-relay` skill directory:

```bash
bun install --frozen-lockfile
node scripts/read.mjs --help
bun run test
```

The helper requires Node 22+ with built-in WebSocket and pins the published `@getpaseo/client` and `@getpaseo/protocol` packages to `0.8.0` with `bun.lock`, following the repository's per-skill dependency convention. Runtime checks verify the installed package versions. No Paseo source checkout or global SDK path is needed. Resolve the skill's directory from its actual installation; do not assume an author's filesystem layout.

`@getpaseo/client` exports `createPaseoClient` and `createPaseoApi` as public APIs. `scripts/relay.mjs` confines the internal fallback to constructing `DaemonClient` and reading authenticated `getLastServerInfoMessage()`, because public `PaseoClient` does not expose that identity. After verification, it supplies the public API to readers. This is an exported **internal** SDK path with an exact version bound, not a stable cross-version promise. There is no dependency on CLI `dist/utils/client.js`.

Use `node -p 'require.resolve("@getpaseo/client")'` from this directory to locate the installed package; inspect its adjacent `index.d.ts`, `daemon-client.d.ts`, and package metadata when adapting. A source checkout and a published package can differ even when both say `0.8.0`. Keep the version guard until replacement dependencies pass the relevant read-only checks. An unavailable API or incompatible daemon should produce a limitation, not an automatic daemon upgrade.

## Connection input and identity

Set these environment values through the execution tool or a shell with tracing disabled:

```bash
export PASEO_OFFER_FILE="$PRIVATE_DIR/pairing.json"
export PASEO_EXPECT_SERVER_ID="$TARGET_SERVER_ID"
export PASEO_EXPECT_HOSTNAME="$TARGET_ADVERTISED_HOSTNAME"
node scripts/read.mjs identity
```

Supply exactly one of `PASEO_OFFER_FILE` and `PASEO_HOST`. The file can contain a URL, `pair --json`, a version-2 offer object, or an explicitly exported host record/registry array. POSIX input files must be user-owned, `0600`, regular files; symlinks are rejected. A registry array requires `PASEO_EXPECT_SERVER_ID`. `PASEO_CONNECTION_ID` resolves multiple Relay entries when needed. The helper never scans app storage.

The check compares the actual handshake server ID with the offer and, when set, the expected advertised hostname. Output contains host ID/hostname, daemon and SDK versions, and observation time, without the offer, key or endpoint. Identity is checked before any requested resource read. For an initially unknown hostname, omit the hostname expectation only for this identity discovery, reconcile the returned name with the user/authorized host record, then set it for later work.

To reuse exported connection data with the CLI, normalize it into a **new** private URL file:

```bash
node scripts/read.mjs offer --out "$PRIVATE_DIR/relay-offer.txt"
```

This is a local conversion of existing authority, not first pairing or discovery by label. It does not connect. The resulting file can be loaded into `PASEO_HOST` using [connection.md](connection.md).

## Profiles and overview

```bash
node scripts/read.mjs profiles
node scripts/read.mjs overview --agent "$TARGET_AGENT_ID"
```

Profiles are read through public `api.config.get()`; only the profile fields are output, never the full daemon config. Profile notes can be private, so keep this result in the task's authorized context. Overview returns selected identity/configuration fields and parentage, not the conversation body. CLI `inspect` remains the default detailed overview.

## Complete raw timeline

```bash
node scripts/read.mjs timeline --agent "$TARGET_AGENT_ID" \
  --projection canonical --page-size 200 --max-pages 100 \
  --timeout-ms 120000 --out "$PRIVATE_DIR/canonical.json"
```

Request `projected` separately only when the analysis needs it. A single small page (`--page-size 10 --max-pages 1`) is sufficient to inspect payload shape; an incomplete result is expected for a longer session. Avoid refetching large history already available privately.

The script uses public `agent.timeline.refetch({ direction, cursor, limit, projection })`. It requests a tail page, records its epoch/end cursor as the historical boundary, then walks `before` pages until `hasOlder` is false. It preserves the returned payloads in `pages`, including each page's `entries`, cursors, window, and flags. The JSON file is SDK-decoded daemon payloads, not CLI-formatted log output or an encrypted wire capture.

Completeness requires:

- Every page matches the requested agent, direction and projection, with `error: null`, `gap: false`, and `staleCursor: false`.
- The first tail has `hasNewer: false`; later `before` pages normally have `hasNewer: true` for rows already captured.
- Epoch remains stable, subsequent pages do not reset, cursors advance backwards, and entries stay within the initial boundary.
- The earliest page has `hasOlder: false`; the page budget/deadline was not exhausted.

The helper detects malformed flags, replacement, changed duplicate ranges and nonadvancing cursors instead of claiming a complete read. Duplicate ranges are counted once within a projection; raw pages remain intact. An active agent can add messages after the initial boundary, so `complete: true` means complete **through that boundary**, not a guarantee that no later messages exist. The API does not offer transactional multi-page history: if a replacement or lifecycle update invalidates the snapshot, report that limitation and retry a bounded read only when useful.

In observed 0.8.0 behavior, `limit: 0` can return all matching rows in the requested window. It is not a universal “full history” guarantee. If using it directly, still check all flags and boundaries. The helper uses positive page sizes to bound requests across that uncertainty.

The writer creates a new file with `0600` and refuses to overwrite existing files. Keep it outside repositories and shared/synchronized folders. Stdout contains only host, projection, boundary, counts, completeness, and the saved file's SHA-256. The file contains private conversation data, including possibly sensitive error strings; review/redact before sharing. A failed write is not a saved export.

Exit codes: `0` completed, `2` failed, `3` saved an incomplete timeline. Upstream errors are withheld from stderr because they can embed credentials or session text. Inspect the safe error code, supplied inputs and connectivity; do not enable full config/transport logging. A connection/overall timeout may prevent saving partial data. The reader has a 20-second connect budget, a configurable overall deadline, and a bounded `finally` close even on failure. Keep an outer execution timeout slightly above the overall deadline plus the 5-second close budget.

## Interpret entries correctly

Read the actual item at `page.entries[i].item`. For `item.type === "tool_call"`, inputs are under `item.detail.input`; results/errors are under `item.detail.output` and `item.detail.error`. Fields depend on tool kind/provider; check their presence instead of assuming a fixed result shape.

Canonical history preserves lifecycle updates; projected history aggregates tool lifecycle and may merge text/reasoning. The same tool can appear multiple times canonically. Use stable tool-call identity where available, projection metadata (`seqStart`, `seqEnd`, `sourceSeqRanges`, `collapsed`), and the intended counting definition. Do not count every canonical row as a distinct invocation or combine canonical/projected entries into one count.

## Public SDK connection and subscriptions

The public connection API can perform the Relay handshake directly:

```js
import { createPaseoClient } from '@getpaseo/client';
import { buildRelayWebSocketUrl, shouldUseTlsForDefaultHostedRelay } from '@getpaseo/protocol/daemon-endpoints';

// offer is parsed from trusted private input, never an invented ws endpoint.
const client = createPaseoClient({
  url: buildRelayWebSocketUrl({
    endpoint: offer.relay.endpoint, serverId: offer.serverId, role: 'client',
    useTls: offer.relay.useTls ?? shouldUseTlsForDefaultHostedRelay(offer.relay.endpoint),
  }),
  e2ee: { enabled: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 },
  connectTimeoutMs: 20000,
  reconnect: { enabled: false },
});
try {
  await client.connect();
  // Use for operations after target identity has been established.
  // For a new programmatic identity check, use withRelay instead.
} finally { await client.close(); }
```

Use the bundled wrapper for executable bounded sessions:

```js
import { installedVersions, loadOffer, withRelay, deadline } from './scripts/relay.mjs';
await installedVersions();
const offer = await loadOffer();
await withRelay(offer, async ({ api, host }) => {
  const agent = api.agents.ref(targetAgentId);
  if (!(await agent.refresh())) throw new Error('Agent not found');
  const unsubscribe = agent.timeline.subscribe(event => {
    // Process privately. On replacement/error invalidate completeness.
    // Refetch missing history after reconnect; live events are not a full log.
  });
  try {
    await deadline(() => unsubscribe.ready, 20000);
    await deadline(observeUntilDone, 60000);
  } finally { unsubscribe(); }
}, { expectedHostname: process.env.PASEO_EXPECT_HOSTNAME, timeoutMs: 90000 });
```

This is an integration example: define `targetAgentId` and the observation function in the caller. Check the installed subscription type; protocol restoration events have evolved across builds. Always await establishment, release the subscription, and resynchronize with cursors after a gap/replacement/reconnect. Observing must not append timeline entries or send prompts.

## Validation scope

This skill's tests use synthetic offers, host records, pagination responses, and a mocked driver; they cover identity mismatch, cleanup, timeout, private files, profile mapping, complete/incomplete history, epoch changes and cursor stalls. They do not contact production agents or test mutations.

Development also exercised the installed CLI and published SDK against an existing local daemon **through Relay**, including an authenticated identity check and bounded reads. This proves the connection path on that machine, not a fresh cross-host acceptance test. No remote offer was available for this skill's cross-host validation.

Sources: [SDK quickstart](https://paseo.sh/docs/sdk/quickstart), [SDK events](https://paseo.sh/docs/sdk/events), [public API source](https://github.com/getpaseo/paseo/blob/main/packages/client/src/index.ts), [driver implementation](https://github.com/getpaseo/paseo/blob/main/packages/client/src/daemon-client.ts), [timeline protocol](https://github.com/getpaseo/paseo/blob/main/packages/protocol/src/messages.ts). Installed package declarations and exercised behavior take precedence over unverified assumptions from newer source.
