#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { ReadError, check, installedVersions, loadOffer, withRelay, readTimeline, writePrivateFile } from './relay.mjs';

const help = `Optional Paseo Relay SDK reads (Node >=22; install with bun install --frozen-lockfile).
node scripts/read.mjs identity
node scripts/read.mjs profiles
node scripts/read.mjs overview --agent FULL_ID
node scripts/read.mjs timeline --agent FULL_ID --out PRIVATE_NEW_FILE [--projection canonical|projected] [--page-size 200] [--max-pages 100]
node scripts/read.mjs offer --out PRIVATE_NEW_FILE

Supply exactly one: PASEO_OFFER_FILE (0600 URL/pair JSON/exported host record) or PASEO_HOST (offer URL).
PASEO_EXPECT_SERVER_ID checks the offer; PASEO_EXPECT_HOSTNAME checks the handshake hostname.
PASEO_CONNECTION_ID selects among exported relay connections. No app storage is scanned.
--timeout-ms defaults to 120000. Timeline stdout contains metadata only; raw pages go to --out.
offer normalizes existing local material into a private URL file without connecting.
Exit 0: completed; 2: failure; 3: saved incomplete timeline. No remote mutations.\n`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['agent', 'out', 'projection', 'page-size', 'max-pages', 'timeout-ms'].map((x) => [x, { type: 'string' }]).concat([['help', { type: 'boolean' }]])),
  });
  if (values.help) { process.stdout.write(help); return; }
  const [command] = positionals;
  check(positionals.length === 1 && ['identity', 'profiles', 'overview', 'timeline', 'offer'].includes(command), 'INVALID_COMMAND');
  if (['overview', 'timeline'].includes(command)) check(values.agent, 'FULL_AGENT_ID_REQUIRED');
  if (['timeline', 'offer'].includes(command)) check(values.out, 'PRIVATE_OUTPUT_REQUIRED');
  const timeoutMs = Number(values['timeout-ms'] ?? 120000);
  check(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3600000, 'INVALID_TIMEOUT');
  const versions = await installedVersions();
  const offer = await loadOffer();
  if (command === 'offer') {
    const url = `https://app.paseo.sh/#offer=${Buffer.from(JSON.stringify(offer)).toString('base64url')}\n`;
    await writePrivateFile(values.out, url);
    console.log(JSON.stringify({ ok: true, serverId: offer.serverId, written: true }));
    return;
  }
  const output = await withRelay(offer, async ({ api, host }) => {
    const metadata = { host, versions, observedAt: new Date().toISOString() };
    if (command === 'identity') {
      return metadata;
    } else if (command === 'profiles') {
      const { config } = await api.config.get();
      const profiles = (config.agentProfiles ?? []).map((p) => Object.fromEntries(
        ['id', 'name', 'notes', 'provider', 'model', 'modeId', 'thinkingOptionId', 'featureValues']
          .filter((key) => p[key] !== undefined).map((key) => [key, p[key]]),
      ));
      return { ...metadata, profiles };
    } else {
      const agent = api.agents.ref(values.agent);
      const detail = await agent.refresh();
      check(detail?.agent?.id === values.agent, 'AGENT_NOT_FOUND');
      if (command === 'overview') {
        const a = detail.agent;
        return { ...metadata, agent: {
          id: a.id, workspaceId: a.workspaceId, cwd: a.cwd, status: a.status,
          provider: a.provider, model: a.model, modeId: a.modeId, thinkingOptionId: a.thinkingOptionId,
          parentAgentId: a.labels?.['paseo.parent-agent-id'] ?? null,
        } };
      } else {
        const timeline = await readTimeline((options) => agent.timeline.refetch(options), values.agent, {
          projection: values.projection ?? 'canonical', pageSize: Number(values['page-size'] ?? 200),
          maxPages: Number(values['max-pages'] ?? 100),
        });
        const text = JSON.stringify({ ...metadata, ...timeline }) + '\n';
        await writePrivateFile(values.out, text);
        if (!timeline.complete) process.exitCode = 3;
        return { ...metadata, agentId: values.agent, projection: timeline.projection,
          complete: timeline.complete, reason: timeline.reason, boundary: timeline.boundary,
          pages: timeline.pages.length, uniqueEntries: timeline.uniqueEntries,
          sha256: createHash('sha256').update(text).digest('hex'), written: true,
        };
      }
    }
  }, { expectedHostname: process.env.PASEO_EXPECT_HOSTNAME, timeoutMs });
  console.log(JSON.stringify(output));
}

try { await main(); }
catch (error) {
  // Never echo upstream exceptions: they may contain URLs, config, or conversation text.
  console.error(JSON.stringify({ ok: false, code: error instanceof ReadError ? error.code : 'READ_FAILED', hint: 'Check inputs, private file permissions, installed SDK, target connectivity, and operation deadline; upstream details withheld.' }));
  // withRelay has already attempted bounded cleanup. A stuck closing socket
  // must not keep this CLI process alive beyond its failed deadline.
  process.exit(2);
}
