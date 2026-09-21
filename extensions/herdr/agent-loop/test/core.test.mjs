import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { completionProblems, sendTask, spawnChild, startRun, submitResult } from "../src/core.mjs";
import { StateStore } from "../src/state.mjs";

class FakeHerdr {
  constructor() {
    this.tabs = [];
    this.started = [];
    this.prompts = [];
    this.focused = [];
  }

  async workspace(id) {
    return { workspace_id: id, cwd: "/project" };
  }

  async createTab(options) {
    const index = this.tabs.length + 1;
    this.tabs.push(options);
    return {
      tab: { tab_id: `t${index}` },
      rootPane: { pane_id: `w1:p${index}` },
    };
  }

  async startAgent(options) {
    this.started.push(options);
    return { name: options.name, status: "idle" };
  }

  async promptAgent(name, prompt) {
    this.prompts.push({ name, prompt });
    return { name, status: "working" };
  }

  async focusAgent(name) {
    this.focused.push(name);
  }
}

test("startRun creates one orchestrator and prompts without waiting", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-core-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();

  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build the feature",
    acceptance: "E2E passes",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  });

  assert.equal(run.status, "active");
  assert.equal(run.orchestrator.pane_id, "w1:p1");
  assert.equal(herdr.started.length, 1);
  assert.equal(herdr.prompts.length, 1);
  assert.match(herdr.prompts[0].prompt, /不要用 `agent prompt --wait`/);
  assert.deepEqual(herdr.focused, [run.orchestrator.agent_name]);
});

test("orchestrator can dynamically spawn multiple implementers and verifiers", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-dynamic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  });

  const common = {
    runId: run.run_id,
    task: "Do a bounded task",
    callerPaneId: run.orchestrator.pane_id,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  };
  await spawnChild({ ...common, role: "implementer" });
  await spawnChild({ ...common, role: "implementer" });
  await spawnChild({ ...common, role: "verifier" });

  const updated = await store.readRun(run.run_id);
  assert.deepEqual(updated.agents.map((agent) => agent.role), ["implementer", "implementer", "verifier"]);
  assert.equal(new Set(updated.agents.map((agent) => agent.agent_name)).size, 3);
  assert.equal(herdr.prompts.length, 4);
  assert.match(herdr.prompts.at(-1).prompt, /独立验收 Agent/);
});

test("concurrent spawns reserve distinct child identities", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-spawn-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  });
  const common = {
    runId: run.run_id,
    role: "implementer",
    task: "Parallel task",
    callerPaneId: run.orchestrator.pane_id,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  };
  const members = await Promise.all([spawnChild(common), spawnChild(common)]);
  assert.equal(new Set(members.map((member) => member.agent_name)).size, 2);
  assert.equal(new Set(herdr.tabs.slice(1).map((tab) => tab.env.AGENT_LOOP_AGENT_NAME)).size, 2);
});

test("concurrent starts preserve one Orchestrator per workspace", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-start-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const options = {
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  };
  const results = await Promise.allSettled([startRun(options), startRun(options)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await store.listRuns({ activeOnly: true })).length, 1);
});

test("the same workspace ID may have one run in each Herdr session", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-session-start-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const first = await startRun({
    workspaceId: "w1",
    cwd: "/project-a",
    task: "Build A",
    stateStore: store,
    herdr: new FakeHerdr(),
    pluginRoot: "/plugin",
    sessionKey: "/socket/a",
    focus: false,
  });
  const second = await startRun({
    workspaceId: "w1",
    cwd: "/project-b",
    task: "Build B",
    stateStore: store,
    herdr: new FakeHerdr(),
    pluginRoot: "/plugin",
    sessionKey: "/socket/b",
    focus: false,
  });
  assert.notEqual(first.run_id, second.run_id);
  assert.equal((await store.findActiveByWorkspace("w1", "/socket/a")).run_id, first.run_id);
  assert.equal((await store.findActiveByWorkspace("w1", "/socket/b")).run_id, second.run_id);
});

test("child pane cannot spawn another child", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  });
  await assert.rejects(
    spawnChild({
      runId: run.run_id,
      role: "implementer",
      task: "Unauthorized",
      callerPaneId: "w1:p99",
      stateStore: store,
      herdr,
      pluginRoot: "/plugin",
    }),
    /restricted to the run's Orchestrator pane/,
  );
});

test("startRun refuses to fall back to the plugin directory when cwd is absent", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-no-cwd-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  herdr.workspace = async () => ({ workspace_id: "w1", label: "Project", worktree: null });

  await assert.rejects(
    startRun({
      workspaceId: "w1",
      task: "Build",
      stateStore: store,
      herdr,
      pluginRoot: "/plugin",
    }),
    /resolve the target workspace cwd/,
  );
  assert.equal(herdr.tabs.length, 0);
});

test("Verifier PASS requires a structured zero-issue result", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-pass-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "pass-run",
    workspace_id: "w1",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [{ agent_name: "verifier-1", role: "verifier", pane_id: "w1:p2", status: "idle" }],
  });

  await assert.rejects(
    submitResult({
      runId: "pass-run",
      callerPaneId: "w1:p2",
      status: "pass",
      result: "looks good",
      stateStore: store,
    }),
    /requires JSON/,
  );

  await submitResult({
    runId: "pass-run",
    callerPaneId: "w1:p2",
    status: "pass",
    result: JSON.stringify({ verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] }),
    stateStore: store,
  });
  assert.deepEqual(completionProblems(await store.readRun("pass-run")), []);
});

test("completion gate rejects missing or stale verifier passes", () => {
  const base = {
    agents: [{
      agent_name: "implementer-1",
      role: "implementer",
      status: "idle",
      latest_result_at: "2026-09-22T10:00:00.000Z",
    }],
  };
  assert.match(completionProblems(base).join("; "), /no verifier/);

  const stale = structuredClone(base);
  stale.agents.push({
    agent_name: "verifier-1",
    role: "verifier",
    status: "idle",
    latest_result_status: "pass",
    latest_result_at: "2026-09-22T09:00:00.000Z",
    latest_result_data: { verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] },
  });
  assert.match(completionProblems(stale).join("; "), /predates/);

  stale.agents[1].required = false;
  stale.agents[1].retired_at = "2026-09-22T10:30:00.000Z";
  assert.match(completionProblems(stale).join("; "), /no verifier/);
});

test("retiring an implementer cannot make an older verifier PASS current", () => {
  const run = {
    agents: [
      {
        agent_name: "implementer-1",
        role: "implementer",
        status: "exited",
        required: false,
        retired_at: "2026-09-22T11:10:00.000Z",
        latest_result_at: "2026-09-22T11:00:00.000Z",
      },
      {
        agent_name: "verifier-1",
        role: "verifier",
        status: "idle",
        latest_result_status: "pass",
        latest_result_at: "2026-09-22T10:00:00.000Z",
        latest_result_data: { verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] },
      },
    ],
  };
  assert.match(completionProblems(run).join("; "), /predates/);
});

test("a verifier PASS cannot satisfy a newer verifier assignment", () => {
  const run = {
    agents: [{
      agent_name: "verifier-1",
      role: "verifier",
      status: "idle",
      last_assignment_at: "2026-09-22T11:00:00.000Z",
      latest_result_status: "pass",
      latest_result_at: "2026-09-22T10:00:00.000Z",
      latest_result_data: { verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] },
    }],
  };
  assert.match(completionProblems(run).join("; "), /latest assignment/);
});

test("sending a new verifier task invalidates its previous PASS", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-resend-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "resend-run",
    workspace_id: "w1",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [{
      agent_name: "verifier-1",
      role: "verifier",
      pane_id: "w1:p2",
      status: "idle",
      latest_result_status: "pass",
      latest_result_at: "2026-09-22T10:00:00.000Z",
      latest_result_data: { verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] },
    }],
  });
  const herdr = new FakeHerdr();
  await sendTask({
    runId: "resend-run",
    agentName: "verifier-1",
    task: "Verify again",
    callerPaneId: "w1:p1",
    stateStore: store,
    herdr,
  });
  const verifier = (await store.readRun("resend-run")).agents[0];
  assert.equal(verifier.latest_result_status, null);
  assert.equal(verifier.status, "prompted");
});
