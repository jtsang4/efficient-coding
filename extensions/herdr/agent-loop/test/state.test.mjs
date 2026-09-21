import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRunId, StateStore } from "../src/state.mjs";

test("createRunId is sortable and filesystem-safe", () => {
  const id = createRunId(new Date("2026-09-22T03:04:05.678Z"), () => 0.5);
  assert.match(id, /^20260922030405-[a-z0-9]{5}$/);
});

test("StateStore finds dynamic members and persists inbox delivery", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const run = await store.createRun({
    run_id: "run-1",
    workspace_id: "w1",
    cwd: "/project",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [
      { agent_name: "implementer-1", role: "implementer", pane_id: "w1:p2" },
      { agent_name: "verifier-1", role: "verifier", pane_id: "w1:p3" },
    ],
    status: "active",
  });

  assert.equal((await store.findActiveByWorkspace("w1")).run_id, run.run_id);
  assert.equal((await store.findByPane("w1:p3")).member.role, "verifier");

  const item = await store.enqueue(run.run_id, {
    agent_name: "implementer-1",
    role: "implementer",
    status: "idle",
  });
  assert.equal((await store.listInbox(run.run_id, { undeliveredOnly: true })).length, 1);
  await store.markInbox(run.run_id, [item.id], "delivered_at");
  assert.equal((await store.listInbox(run.run_id, { undeliveredOnly: true })).length, 0);
  assert.equal((await store.listInbox(run.run_id, { unacknowledgedOnly: true })).length, 1);
});

test("StateStore isolates identical pane IDs across Herdr sessions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-sessions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  for (const sessionKey of ["/socket/a", "/socket/b"]) {
    await store.createRun({
      run_id: sessionKey.endsWith("a") ? "run-a" : "run-b",
      workspace_id: "w1",
      session_key: sessionKey,
      cwd: "/project",
      status: "active",
      orchestrator: { agent_name: `orchestrator-${sessionKey.at(-1)}`, role: "orchestrator", pane_id: "w1:p1" },
      agents: [{ agent_name: `worker-${sessionKey.at(-1)}`, role: "implementer", pane_id: "w1:p2" }],
    });
  }
  assert.equal((await store.findByPane("w1:p2", "/socket/a")).run.run_id, "run-a");
  assert.equal((await store.findByPane("w1:p2", "/socket/b")).run.run_id, "run-b");
});
