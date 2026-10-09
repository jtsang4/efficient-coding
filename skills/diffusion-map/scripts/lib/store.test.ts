import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actor, Lens } from "./model";
import { applyOps, createMap, loadMap, undoLast } from "./store";

const lens: Lens = {
  pillar: "core concepts",
  kinds: [
    { id: "concept", label: "Concept" },
    { id: "example", label: "Example" },
  ],
  statuses: [
    { id: "frontier", label: "Frontier", tone: "open" },
    { id: "grasped", label: "Grasped", tone: "settled" },
  ],
  relations: [{ id: "depends-on", label: "depends on" }],
};
const claude: Actor = { agent: "claude-code", sessionId: "s1", cwd: "/tmp" };
const codex: Actor = { agent: "codex", sessionId: "s2", cwd: "/tmp" };

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "dm-"));
  process.env.DIFFUSION_HOME = home;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const seed = () => {
  const slug = createMap({ title: "Rust Ownership", purpose: "learn", lens }, claude);
  applyOps(
    slug,
    [
      { op: "add", title: "Ownership", kind: "concept" },
      { op: "add", title: "Borrowing", kind: "concept", parent: "ownership" },
      { op: "add", title: "Lifetimes", kind: "concept", parent: "Borrowing" },
      { op: "add", title: "Move semantics", kind: "concept", parent: "ownership" },
    ],
    claude,
  );
  return slug;
};

describe("ops", () => {
  test("add builds a tree, resolves titles, and links the session", () => {
    const slug = seed();
    const s = loadMap(slug);
    expect(slug).toBe("rust-ownership");
    expect(s.nodes.get("lifetimes")?.parentId).toBe("borrowing");
    expect(s.nodes.get("ownership")?.status).toBe("frontier");
    expect(s.nodes.get("borrowing")?.sessions).toEqual([{ agent: "claude-code", sessionId: "s1", cwd: "/tmp", at: expect.any(Array) }]);
  });

  test("non-ascii titles get generated ids", () => {
    const slug = createMap({ title: "所有权", purpose: "", lens }, claude);
    expect(slug).toMatch(/^map-\d{8}$/);
    const r = applyOps(slug, [{ op: "add", title: "借用", kind: "concept" }, { op: "add", title: "生命周期", kind: "concept", parent: "借用" }], claude);
    expect(r.created).toEqual(["n1", "n2"]);
    expect(loadMap(slug).nodes.get("n2")?.parentId).toBe("n1");
  });

  test("a failing op rejects the whole batch", () => {
    const slug = seed();
    expect(() =>
      applyOps(slug, [{ op: "add", title: "Traits", kind: "concept" }, { op: "update", node: "nope", status: "grasped" }], claude),
    ).toThrow(/op #2 \(update\): unknown node: nope/);
    expect(loadMap(slug).nodes.has("traits")).toBe(false);
  });

  test("lens values are enforced", () => {
    const slug = seed();
    expect(() => applyOps(slug, [{ op: "update", node: "ownership", status: "done" }], claude)).toThrow(/lens allows: frontier, grasped/);
    expect(() => applyOps(slug, [{ op: "add", title: "X", kind: "pillar" }], claude)).toThrow(/unknown kind/);
  });

  test("move refuses cycles; root makes a pillar", () => {
    const slug = seed();
    expect(() => applyOps(slug, [{ op: "move", node: "ownership", parent: "lifetimes" }], claude)).toThrow(/own subtree/);
    applyOps(slug, [{ op: "move", node: "lifetimes", parent: "root" }], claude);
    expect(loadMap(slug).nodes.get("lifetimes")?.parentId).toBeNull();
  });

  test("remove lifts children and hands sessions to the parent", () => {
    const slug = seed();
    applyOps(slug, [{ op: "touch", nodes: ["borrowing"] }], codex);
    applyOps(slug, [{ op: "remove", node: "borrowing" }], claude);
    const s = loadMap(slug);
    expect(s.nodes.has("borrowing")).toBe(false);
    expect(s.nodes.get("lifetimes")?.parentId).toBe("ownership");
    expect(s.nodes.get("ownership")?.sessions.map((x) => x.agent).sort()).toEqual(["claude-code", "codex"]);
  });

  test("cascade remove drops the subtree and its edges", () => {
    const slug = seed();
    applyOps(slug, [{ op: "link", from: "move-semantics", to: "lifetimes", relation: "depends-on" }], claude);
    applyOps(slug, [{ op: "remove", node: "borrowing", cascade: true }], claude);
    const s = loadMap(slug);
    expect([...s.nodes.keys()].sort()).toEqual(["move-semantics", "ownership"]);
    expect(s.edges.size).toBe(0);
  });

  test("merge moves children, edges and sessions; self-loops disappear", () => {
    const slug = seed();
    applyOps(slug, [{ op: "add", title: "References", kind: "concept", parent: "ownership" }], codex);
    applyOps(slug, [{ op: "link", from: "references", to: "borrowing", relation: "depends-on" }], claude);
    applyOps(slug, [{ op: "link", from: "move-semantics", to: "references", relation: "depends-on" }], claude);
    applyOps(slug, [{ op: "merge", from: "references", into: "borrowing" }], claude);
    const s = loadMap(slug);
    expect(s.nodes.has("references")).toBe(false);
    expect([...s.edges.values()].map((e) => [e.from, e.to])).toEqual([["move-semantics", "borrowing"]]);
    expect(s.nodes.get("borrowing")?.sessions.map((x) => x.agent).sort()).toEqual(["claude-code", "codex"]);
  });

  test("merging a node into its own descendant keeps the tree connected", () => {
    const slug = seed();
    applyOps(slug, [{ op: "merge", from: "borrowing", into: "lifetimes" }], claude);
    expect(loadMap(slug).nodes.get("lifetimes")?.parentId).toBe("ownership");
  });

  test("undo reverts the last batch, then the one before", () => {
    const slug = seed();
    applyOps(slug, [{ op: "update", node: "ownership", status: "grasped" }], claude);
    applyOps(slug, [{ op: "remove", node: "lifetimes" }], claude);
    undoLast(slug, claude);
    expect(loadMap(slug).nodes.has("lifetimes")).toBe(true);
    undoLast(slug, claude);
    expect(loadMap(slug).nodes.get("ownership")?.status).toBe("frontier");
  });

  test("no session means nothing is linked", () => {
    const slug = seed();
    const r = applyOps(slug, [{ op: "add", title: "Drop", kind: "concept" }], { agent: null, sessionId: null, cwd: "/" });
    expect(r.linked).toEqual([]);
    expect(loadMap(slug).nodes.get("drop")?.sessions).toEqual([]);
  });
});
