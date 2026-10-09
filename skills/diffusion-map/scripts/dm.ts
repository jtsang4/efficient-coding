#!/usr/bin/env bun
// dm — the diffusion-map CLI. Agents write maps only through this command.
// Runtime code uses Bun and Node built-ins only: the skill must run without installing anything.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type Actor, toSnapshot } from "./lib/model";
import { exportMarkdown, outline } from "./lib/outline";
import { DEFAULT_PORT, healthCheck, parseDuration, readServerInfo, serverInfoPath } from "./lib/server-info";
import { detectActor } from "./lib/session";
import { type ApplyResult, type Op, UserError, applyOps, createMap, deleteMap, listMapSlugs, loadMap, mapSize, readEvents, transcriptsDir, undoLast, validateLens } from "./lib/store";
import { syncTranscript } from "./lib/transcripts/sync";

type Values = Record<string, string | boolean | undefined>;
type Command = {
  usage: string;
  summary: string;
  options?: Record<string, { type: "string" | "boolean"; short?: string }>;
  map?: boolean; // requires -m/--map
  run: (values: Values, args: string[]) => void | Promise<void>;
};

let actorOverride: { agent?: string; session?: string } = {};
const actor = (): Actor => detectActor(actorOverride);

function readJsonArg(value: string): unknown {
  const text = value.startsWith("@") ? readFileSync(value.slice(1), "utf8") : value;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new UserError(`invalid JSON: ${(err as Error).message}`);
  }
}

/** Snapshot the current session's transcript if this map already refers to it. */
function syncCurrentSession(slug: string) {
  const a = actor();
  if (!a.agent || !a.sessionId) return;
  const linked = [...loadMap(slug).nodes.values()].some((n) => n.sessions.some((s) => s.agent === a.agent && s.sessionId === a.sessionId));
  if (!linked) return;
  try {
    syncTranscript(transcriptsDir(slug), a.agent, a.sessionId);
  } catch (err) {
    console.error(`warning: transcript snapshot failed: ${(err as Error).message}`);
  }
}

function report(slug: string, result: ApplyResult) {
  const parts = [`ok: ${result.events} event${result.events === 1 ? "" : "s"} in ${slug} (batch ${result.batch})`];
  if (result.created.length) parts.push(`created: ${result.created.join(", ")}`);
  if (result.linked.length) parts.push(`linked this session to: ${result.linked.join(", ")}`);
  else if (!actor().sessionId) parts.push("note: no agent session detected, nothing was linked");
  for (const w of result.warnings) parts.push(`warning: ${w}`);
  console.log(parts.join("\n"));
}

function run(slug: string, ops: Op[]) {
  const result = applyOps(slug, ops, actor());
  syncCurrentSession(slug);
  report(slug, result);
}

const str = (v: Values, key: string) => v[key] as string | undefined;
const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const need = (args: string[], n: number, what: string) => {
  if (args.length < n) throw new UserError(`missing ${what}`);
};

const commands: Record<string, Command> = {
  maps: {
    usage: "maps",
    summary: "list maps, most recently updated first",
    run() {
      const maps = listMapSlugs()
        .map((slug) => loadMap(slug))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (!maps.length) return console.log("no maps yet");
      for (const m of maps) console.log(`${m.slug}\t${m.title}\t${m.nodes.size} nodes\t${formatBytes(mapSize(m.slug))}\tupdated ${m.updatedAt}`);
    },
  },
  delete: {
    usage: "delete -m <slug> [--yes]",
    summary: "delete a map with its transcript snapshots (prints what would go unless --yes)",
    map: true,
    options: { yes: { type: "boolean" } },
    run(v) {
      const slug = str(v, "map")!;
      const state = loadMap(slug);
      const sessions = new Set([...state.nodes.values()].flatMap((n) => n.sessions.map((s) => `${s.agent}:${s.sessionId}`))).size;
      const what = `${state.title} (${slug}): ${state.nodes.size} nodes, ${sessions} linked conversations, ${formatBytes(mapSize(slug))} on disk`;
      if (!v.yes) return console.log(`would delete ${what}\nre-run with --yes to delete; the agents' own conversation records are not touched`);
      deleteMap(slug);
      console.log(`deleted ${what}`);
    },
  },
  new: {
    usage: 'new "<title>" --lens <json|@file> [--purpose <text>] [--slug <slug>]',
    summary: "create a map",
    options: { lens: { type: "string" }, purpose: { type: "string" }, slug: { type: "string" } },
    run(v, args) {
      need(args, 1, "title");
      if (!v.lens) throw new UserError("--lens is required");
      const slug = createMap({ title: args[0]!, slug: str(v, "slug"), purpose: str(v, "purpose") ?? "", lens: validateLens(readJsonArg(str(v, "lens")!)) }, actor());
      console.log(`created map: ${slug}`);
    },
  },
  show: {
    usage: "show -m <slug> [--json]",
    summary: "print the map outline (ids, kinds, statuses, sessions, frontier)",
    map: true,
    options: { json: { type: "boolean" } },
    run(v) {
      const state = loadMap(str(v, "map")!);
      console.log(v.json ? JSON.stringify(toSnapshot(state), null, 2) : outline(state));
      syncCurrentSession(state.slug);
    },
  },
  apply: {
    usage: "apply -m <slug> [--file <path>]   (JSON array of ops on stdin)",
    summary: "apply several ops as one batch",
    map: true,
    options: { file: { type: "string" } },
    async run(v) {
      const text = v.file ? readFileSync(str(v, "file")!, "utf8") : await Bun.stdin.text();
      const parsed = readJsonArg(text) as Op[] | { ops: Op[] };
      run(str(v, "map")!, Array.isArray(parsed) ? parsed : parsed.ops);
    },
  },
  add: {
    usage: 'add -m <slug> "<title>" [--kind] [--status] [--parent <node>] [--summary] [--id]',
    summary: "add a node (no --parent = a pillar)",
    map: true,
    options: { kind: { type: "string" }, status: { type: "string" }, parent: { type: "string" }, summary: { type: "string" }, id: { type: "string" } },
    run(v, args) {
      need(args, 1, "title");
      run(str(v, "map")!, [{ op: "add", title: args[0]!, kind: str(v, "kind"), status: str(v, "status"), parent: str(v, "parent"), summary: str(v, "summary"), id: str(v, "id") }]);
    },
  },
  update: {
    usage: "update -m <slug> <node> [--title] [--kind] [--status] [--summary]",
    summary: "change a node's title, kind, status or summary",
    map: true,
    options: { title: { type: "string" }, kind: { type: "string" }, status: { type: "string" }, summary: { type: "string" } },
    run(v, args) {
      need(args, 1, "node");
      run(str(v, "map")!, [{ op: "update", node: args[0]!, title: str(v, "title"), kind: str(v, "kind"), status: str(v, "status"), summary: str(v, "summary") }]);
    },
  },
  move: {
    usage: "move -m <slug> <node> --parent <node|root>",
    summary: "re-parent a node (root makes it a pillar)",
    map: true,
    options: { parent: { type: "string" } },
    run(v, args) {
      need(args, 1, "node");
      if (v.parent === undefined) throw new UserError("--parent is required (use root for a pillar)");
      run(str(v, "map")!, [{ op: "move", node: args[0]!, parent: str(v, "parent")! }]);
    },
  },
  link: {
    usage: "link -m <slug> <from> <to> --relation <relation> [--label <text>]",
    summary: "add a cross-link",
    map: true,
    options: { relation: { type: "string" }, label: { type: "string" } },
    run(v, args) {
      need(args, 2, "from and to");
      if (!v.relation) throw new UserError("--relation is required");
      run(str(v, "map")!, [{ op: "link", from: args[0]!, to: args[1]!, relation: str(v, "relation")!, label: str(v, "label") }]);
    },
  },
  unlink: {
    usage: "unlink -m <slug> (--edge <id> | <from> <to> [--relation <relation>])",
    summary: "remove a cross-link",
    map: true,
    options: { edge: { type: "string" }, relation: { type: "string" } },
    run(v, args) {
      run(str(v, "map")!, [{ op: "unlink", edge: str(v, "edge"), from: args[0], to: args[1], relation: str(v, "relation") }]);
    },
  },
  merge: {
    usage: "merge -m <slug> <from> <into>",
    summary: "fold one node into another (children, links and sessions move over)",
    map: true,
    run(v, args) {
      need(args, 2, "from and into");
      run(str(v, "map")!, [{ op: "merge", from: args[0]!, into: args[1]! }]);
    },
  },
  remove: {
    usage: "remove -m <slug> <node> [--cascade]",
    summary: "remove a node; children move up a level unless --cascade",
    map: true,
    options: { cascade: { type: "boolean" } },
    run(v, args) {
      need(args, 1, "node");
      run(str(v, "map")!, [{ op: "remove", node: args[0]!, cascade: Boolean(v.cascade) }]);
    },
  },
  touch: {
    usage: "touch -m <slug> <node...>",
    summary: "record that this session discussed existing nodes",
    map: true,
    run(v, args) {
      need(args, 1, "node");
      run(str(v, "map")!, [{ op: "touch", nodes: args }]);
    },
  },
  lens: {
    usage: "lens -m <slug> --set <json|@file>",
    summary: "replace the map's lens",
    map: true,
    options: { set: { type: "string" } },
    run(v) {
      if (!v.set) throw new UserError("--set is required");
      run(str(v, "map")!, [{ op: "lens", lens: validateLens(readJsonArg(str(v, "set")!)) }]);
    },
  },
  meta: {
    usage: "meta -m <slug> [--title <text>] [--purpose <text>]",
    summary: "change the map title or purpose",
    map: true,
    options: { title: { type: "string" }, purpose: { type: "string" } },
    run(v) {
      run(str(v, "map")!, [{ op: "meta", title: str(v, "title"), purpose: str(v, "purpose") }]);
    },
  },
  undo: {
    usage: "undo -m <slug>",
    summary: "revert the most recent batch",
    map: true,
    run(v) {
      const { batch, types } = undoLast(str(v, "map")!, actor());
      console.log(`reverted batch ${batch} (${types.join(", ")})`);
    },
  },
  log: {
    usage: "log -m <slug> [-n <count>]",
    summary: "list recent batches",
    map: true,
    options: { n: { type: "string", short: "n" } },
    run(v) {
      const events = readEvents(str(v, "map")!);
      const reverted = new Set(events.flatMap((e) => (e.type === "reverted" ? [e.target] : [])));
      const batches = new Map<string, typeof events>();
      for (const e of events) batches.set(e.batch, [...(batches.get(e.batch) ?? []), e]);
      for (const [id, evs] of [...batches].slice(-Number(str(v, "n") ?? 10))) {
        const first = evs[0]!;
        const who = first.actor.agent ? `${first.actor.agent}:${first.actor.sessionId?.slice(0, 8)}` : "unknown";
        const summary = evs.map((e) => e.type + ("id" in e && typeof e.id === "string" ? `(${e.id})` : "")).join(" ");
        console.log(`${first.at}  ${id}${reverted.has(id) ? " [reverted]" : ""}  ${who}  ${summary}`);
      }
    },
  },
  export: {
    usage: "export -m <slug> [--format md|json]",
    summary: "export the map",
    map: true,
    options: { format: { type: "string" } },
    run(v) {
      const state = loadMap(str(v, "map")!);
      console.log(v.format === "json" ? JSON.stringify(toSnapshot(state), null, 2) : exportMarkdown(state));
    },
  },
  serve: {
    usage: "serve [-m <slug>] [--port <port>] [--idle <duration>]",
    summary: "start the local viewer in the background (reuses a running one) and print its URL",
    options: { map: { type: "string", short: "m" }, port: { type: "string" }, idle: { type: "string" } },
    async run(v) {
      const slug = str(v, "map");
      const path = slug ? `/#/map/${encodeURIComponent(slug)}` : "/";
      const running = readServerInfo();
      if (running && (await healthCheck(running.port))) return console.log(`viewer running: http://127.0.0.1:${running.port}${path}`);
      const idle = str(v, "idle") ?? "30m";
      const child = spawn(process.execPath, [join(import.meta.dir, "server.ts"), "--port", str(v, "port") ?? String(DEFAULT_PORT), "--idle-ms", String(parseDuration(idle))], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
      for (let i = 0; i < 100; i++) {
        await Bun.sleep(100);
        const info = readServerInfo();
        if (info && info.pid === child.pid && (await healthCheck(info.port)))
          return console.log(`viewer started: http://127.0.0.1:${info.port}${path}  (exits after ${idle} without visits)`);
      }
      throw new UserError("viewer did not start within 10s");
    },
  },
  stop: {
    usage: "stop",
    summary: "stop the local viewer",
    run() {
      const info = readServerInfo();
      if (!info) return console.log("viewer not running");
      try {
        process.kill(info.pid, "SIGTERM");
        console.log(`stopped viewer (pid ${info.pid})`);
      } catch {
        console.log("viewer was not running");
      }
      if (existsSync(serverInfoPath())) rmSync(serverInfoPath(), { force: true });
    },
  },
};

function help() {
  const lines = ["dm — diffusion map", "", "usage: dm [--agent claude-code|codex --session <id>] <command> ...", ""];
  for (const c of Object.values(commands)) lines.push(`  ${c.usage}`, `      ${c.summary}`);
  return lines.join("\n");
}

async function main(argv: string[]) {
  const nameAt = argv.findIndex((a, i) => !a.startsWith("-") && !["--agent", "--session"].includes(argv[i - 1] ?? ""));
  const name = argv[nameAt];
  if (!name || name === "help") return console.log(help());
  const command = commands[name];
  if (!command) throw new UserError(`unknown command: ${name}\n\n${help()}`);
  const options = {
    ...(command.map ? { map: { type: "string" as const, short: "m" } } : {}),
    ...command.options,
    agent: { type: "string" as const },
    session: { type: "string" as const },
    help: { type: "boolean" as const, short: "h" },
  };
  let parsed;
  try {
    // Global flags may sit before the command name; parse everything except the name itself.
    parsed = parseArgs({ args: [...argv.slice(0, nameAt), ...argv.slice(nameAt + 1)], options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UserError(`${(err as Error).message}\nusage: dm ${command.usage}`);
  }
  const values = parsed.values as Values;
  if (values.help) return console.log(`usage: dm ${command.usage}\n${command.summary}`);
  actorOverride = { agent: str(values, "agent"), session: str(values, "session") };
  if (command.map && !values.map) throw new UserError(`-m/--map <slug> is required\nusage: dm ${command.usage}`);
  await command.run(values, parsed.positionals);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`error: ${(err as Error).message}`);
  process.exit(1);
});
