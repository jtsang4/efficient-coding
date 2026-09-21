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
  assert.match(herdr.prompts[0].prompt, /--state-dir/);
  assert.match(herdr.prompts[0].prompt, /--plugin-root/);
  assert.deepEqual(herdr.focused, [run.orchestrator.agent_name]);
});

test("orchestrator profile forwards Claude startup argv without persisting secrets", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-orchestrator-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const profileConfig = {
    defaults: {},
    profiles: {
      "claude-unrestricted": { kind: "claude", args: ["--dangerously-skip-permissions"] },
    },
  };

  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Coordinate",
    orchestratorProfile: "claude-unrestricted",
    profileConfig,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    pluginConfigDir: "/plugin-config",
  });

  assert.deepEqual(herdr.started[0], {
    name: run.orchestrator.agent_name,
    kind: "claude",
    paneId: run.orchestrator.pane_id,
    args: ["--dangerously-skip-permissions"],
  });
  assert.equal(run.orchestrator.profile, "claude-unrestricted");
  assert.equal(run.orchestrator.arg_count, 1);
  assert.equal(Object.hasOwn(run.orchestrator, "args"), false);
  assert.equal(herdr.tabs[0].env.AGENT_LOOP_CONFIG_DIR, "/plugin-config");
});

test("role profiles select different child Agents and do not inherit orchestrator argv", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-role-profiles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const profileConfig = {
    defaults: { implementer: "claude-dev", verifier: "pi-verify" },
    profiles: {
      "claude-dev": { kind: "claude", args: ["--model", "dev model"] },
      "pi-verify": { kind: "pi", args: ["--thinking", "high"] },
    },
  };
  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    orchestratorKind: "claude",
    orchestratorArgs: ["--dangerously-skip-permissions"],
    profileConfig,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  });
  const common = {
    runId: run.run_id,
    task: "Bounded work",
    callerPaneId: run.orchestrator.pane_id,
    profileConfig,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  };
  await spawnChild({ ...common, role: "implementer" });
  await spawnChild({ ...common, role: "verifier" });

  assert.deepEqual(herdr.started.slice(1).map(({ kind, args }) => ({ kind, args })), [
    { kind: "claude", args: ["--model", "dev model"] },
    { kind: "pi", args: ["--thinking", "high"] },
  ]);

  const noDefaults = { defaults: {}, profiles: {} };
  await spawnChild({ ...common, role: "implementer", profileConfig: noDefaults, task: "No profile" });
  assert.deepEqual(herdr.started.at(-1).args, []);
  assert.equal(herdr.started.at(-1).kind, "claude");
});

test("invalid profiles fail before creating runs or reserving child Agents", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-invalid-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  await assert.rejects(startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    orchestratorProfile: "missing",
    profileConfig: { defaults: {}, profiles: {} },
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  }), /Unknown Agent profile/);
  assert.deepEqual(await store.listRuns(), []);
  assert.equal(herdr.tabs.length, 0);

  const run = await startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
    focus: false,
  });
  await assert.rejects(spawnChild({
    runId: run.run_id,
    role: "implementer",
    task: "Work",
    profile: "missing",
    profileConfig: { defaults: {}, profiles: {} },
    callerPaneId: run.orchestrator.pane_id,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  }), /Unknown Agent profile/);
  assert.equal((await store.readRun(run.run_id)).agents.length, 0);
});

test("spawning from an old run migrates control paths before prompting the child", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-old-child-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "old-child-run",
    workspace_id: "w1",
    session_key: "default",
    cwd: "/project",
    status: "active",
    orchestrator_kind: "codex",
    orchestrator: { agent_name: "orchestrator-old", role: "orchestrator", pane_id: "w1:p1" },
    agents: [],
  });
  const herdr = new FakeHerdr();
  await spawnChild({
    runId: "old-child-run",
    role: "implementer",
    task: "Continue old run",
    callerPaneId: "w1:p1",
    stateStore: store,
    herdr,
    pluginRoot: "/plugin root",
    pluginConfigDir: "/plugin config",
  });

  const run = await store.readRun("old-child-run");
  assert.equal(run.state_root, root);
  assert.equal(run.control_recovery_pending, true);
  assert.match(herdr.prompts[0].prompt, /--state-dir/);
  assert.equal(herdr.prompts[0].prompt.includes("'undefined'"), false);
  assert.equal(herdr.tabs[0].env.AGENT_LOOP_CONFIG_DIR, "/plugin config");
});

test("an incompatible native argv failure marks the run failed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-argv-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  herdr.startAgent = async (options) => {
    herdr.started.push(options);
    throw new Error("agent_not_ready");
  };

  await assert.rejects(startRun({
    workspaceId: "w1",
    cwd: "/project",
    task: "Build",
    orchestratorKind: "claude",
    orchestratorArgs: ["--print"],
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  }), /agent_not_ready/);
  const [run] = await store.listRuns();
  assert.equal(run.status, "failed");
  assert.equal(run.orchestrator.arg_count, 1);
  assert.equal(Object.hasOwn(run.orchestrator, "args"), false);
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

test("concurrent spawns keep profile argv isolated", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-profile-race-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  const herdr = new FakeHerdr();
  const profileConfig = {
    defaults: {},
    profiles: {
      alpha: { kind: "claude", args: ["--model", "alpha"] },
      beta: { kind: "pi", args: ["--model", "beta"] },
    },
  };
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
    profileConfig,
    stateStore: store,
    herdr,
    pluginRoot: "/plugin",
  };
  await Promise.all([
    spawnChild({ ...common, profile: "alpha" }),
    spawnChild({ ...common, profile: "beta" }),
  ]);
  const childStarts = herdr.started.slice(1).map(({ kind, args }) => ({ kind, args }));
  assert.deepEqual(childStarts.sort((a, b) => a.kind.localeCompare(b.kind)), [
    { kind: "claude", args: ["--model", "alpha"] },
    { kind: "pi", args: ["--model", "beta"] },
  ]);
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
    pluginRoot: "/plugin",
  });
  const verifier = (await store.readRun("resend-run")).agents[0];
  assert.equal(verifier.latest_result_status, null);
  assert.equal(verifier.status, "prompted");
  assert.match(herdr.prompts[0].prompt, /--state-dir/);
  assert.match(herdr.prompts[0].prompt, /submit/);
});
