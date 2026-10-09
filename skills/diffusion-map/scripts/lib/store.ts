// Filesystem layout, the append-only event log, and the op layer that validates
// agent commands against the current map before turning them into events.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type Actor,
  type EventBody,
  type Lens,
  type MapEvent,
  type MapState,
  type NodePatch,
  applyEvent,
  fold,
  isDescendant,
  revertedBatches,
} from "./model";

export const dataHome = () => process.env.DIFFUSION_HOME ?? join(homedir(), ".efficient-coding", "diffusion");
export const mapsDir = () => join(dataHome(), "maps");
export const mapDir = (slug: string) => join(mapsDir(), slug);
export const eventsPath = (slug: string) => join(mapDir(slug), "events.jsonl");
export const transcriptsDir = (slug: string) => join(mapDir(slug), "transcripts");

export class UserError extends Error {}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function mapExists(slug: string): boolean {
  return existsSync(eventsPath(slug));
}

/** Bytes on disk for a map, including its transcript snapshots. */
export function mapSize(slug: string): number {
  const walk = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? walk(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
  return existsSync(mapDir(slug)) ? walk(mapDir(slug)) : 0;
}

/** Remove a map and everything stored for it (events and transcript snapshots). */
export function deleteMap(slug: string): void {
  if (!mapExists(slug)) throw new UserError(`map not found: ${slug} (run \`dm maps\` to list maps)`);
  rmSync(mapDir(slug), { recursive: true, force: true });
}

export function listMapSlugs(): string[] {
  if (!existsSync(mapsDir())) return [];
  return readdirSync(mapsDir()).filter((slug) => mapExists(slug));
}

export function readEvents(slug: string): MapEvent[] {
  if (!mapExists(slug)) throw new UserError(`map not found: ${slug} (run \`dm maps\` to list maps)`);
  const out: MapEvent[] = [];
  for (const line of readFileSync(eventsPath(slug), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A torn final line from a crashed writer is skipped; the next append starts on a fresh line.
    }
  }
  return out;
}

export function loadMap(slug: string): MapState {
  return fold(slug, readEvents(slug));
}

function withLock<T>(slug: string, fn: () => T): T {
  const lock = join(mapDir(slug), ".lock");
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true, force: true });
      } catch {}
      if (attempt > 200) throw new Error(`could not lock map ${slug}`);
      Bun.sleepSync(20);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function appendEvents(slug: string, events: MapEvent[]) {
  const path = eventsPath(slug);
  const lead = existsSync(path) && !readFileSync(path, "utf8").endsWith("\n") && statSync(path).size > 0 ? "\n" : "";
  appendFileSync(path, lead + events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

const newBatchId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- lens ----------

export function validateLens(input: unknown): Lens {
  const lens = input as Lens;
  const fail = (msg: string): never => {
    throw new UserError(`invalid lens: ${msg}`);
  };
  if (!lens || typeof lens !== "object") fail("expected an object");
  if (typeof lens.pillar !== "string" || !lens.pillar.trim()) fail("`pillar` must describe what pillars mean");
  for (const key of ["kinds", "statuses", "relations"] as const) {
    if (!Array.isArray(lens[key]) || lens[key].length === 0) fail(`\`${key}\` must be a non-empty array`);
    const ids = new Set<string>();
    for (const item of lens[key]) {
      if (!item?.id || !item?.label) fail(`every ${key} item needs id and label`);
      if (ids.has(item.id)) fail(`duplicate ${key} id: ${item.id}`);
      ids.add(item.id);
    }
  }
  for (const s of lens.statuses)
    if (!["open", "active", "settled", "muted"].includes(s.tone))
      fail(`status ${s.id} needs tone: open | active | settled | muted`);
  return lens;
}

// ---------- ops ----------

export type Op =
  | { op: "add"; id?: string; title: string; kind?: string; status?: string; summary?: string; parent?: string | null }
  | ({ op: "update"; node: string } & NodePatch)
  | { op: "move"; node: string; parent: string | null }
  | { op: "link"; from: string; to: string; relation: string; label?: string }
  | { op: "unlink"; edge?: string; from?: string; to?: string; relation?: string }
  | { op: "merge"; from: string; into: string }
  | { op: "remove"; node: string; cascade?: boolean }
  | { op: "touch"; nodes: string[] }
  | { op: "lens"; lens: Lens }
  | { op: "meta"; title?: string; purpose?: string };

export type ApplyResult = { batch: string; events: number; created: string[]; linked: string[]; warnings: string[] };

const ROOT_REFS = new Set(["", "root", "none", "null"]);

export function resolveNode(state: MapState, ref: string): string {
  if (state.nodes.has(ref)) return ref;
  const lower = ref.trim().toLowerCase();
  const byTitle = [...state.nodes.values()].filter((n) => n.title.trim().toLowerCase() === lower);
  if (byTitle.length === 1) return byTitle[0]!.id;
  if (byTitle.length > 1) throw new UserError(`"${ref}" matches several nodes; use an id: ${byTitle.map((n) => n.id).join(", ")}`);
  throw new UserError(`unknown node: ${ref}`);
}

function resolveParent(state: MapState, ref: string | null | undefined): string | null {
  if (ref === null || ref === undefined || ROOT_REFS.has(ref.trim().toLowerCase())) return null;
  return resolveNode(state, ref);
}

function checkLensValue(state: MapState, key: "kinds" | "statuses" | "relations", value: string) {
  const items = state.lens[key];
  if (items.length && !items.some((i) => i.id === value))
    throw new UserError(`unknown ${key.slice(0, -1)} "${value}"; lens allows: ${items.map((i) => i.id).join(", ")}`);
}

function newNodeId(state: MapState, usedIds: Set<string>, title: string, requested?: string): string {
  if (requested) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(requested)) throw new UserError(`node id must be lowercase kebab-case: ${requested}`);
    if (state.nodes.has(requested)) throw new UserError(`node id already exists: ${requested}`);
    return requested;
  }
  let base = slugify(title).slice(0, 32).replace(/-+$/g, "");
  if (base.length < 2) base = "n";
  let id = base === "n" ? `n${usedIds.size + 1}` : base;
  for (let i = 2; usedIds.has(id) || state.nodes.has(id); i++) id = base === "n" ? `n${usedIds.size + i}` : `${base}-${i}`;
  return id;
}

/** Validate ops against the live map and append them as one batch (all or nothing). */
export function applyOps(slug: string, ops: Op[], actor: Actor, now = new Date()): ApplyResult {
  if (!Array.isArray(ops) || ops.length === 0) throw new UserError("no operations given");
  return withLock(slug, () => {
    const prior = readEvents(slug);
    const state = fold(slug, prior);
    const usedIds = new Set(prior.flatMap((e) => (e.type === "node_added" ? [e.id] : [])));
    const batch = newBatchId();
    const at = now.toISOString();
    let seq = state.seq;
    const out: MapEvent[] = [];
    const touched = new Set<string>();
    const created: string[] = [];
    const warnings: string[] = [];

    const emit = (body: EventBody) => {
      const event = { v: 1, seq: ++seq, at, batch, actor, ...body } as MapEvent;
      applyEvent(state, event);
      out.push(event);
    };

    ops.forEach((op, index) => {
      try {
        switch (op.op) {
          case "add": {
            if (!op.title?.trim()) throw new UserError("add needs a title");
            const parentId = resolveParent(state, op.parent);
            const kind = op.kind ?? (state.lens.kinds.length === 1 ? state.lens.kinds[0]!.id : undefined);
            if (!kind) throw new UserError(`add needs a kind (${state.lens.kinds.map((k) => k.id).join(", ")})`);
            checkLensValue(state, "kinds", kind);
            const status = op.status ?? state.lens.statuses[0]?.id ?? "open";
            checkLensValue(state, "statuses", status);
            const sibling = [...state.nodes.values()].find(
              (n) => n.parentId === parentId && n.title.trim().toLowerCase() === op.title.trim().toLowerCase(),
            );
            if (sibling) throw new UserError(`"${op.title}" already exists here as ${sibling.id}; update or touch it instead`);
            const id = newNodeId(state, usedIds, op.title, op.id);
            usedIds.add(id);
            emit({ type: "node_added", id, title: op.title.trim(), kind, status, summary: op.summary ?? "", parentId });
            created.push(id);
            touched.add(id);
            return;
          }
          case "update": {
            const id = resolveNode(state, op.node);
            const patch: NodePatch = {};
            if (op.title !== undefined) patch.title = op.title.trim();
            if (op.summary !== undefined) patch.summary = op.summary;
            if (op.kind !== undefined) {
              checkLensValue(state, "kinds", op.kind);
              patch.kind = op.kind;
            }
            if (op.status !== undefined) {
              checkLensValue(state, "statuses", op.status);
              patch.status = op.status;
            }
            if (Object.keys(patch).length === 0) throw new UserError("update needs at least one field");
            emit({ type: "node_updated", id, patch });
            touched.add(id);
            return;
          }
          case "move": {
            const id = resolveNode(state, op.node);
            const parentId = resolveParent(state, op.parent);
            if (parentId === id || (parentId && isDescendant(state, parentId, id)))
              throw new UserError(`cannot move ${id} under its own subtree`);
            emit({ type: "node_moved", id, parentId });
            touched.add(id);
            return;
          }
          case "link": {
            const from = resolveNode(state, op.from);
            const to = resolveNode(state, op.to);
            if (from === to) throw new UserError("cannot link a node to itself");
            checkLensValue(state, "relations", op.relation);
            const dup = [...state.edges.values()].find((e) => e.from === from && e.to === to && e.relation === op.relation);
            if (dup) {
              warnings.push(`edge already exists: ${dup.id}`);
              return;
            }
            let id = `${from}~${op.relation}~${to}`;
            for (let i = 2; state.edges.has(id); i++) id = `${from}~${op.relation}~${to}-${i}`;
            emit({ type: "edge_added", id, from, to, relation: op.relation, label: op.label });
            return;
          }
          case "unlink": {
            let ids: string[];
            if (op.edge) {
              if (!state.edges.has(op.edge)) throw new UserError(`unknown edge: ${op.edge}`);
              ids = [op.edge];
            } else {
              if (!op.from || !op.to) throw new UserError("unlink needs an edge id or from + to");
              const from = resolveNode(state, op.from);
              const to = resolveNode(state, op.to);
              ids = [...state.edges.values()]
                .filter(
                  (e) =>
                    ((e.from === from && e.to === to) || (e.from === to && e.to === from)) &&
                    (!op.relation || e.relation === op.relation),
                )
                .map((e) => e.id);
              if (ids.length === 0) throw new UserError(`no edge between ${from} and ${to}`);
            }
            for (const id of ids) emit({ type: "edge_removed", id });
            return;
          }
          case "merge": {
            const from = resolveNode(state, op.from);
            const into = resolveNode(state, op.into);
            if (from === into) throw new UserError("cannot merge a node into itself");
            emit({ type: "nodes_merged", from, into });
            touched.delete(from);
            touched.add(into);
            return;
          }
          case "remove": {
            const id = resolveNode(state, op.node);
            emit({ type: "node_removed", id, cascade: Boolean(op.cascade) });
            touched.delete(id);
            return;
          }
          case "touch": {
            if (!op.nodes?.length) throw new UserError("touch needs at least one node");
            for (const ref of op.nodes) touched.add(resolveNode(state, ref));
            return;
          }
          case "lens": {
            const lens = validateLens(op.lens);
            emit({ type: "lens_updated", lens });
            for (const n of state.nodes.values()) {
              if (!lens.kinds.some((k) => k.id === n.kind)) warnings.push(`${n.id} uses kind "${n.kind}" not in the new lens`);
              if (!lens.statuses.some((s) => s.id === n.status))
                warnings.push(`${n.id} uses status "${n.status}" not in the new lens`);
            }
            return;
          }
          case "meta": {
            if (op.title === undefined && op.purpose === undefined) throw new UserError("meta needs title or purpose");
            emit({ type: "map_updated", title: op.title, purpose: op.purpose });
            return;
          }
          default:
            throw new UserError(`unknown op: ${(op as { op: string }).op}`);
        }
      } catch (err) {
        if (err instanceof UserError) throw new UserError(`op #${index + 1} (${op.op}): ${err.message}`);
        throw err;
      }
    });

    const linked: string[] = [];
    if (actor.agent && actor.sessionId) {
      for (const nodeId of touched) {
        if (!state.nodes.has(nodeId)) continue;
        emit({ type: "session_linked", nodeId, agent: actor.agent, sessionId: actor.sessionId, cwd: actor.cwd });
        linked.push(nodeId);
      }
    }
    if (out.length) appendEvents(slug, out);
    return { batch, events: out.length, created, linked, warnings };
  });
}

export function createMap(
  input: { title: string; slug?: string; purpose: string; lens: Lens },
  actor: Actor,
  now = new Date(),
): string {
  const lens = validateLens(input.lens);
  let base = input.slug ? slugify(input.slug) : slugify(input.title);
  if (!base) base = `map-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  let slug = base;
  for (let i = 2; existsSync(mapDir(slug)); i++) slug = `${base}-${i}`;
  mkdirSync(mapDir(slug), { recursive: true });
  const event: MapEvent = {
    v: 1,
    seq: 1,
    at: now.toISOString(),
    batch: newBatchId(),
    actor,
    type: "map_created",
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    lens,
  };
  appendEvents(slug, [event]);
  return slug;
}

/** Revert the most recent batch that is not itself an undo and not already reverted. */
export function undoLast(slug: string, actor: Actor): { batch: string; types: string[] } {
  return withLock(slug, () => {
    const events = readEvents(slug);
    const reverted = revertedBatches(events);
    const undoBatches = new Set(events.filter((e) => e.type === "reverted").map((e) => e.batch));
    const candidates = events.filter(
      (e) => e.type !== "map_created" && e.type !== "reverted" && !reverted.has(e.batch) && !undoBatches.has(e.batch),
    );
    const last = candidates.at(-1);
    if (!last) throw new UserError("nothing to undo");
    const seq = Math.max(...events.map((e) => e.seq));
    const types = candidates.filter((e) => e.batch === last.batch).map((e) => e.type);
    appendEvents(slug, [
      { v: 1, seq: seq + 1, at: new Date().toISOString(), batch: newBatchId(), actor, type: "reverted", target: last.batch },
    ]);
    return { batch: last.batch, types };
  });
}
