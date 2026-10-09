#!/usr/bin/env bun
// Local viewer: serves the web app as plain static files (no build step), map snapshots, a
// change stream, and parsed conversations. It never edits a map; the one write it accepts is
// deleting a whole map from the index page. Exits by itself after a period with no API
// requests; the page sends heartbeats while it is visible.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { parseArgs } from "node:util";
import { type AgentKind, type MapEvent, type MapState, fold, toSnapshot } from "./lib/model";
import { APP_ID, DEFAULT_PORT, readServerInfo, serverInfoPath } from "./lib/server-info";
import { AGENTS } from "./lib/session";
import { deleteMap, listMapSlugs, loadMap, mapSize, mapsDir, readEvents, transcriptsDir } from "./lib/store";
import { parseTranscript, relevantRanges } from "./lib/transcripts/parse";
import { syncTranscript } from "./lib/transcripts/sync";

const { values } = parseArgs({ options: { port: { type: "string" }, "idle-ms": { type: "string" } } });
const preferredPort = Number(values.port ?? DEFAULT_PORT);
const idleMs = Number(values["idle-ms"] ?? 30 * 60_000);
const webRoot = join(import.meta.dir, "..", "web");

let lastApiAt = Date.now();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

// ---------- static files ----------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serveStatic(pathname: string): Response {
  const rel = normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname)).replace(/^([/\\])+/, "");
  const file = join(webRoot, rel);
  if (!file.startsWith(webRoot + sep) || !existsSync(file) || !statSync(file).isFile()) return new Response("not found", { status: 404 });
  return new Response(Bun.file(file), { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" } });
}

// ---------- change stream ----------

mkdirSync(mapsDir(), { recursive: true });
const subscribers = new Set<(slug: string) => void>();
const pending = new Map<string, Timer>();
watch(mapsDir(), { recursive: true }, (_event, filename) => {
  const match = filename?.toString().match(/^([^/\\]+)[/\\]events\.jsonl$/);
  if (!match) return;
  const slug = match[1]!;
  clearTimeout(pending.get(slug));
  pending.set(
    slug,
    setTimeout(() => {
      pending.delete(slug);
      for (const notify of subscribers) notify(slug);
    }, 80),
  );
});

function stream(req: Request): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      const notify = (slug: string) => send(`event: change\ndata: ${JSON.stringify({ slug })}\n\n`);
      subscribers.add(notify);
      const keepAlive = setInterval(() => send(": keep-alive\n\n"), 15_000);
      send("retry: 3000\n\n");
      cleanup = () => {
        subscribers.delete(notify);
        clearInterval(keepAlive);
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel: () => cleanup(),
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
}

// ---------- api ----------

// added: nodes born in the batch; changed: other structural edits; pillar: index of the pillar
// (in display order) most of the batch grew under, so the timeline can tint each drop.
type Batch = { id: string; at: string; agent: AgentKind | null; end: number; added: number; changed: number; pillar: number | null };

function batchesOf(events: MapEvent[], final: MapState): Batch[] {
  const pillars = [...final.nodes.values()].filter((n) => !n.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const pillarOf = (id: string) => {
    let cur = final.nodes.get(id);
    while (cur?.parentId && final.nodes.has(cur.parentId)) cur = final.nodes.get(cur.parentId);
    return cur ? pillars.findIndex((p) => p.id === cur!.id) : -1;
  };
  const out: (Batch & { votes: Map<number, number> })[] = [];
  events.forEach((e, i) => {
    let b = out.at(-1);
    if (!b || b.id !== e.batch) out.push((b = { id: e.batch, at: e.at, agent: e.actor.agent, end: i + 1, added: 0, changed: 0, pillar: null, votes: new Map() }));
    b.end = i + 1;
    if (e.type === "node_added") b.added++;
    else if (e.type !== "session_linked" && e.type !== "map_created") b.changed++;
    const id = "nodeId" in e ? e.nodeId : "id" in e && typeof e.id === "string" && e.type.startsWith("node") ? e.id : null;
    const p = id ? pillarOf(id) : -1;
    if (p >= 0) b.votes.set(p, (b.votes.get(p) ?? 0) + 1);
  });
  return out.map(({ votes, ...b }) => ({ ...b, pillar: votes.size ? [...votes].sort((x, y) => y[1] - x[1])[0]![0] : null }));
}

const sessionCount = (s: MapState) => new Set([...s.nodes.values()].flatMap((n) => n.sessions.map((x) => `${x.agent}:${x.sessionId}`))).size;

function mapPayload(slug: string, url: URL) {
  const events = readEvents(slug);
  // The creation batch has nothing to draw; the timeline starts at the first ink.
  const all = batchesOf(events, fold(slug, events));
  const batches = all.length > 2 && events.slice(0, all[0]!.end).every((e) => e.type === "map_created" || e.type === "lens_updated") ? all.slice(1) : all;
  const at = url.searchParams.get("batch");
  const index = at === null ? batches.length - 1 : Math.max(0, Math.min(batches.length - 1, Number(at)));
  const upto = batches[index]?.end ?? events.length;
  const state = fold(slug, events.slice(0, upto));
  return { ...toSnapshot(state), batches, batch: index, sessions: sessionCount(state) };
}

function conversationPayload(slug: string, agent: AgentKind, id: string, nodeId: string | null) {
  const state = loadMap(slug);
  const linked = [...state.nodes.values()].some((n) => n.sessions.some((s) => s.agent === agent && s.sessionId === id));
  if (!linked) return null;
  const sync = syncTranscript(transcriptsDir(slug), agent, id);
  const path = sync.source ?? sync.snapshot;
  const items = path ? parseTranscript(agent, readFileSync(path, "utf8")) : [];
  const linkTimes = nodeId ? (state.nodes.get(nodeId)?.sessions.find((s) => s.agent === agent && s.sessionId === id)?.at ?? []) : [];
  return { agent, id, origin: sync.source ? "live" : path ? "snapshot" : "missing", items, ranges: relevantRanges(items, linkTimes) };
}

const validSlug = (slug: string) => /^[a-z0-9][a-z0-9-]*$/.test(slug) && listMapSlugs().includes(slug);

function handleApi(req: Request, url: URL): Response {
  const parts = url.pathname.split("/").slice(2).map(decodeURIComponent); // ["maps", slug, ...]
  if (parts[0] === "health") return json({ app: APP_ID, pid: process.pid });
  if (parts[0] === "heartbeat") return json({ ok: true, idleMs });
  if (parts[0] !== "maps") return json({ error: "not found" }, 404);
  if (parts.length === 1)
    return json(
      listMapSlugs()
        .map((slug) => {
          const s = loadMap(slug);
          return { slug, title: s.title, purpose: s.purpose, nodes: s.nodes.size, sessions: sessionCount(s), bytes: mapSize(slug), createdAt: s.createdAt, updatedAt: s.updatedAt };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  const slug = parts[1]!;
  if (!validSlug(slug)) return json({ error: "map not found" }, 404);
  if (parts.length === 2 && req.method === "DELETE") {
    // Only this web app sends the custom header; other sites' pages cannot add it without a
    // CORS preflight, which this server never grants.
    if (req.headers.get("x-diffusion-map") !== "delete") return json({ error: "forbidden" }, 403);
    const s = loadMap(slug);
    const summary = { slug, title: s.title, nodes: s.nodes.size, sessions: sessionCount(s), bytes: mapSize(slug) };
    deleteMap(slug);
    return json({ deleted: summary });
  }
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  if (parts.length === 2) return json(mapPayload(slug, url));
  if (parts[2] === "sessions" && parts.length === 5 && AGENTS.includes(parts[3] as AgentKind)) {
    const payload = conversationPayload(slug, parts[3] as AgentKind, parts[4]!, url.searchParams.get("node"));
    return payload ? json(payload) : json({ error: "session is not linked to this map" }, 404);
  }
  return json({ error: "not found" }, 404);
}

const server = (() => {
  for (let port = preferredPort; port < preferredPort + 20; port++) {
    try {
      return Bun.serve({
        hostname: "127.0.0.1",
        port,
        idleTimeout: 60,
        fetch(req) {
          const url = new URL(req.url);
          const deleting = req.method === "DELETE" && url.pathname.startsWith("/api/maps/");
          if (req.method !== "GET" && !deleting) return new Response("method not allowed", { status: 405 });
          if (url.pathname === "/api/stream") return stream(req); // an open stream alone is not activity
          if (url.pathname.startsWith("/api/")) {
            lastApiAt = Date.now();
            try {
              return handleApi(req, url);
            } catch (err) {
              return json({ error: (err as Error).message }, 500);
            }
          }
          return serveStatic(url.pathname);
        },
      });
    } catch (err) {
      if (!String((err as { code?: string }).code ?? err).includes("EADDRINUSE")) throw err;
    }
  }
  throw new Error(`no free port in ${preferredPort}-${preferredPort + 19}`);
})();

writeFileSync(serverInfoPath(), JSON.stringify({ pid: process.pid, port: server.port, startedAt: new Date().toISOString(), idleMs }));

function shutdown() {
  if (readServerInfo()?.pid === process.pid) rmSync(serverInfoPath(), { force: true });
  server.stop(true);
  process.exit(0);
}

setInterval(() => {
  if (Date.now() - lastApiAt > idleMs) shutdown();
}, Math.max(250, Math.min(idleMs / 4, 30_000)));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
