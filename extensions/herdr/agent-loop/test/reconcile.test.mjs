import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reconcileRuns } from "../src/reconcile.mjs";
import { StateStore } from "../src/state.mjs";

test("startup reconciliation restores a missed settled child event", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-reconcile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "run-1",
    workspace_id: "w1",
    session_key: "default",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [{ agent_name: "verifier-1", role: "verifier", pane_id: "w1:p2", status: "working" }],
  });

  const prompts = [];
  const herdr = {
    async getAgent(name) {
      return { status: name === "orchestrator-1" ? "idle" : "done" };
    },
    async promptAgent(name, prompt) {
      prompts.push({ name, prompt });
    },
  };

  const result = await reconcileRuns({ stateStore: store, herdr });
  assert.equal(result[0].delivery.delivered, 1);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].prompt, /verifier-1/);
  assert.equal((await store.readRun("run-1")).agents[0].status, "done");
});

test("startup reconciliation fails a stale starting run", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-stale-start-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "starting-run",
    workspace_id: "w1",
    session_key: "default",
    cwd: "/project",
    status: "starting",
    orchestrator: null,
  });
  const result = await reconcileRuns({ stateStore: store, herdr: {} });
  assert.equal(result[0].reason, "stale_starting_run");
  assert.equal((await store.readRun("starting-run")).status, "failed");
  assert.equal(await store.findActiveByWorkspace("w1", "default"), null);
});

test("startup reconciliation blocks an active run whose Orchestrator is unavailable", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-missing-orchestrator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "missing-run",
    workspace_id: "w1",
    session_key: "default",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-missing", role: "orchestrator", pane_id: "w1:p1" },
  });
  const herdr = { async getAgent() { throw new Error("not running"); } };
  await reconcileRuns({ stateStore: store, herdr });
  const run = await store.readRun("missing-run");
  assert.equal(run.status, "blocked");
  assert.equal(run.failure.code, "orchestrator_unavailable");
});
