// Pure data model: event types and the fold that turns an event log into a map snapshot.
// Shared by the CLI, the server, and (types only) the web client.

export type AgentKind = "claude-code" | "codex";

export type LensItem = { id: string; label: string; description?: string };
// tone drives visuals generically, so any status vocabulary can be rendered:
// open = mentioned but not unfolded, active = being worked on, settled = done/understood/decided,
// muted = kept for the record but no longer in play (e.g. rejected).
export type StatusTone = "open" | "active" | "settled" | "muted";
export type LensStatus = LensItem & { tone: StatusTone };

export type Lens = {
  pillar: string;
  kinds: LensItem[];
  statuses: LensStatus[];
  relations: LensItem[];
};

export type Actor = { agent: AgentKind | null; sessionId: string | null; cwd: string };

type Envelope = { v: 1; seq: number; at: string; batch: string; actor: Actor };

export type NodePatch = { title?: string; kind?: string; status?: string; summary?: string };

export type EventBody =
  | { type: "map_created"; title: string; purpose: string; lens: Lens }
  | { type: "map_updated"; title?: string; purpose?: string }
  | { type: "lens_updated"; lens: Lens }
  | {
      type: "node_added";
      id: string;
      title: string;
      kind: string;
      status: string;
      summary: string;
      parentId: string | null;
    }
  | { type: "node_updated"; id: string; patch: NodePatch }
  | { type: "node_moved"; id: string; parentId: string | null }
  | { type: "node_removed"; id: string; cascade: boolean }
  | { type: "nodes_merged"; from: string; into: string }
  | { type: "edge_added"; id: string; from: string; to: string; relation: string; label?: string }
  | { type: "edge_removed"; id: string }
  | { type: "session_linked"; nodeId: string; agent: AgentKind; sessionId: string; cwd: string }
  | { type: "reverted"; target: string };

export type MapEvent = Envelope & EventBody;

export type NodeSession = { agent: AgentKind; sessionId: string; cwd: string; at: string[] };

export type MapNode = {
  id: string;
  title: string;
  kind: string;
  status: string;
  summary: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  sessions: NodeSession[];
};

export type MapEdge = { id: string; from: string; to: string; relation: string; label?: string };

export type MapState = {
  slug: string;
  title: string;
  purpose: string;
  lens: Lens;
  createdAt: string;
  updatedAt: string;
  seq: number;
  nodes: Map<string, MapNode>;
  edges: Map<string, MapEdge>;
};

export type MapSnapshot = Omit<MapState, "nodes" | "edges"> & { nodes: MapNode[]; edges: MapEdge[] };

export const emptyLens = (): Lens => ({ pillar: "", kinds: [], statuses: [], relations: [] });

export function createState(slug: string): MapState {
  return {
    slug,
    title: slug,
    purpose: "",
    lens: emptyLens(),
    createdAt: "",
    updatedAt: "",
    seq: 0,
    nodes: new Map(),
    edges: new Map(),
  };
}

export function revertedBatches(events: MapEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.type === "reverted") out.add(e.target);
  return out;
}

export function fold(slug: string, events: MapEvent[]): MapState {
  const state = createState(slug);
  const skip = revertedBatches(events);
  for (const e of events) {
    state.seq = Math.max(state.seq, e.seq);
    if (e.type !== "reverted" && skip.has(e.batch)) continue;
    applyEvent(state, e);
  }
  return state;
}

export function isDescendant(state: MapState, candidate: string, ancestor: string): boolean {
  let cur = state.nodes.get(candidate);
  const seen = new Set<string>();
  while (cur && cur.parentId && !seen.has(cur.id)) {
    if (cur.parentId === ancestor) return true;
    seen.add(cur.id);
    cur = state.nodes.get(cur.parentId);
  }
  return false;
}

function mergeSessions(into: MapNode, from: NodeSession[]) {
  for (const s of from) {
    const existing = into.sessions.find((x) => x.agent === s.agent && x.sessionId === s.sessionId);
    if (existing) existing.at = [...new Set([...existing.at, ...s.at])].sort();
    else into.sessions.push({ ...s, at: [...s.at] });
  }
}

function dropEdgesOf(state: MapState, nodeId: string) {
  for (const [id, edge] of state.edges) if (edge.from === nodeId || edge.to === nodeId) state.edges.delete(id);
}

// Invalid operations (unknown nodes, cycles) are ignored rather than thrown, so reverting
// an earlier batch can never make the rest of the log unreadable.
export function applyEvent(state: MapState, e: MapEvent): void {
  state.updatedAt = e.at;
  switch (e.type) {
    case "map_created":
      state.title = e.title;
      state.purpose = e.purpose;
      state.lens = e.lens;
      state.createdAt = e.at;
      return;
    case "map_updated":
      if (e.title !== undefined) state.title = e.title;
      if (e.purpose !== undefined) state.purpose = e.purpose;
      return;
    case "lens_updated":
      state.lens = e.lens;
      return;
    case "node_added": {
      if (state.nodes.has(e.id)) return;
      const parentId = e.parentId && state.nodes.has(e.parentId) ? e.parentId : null;
      state.nodes.set(e.id, {
        id: e.id,
        title: e.title,
        kind: e.kind,
        status: e.status,
        summary: e.summary,
        parentId,
        createdAt: e.at,
        updatedAt: e.at,
        sessions: [],
      });
      return;
    }
    case "node_updated": {
      const node = state.nodes.get(e.id);
      if (!node) return;
      for (const [k, v] of Object.entries(e.patch)) if (v !== undefined) (node as any)[k] = v;
      node.updatedAt = e.at;
      return;
    }
    case "node_moved": {
      const node = state.nodes.get(e.id);
      if (!node) return;
      if (e.parentId !== null) {
        if (e.parentId === e.id || !state.nodes.has(e.parentId)) return;
        if (isDescendant(state, e.parentId, e.id)) return;
      }
      node.parentId = e.parentId;
      node.updatedAt = e.at;
      return;
    }
    case "node_removed": {
      const node = state.nodes.get(e.id);
      if (!node) return;
      if (e.cascade) {
        const doomed = [...state.nodes.keys()].filter((id) => id === e.id || isDescendant(state, id, e.id));
        for (const id of doomed) {
          state.nodes.delete(id);
          dropEdgesOf(state, id);
        }
        return;
      }
      for (const child of state.nodes.values()) if (child.parentId === e.id) child.parentId = node.parentId;
      const parent = node.parentId ? state.nodes.get(node.parentId) : undefined;
      if (parent) mergeSessions(parent, node.sessions);
      state.nodes.delete(e.id);
      dropEdgesOf(state, e.id);
      return;
    }
    case "nodes_merged": {
      const from = state.nodes.get(e.from);
      const into = state.nodes.get(e.into);
      if (!from || !into || e.from === e.into) return;
      // If the target sits inside the absorbed subtree, lift it to the absorbed node's place first.
      if (isDescendant(state, e.into, e.from)) into.parentId = from.parentId;
      for (const child of state.nodes.values()) if (child.parentId === e.from) child.parentId = e.into;
      mergeSessions(into, from.sessions);
      for (const [id, edge] of state.edges) {
        if (edge.from === e.from) edge.from = e.into;
        if (edge.to === e.from) edge.to = e.into;
        if (edge.from === edge.to) state.edges.delete(id);
      }
      state.nodes.delete(e.from);
      into.updatedAt = e.at;
      return;
    }
    case "edge_added":
      if (!state.nodes.has(e.from) || !state.nodes.has(e.to) || e.from === e.to) return;
      state.edges.set(e.id, { id: e.id, from: e.from, to: e.to, relation: e.relation, label: e.label });
      return;
    case "edge_removed":
      state.edges.delete(e.id);
      return;
    case "session_linked": {
      const node = state.nodes.get(e.nodeId);
      if (!node) return;
      mergeSessions(node, [{ agent: e.agent, sessionId: e.sessionId, cwd: e.cwd, at: [e.at] }]);
      return;
    }
    case "reverted":
      return;
  }
}

export function toSnapshot(state: MapState): MapSnapshot {
  return { ...state, nodes: [...state.nodes.values()], edges: [...state.edges.values()] };
}

export function depthOf(state: MapState, id: string): number {
  let depth = 0;
  let cur = state.nodes.get(id);
  while (cur?.parentId && depth < 1000) {
    depth++;
    cur = state.nodes.get(cur.parentId);
  }
  return depth;
}
