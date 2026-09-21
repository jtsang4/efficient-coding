import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handlePluginEvent } from "../src/event-handler.mjs";
import { StateStore } from "../src/state.mjs";

class FakeHerdr {
  constructor(status = "idle") {
    this.status = status;
    this.prompts = [];
  }

  async getAgent() {
    return { status: this.status };
  }

  async promptAgent(name, prompt) {
    this.prompts.push({ name, prompt });
    this.status = "working";
  }
}

async function createRun(store) {
  return store.createRun({
    run_id: "run-1",
    workspace_id: "w1",
    session_key: "default",
    cwd: "/project",
    status: "active",
    orchestrator: {
      agent_name: "orchestrator-1",
      role: "orchestrator",
      pane_id: "w1:p1",
      status: "idle",
    },
    agents: [{
      agent_name: "implementer-1",
      role: "implementer",
      pane_id: "w1:p2",
      status: "working",
    }],
  });
}

test("child idle event is persisted and asynchronously delivered", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-event-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await createRun(store);
  const herdr = new FakeHerdr("idle");

  const result = await handlePluginEvent({
    eventName: "pane.agent_status_changed",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p2", agent_status: "idle" } }),
    stateStore: store,
    herdr,
  });

  assert.equal(result.delivery.delivered, 1);
  assert.equal(herdr.prompts.length, 1);
  assert.match(herdr.prompts[0].prompt, /implementer-1/);
  assert.match(herdr.prompts[0].prompt, /working → idle/);
  const inbox = await store.listInbox("run-1");
  assert.ok(inbox[0].delivered_at);
});

test("events queue while orchestrator works and flush when it becomes idle", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-queue-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await createRun(store);
  const herdr = new FakeHerdr("working");

  const queued = await handlePluginEvent({
    eventName: "pane.agent_status_changed",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p2", agent_status: "blocked" } }),
    stateStore: store,
    herdr,
  });
  assert.equal(queued.delivery.delivered, 0);
  assert.equal(herdr.prompts.length, 0);

  herdr.status = "idle";
  const flushed = await handlePluginEvent({
    eventName: "pane.agent_status_changed",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p1", agent_status: "idle" } }),
    stateStore: store,
    herdr,
  });
  assert.equal(flushed.delivered, 1);
  assert.equal(herdr.prompts.length, 1);
});

test("working transitions update registry without notifying orchestrator", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-working-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await createRun(store);
  const herdr = new FakeHerdr("idle");

  const result = await handlePluginEvent({
    eventName: "pane.agent_status_changed",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p2", agent_status: "working" } }),
    stateStore: store,
    herdr,
  });

  assert.equal(result.reason, "non_settled_working");
  assert.equal(herdr.prompts.length, 0);
  assert.equal((await store.listInbox("run-1")).length, 0);
  assert.equal((await store.readRun("run-1")).agents[0].status, "working");
});

test("orchestrator exit fails the run instead of permanently blocking the workspace", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-orchestrator-exit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await createRun(store);
  const herdr = new FakeHerdr("unknown");

  await handlePluginEvent({
    eventName: "pane.exited",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p1" } }),
    stateStore: store,
    herdr,
  });

  assert.equal((await store.readRun("run-1")).status, "failed");
  assert.equal(await store.findActiveByWorkspace("w1"), null);
});

test("a recovered Orchestrator reactivates a run blocked during startup recovery", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-orchestrator-recovered-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await createRun(store);
  await store.updateRun("run-1", (run) => {
    run.status = "blocked";
    run.failure = { code: "orchestrator_unavailable", message: "missing" };
    return run;
  });
  const herdr = new FakeHerdr("idle");

  await handlePluginEvent({
    eventName: "pane.agent_status_changed",
    eventJson: JSON.stringify({ data: { pane_id: "w1:p1", agent_status: "idle" } }),
    stateStore: store,
    herdr,
  });

  const run = await store.readRun("run-1");
  assert.equal(run.status, "active");
  assert.equal(run.failure, null);
});
