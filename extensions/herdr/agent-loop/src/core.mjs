import { readFile } from "node:fs/promises";
import path from "node:path";
import { HerdrClient } from "./herdr.mjs";
import { buildChildPrompt, buildChildTaskPrompt, buildOrchestratorPrompt } from "./prompts.mjs";
import { loadProfileConfig, resolveLaunch, validateProfileConfig } from "./profiles.mjs";
import { createRunId, shortRunId, StateStore } from "./state.mjs";

export const PLUGIN_ID = "efficient-coding.agent-loop";
export const ACTIVE_STATUSES = new Set(["starting", "active", "paused", "blocked"]);

export function storeFromEnv(env = process.env) {
  const root = env.HERDR_PLUGIN_STATE_DIR || env.AGENT_LOOP_STATE_DIR;
  if (!root) throw new Error("HERDR_PLUGIN_STATE_DIR or AGENT_LOOP_STATE_DIR is required");
  return new StateStore(root);
}

export function runIdFromEnv(env = process.env) {
  const runId = env.AGENT_LOOP_RUN_ID;
  if (!runId) throw new Error("AGENT_LOOP_RUN_ID is required");
  return runId;
}

export async function startRun({
  workspaceId,
  cwd: requestedCwd,
  task,
  acceptance = "",
  orchestratorProfile,
  orchestratorKind,
  orchestratorArgs,
  profileConfig,
  pluginConfigDir = process.env.HERDR_PLUGIN_CONFIG_DIR,
  stateStore = storeFromEnv(),
  herdr = new HerdrClient(),
  pluginRoot = process.env.HERDR_PLUGIN_ROOT,
  sessionKey = process.env.HERDR_SOCKET_PATH || "default",
  focus = true,
} = {}) {
  if (!workspaceId) throw new Error("A Herdr workspace is required");
  if (!task?.trim()) throw new Error("Task must not be empty");
  if (!pluginRoot) throw new Error("HERDR_PLUGIN_ROOT is required");

  const launchProfiles = profileConfig
    ? validateProfileConfig(profileConfig, "profileConfig")
    : await loadProfileConfig(pluginConfigDir);
  const orchestratorLaunch = resolveLaunch({
    role: "orchestrator",
    profileName: orchestratorProfile,
    kind: orchestratorKind,
    args: orchestratorArgs,
    profileConfig: launchProfiles,
  });

  let run;
  let suffix;
  let orchestratorName;
  let resolvedCwd;
  await stateStore.withWorkspaceLock(workspaceId, async () => {
    const existing = await stateStore.findActiveByWorkspace(workspaceId, sessionKey);
    if (existing) {
      throw new Error(`Workspace ${workspaceId} already has active run ${existing.run_id}`);
    }

    const workspace = await herdr.workspace(workspaceId);
    resolvedCwd = requestedCwd
      || workspace?.worktree?.checkout_path
      || workspace?.cwd
      || workspace?.path;
    if (!resolvedCwd) {
      throw new Error("Could not resolve the target workspace cwd from the Herdr invocation context");
    }
    const runId = createRunId();
    suffix = shortRunId(runId);
    orchestratorName = `orchestrator-${suffix}`;
    run = await stateStore.createRun({
      run_id: runId,
      workspace_id: workspaceId,
      session_key: sessionKey,
      cwd: resolvedCwd,
      state_dir: stateStore.runDir(runId),
      state_root: stateStore.rootDir,
      config_dir: pluginConfigDir || null,
      plugin_root: pluginRoot,
      task,
      acceptance,
      orchestrator_kind: orchestratorLaunch.kind,
      profile_config_mode: "dynamic",
      control_scope_version: 1,
      control_recovery_pending: false,
      orchestrator: null,
    });
  }, { timeoutMs: 60_000, sessionKey });
  const runId = run.run_id;

  try {
    const created = await herdr.createTab({
      workspaceId,
      cwd: resolvedCwd,
      label: `Orchestrator ${suffix}`,
      env: paneEnvironment({
        run,
        stateStore,
        pluginRoot,
        configDir: pluginConfigDir,
        role: "orchestrator",
        agentName: orchestratorName,
      }),
    });
    if (!created.rootPane?.pane_id || !created.tab?.tab_id) {
      throw new Error("Herdr did not return the new tab and root pane IDs");
    }

    run = await stateStore.updateRun(runId, (current) => {
      current.orchestrator = {
        agent_name: orchestratorName,
        role: "orchestrator",
        profile: orchestratorLaunch.profile,
        kind: orchestratorLaunch.kind,
        arg_count: orchestratorLaunch.args.length,
        tab_id: created.tab.tab_id,
        pane_id: created.rootPane.pane_id,
        status: "starting",
      };
      return current;
    });

    await herdr.startAgent({
      name: orchestratorName,
      kind: orchestratorLaunch.kind,
      paneId: created.rootPane.pane_id,
      args: orchestratorLaunch.args,
    });
    run = await stateStore.updateRun(runId, (current) => {
      current.status = "active";
      current.orchestrator.status = "idle";
      return current;
    });

    await herdr.promptAgent(orchestratorName, buildOrchestratorPrompt({
      run,
      task,
      acceptance,
      pluginRoot,
      profileConfig: launchProfiles,
    }));
    if (focus) await herdr.focusAgent(orchestratorName);
    return await stateStore.readRun(runId);
  } catch (error) {
    await stateStore.updateRun(runId, (current) => {
      current.status = "failed";
      current.failure = { message: error.message, at: new Date().toISOString() };
      return current;
    });
    throw error;
  }
}

export async function spawnChild({
  runId,
  role,
  task,
  profile,
  kind,
  args,
  profileConfig,
  pluginConfigDir = process.env.AGENT_LOOP_CONFIG_DIR || process.env.HERDR_PLUGIN_CONFIG_DIR,
  callerPaneId,
  stateStore = storeFromEnv(),
  herdr = new HerdrClient(),
  pluginRoot = process.env.AGENT_LOOP_PLUGIN_ROOT || process.env.HERDR_PLUGIN_ROOT,
} = {}) {
  if (!new Set(["implementer", "verifier"]).has(role)) {
    throw new Error("Role must be implementer or verifier");
  }
  if (!task?.trim()) throw new Error("Task must not be empty");
  if (!pluginRoot) throw new Error("AGENT_LOOP_PLUGIN_ROOT is required");

  const launchProfiles = profileConfig
    ? validateProfileConfig(profileConfig, "profileConfig")
    : await loadProfileConfig(pluginConfigDir);
  let run = await stateStore.readRun(runId);
  assertOrchestrator(run, callerPaneId);
  if (run.status !== "active") throw new Error(`Run ${runId} is ${run.status}, not active`);
  ({ run } = await ensureRunControlMetadata({
    runId,
    stateStore,
    pluginRoot,
    configDir: pluginConfigDir,
  }));

  const agentLaunch = resolveLaunch({
    role,
    profileName: profile,
    kind,
    args,
    profileConfig: launchProfiles,
    fallbackKind: run.orchestrator_kind || "codex",
  });
  let member;
  run = await stateStore.updateRun(runId, (current) => {
    assertOrchestrator(current, callerPaneId);
    if (current.status !== "active") throw new Error(`Run ${runId} is ${current.status}, not active`);
    const sequence = 1 + Math.max(0, ...current.agents
      .filter((agent) => agent.role === role)
      .map((agent) => Number(agent.sequence) || 0));
    const agentName = `${role}-${shortRunId(runId)}-${sequence}`.slice(0, 32);
    member = {
      agent_name: agentName,
      role,
      sequence,
      profile: agentLaunch.profile,
      kind: agentLaunch.kind,
      arg_count: agentLaunch.args.length,
      tab_id: null,
      pane_id: null,
      status: "reserved",
      control_scope_version: 1,
      control_recovery_pending: false,
      required: true,
      retired_at: null,
      created_at: new Date().toISOString(),
    };
    current.agents.push(member);
    return current;
  });

  try {
    const created = await herdr.createTab({
      workspaceId: run.workspace_id,
      cwd: run.cwd,
      label: `${role === "implementer" ? "Implementer" : "Verifier"} ${member.sequence}`,
      env: paneEnvironment({
        run,
        stateStore,
        pluginRoot,
        configDir: pluginConfigDir,
        role,
        agentName: member.agent_name,
      }),
    });
    if (!created.rootPane?.pane_id || !created.tab?.tab_id) {
      throw new Error("Herdr did not return the child tab and root pane IDs");
    }
    member.tab_id = created.tab.tab_id;
    member.pane_id = created.rootPane.pane_id;
    await stateStore.updateRun(runId, (current) => {
      if (current.status !== "active") throw new Error(`Run ${runId} is ${current.status}, not active`);
      const agent = current.agents.find((candidate) => candidate.agent_name === member.agent_name);
      agent.tab_id = member.tab_id;
      agent.pane_id = member.pane_id;
      agent.status = "starting";
      return current;
    });
    await herdr.startAgent({
      name: member.agent_name,
      kind: agentLaunch.kind,
      paneId: member.pane_id,
      args: agentLaunch.args,
    });
    await herdr.promptAgent(member.agent_name, buildChildPrompt({ role, task, run, agentName: member.agent_name, pluginRoot }));
    await stateStore.updateRun(runId, (current) => {
      const agent = current.agents.find((candidate) => candidate.agent_name === member.agent_name);
      agent.status = "prompted";
      agent.last_assignment_at = new Date().toISOString();
      return current;
    });
    return member;
  } catch (error) {
    await stateStore.updateRun(runId, (current) => {
      const agent = current.agents.find((candidate) => candidate.agent_name === member.agent_name);
      agent.status = "failed";
      agent.failure = error.message;
      return current;
    });
    throw error;
  }
}

export async function sendTask({
  runId,
  agentName,
  task,
  callerPaneId,
  stateStore = storeFromEnv(),
  herdr = new HerdrClient(),
  pluginRoot = process.env.AGENT_LOOP_PLUGIN_ROOT || process.env.HERDR_PLUGIN_ROOT,
  pluginConfigDir = process.env.AGENT_LOOP_CONFIG_DIR || process.env.HERDR_PLUGIN_CONFIG_DIR,
}) {
  if (!pluginRoot) throw new Error("AGENT_LOOP_PLUGIN_ROOT is required");
  let agent;
  let run = await stateStore.readRun(runId);
  assertOrchestrator(run, callerPaneId);
  ({ run } = await ensureRunControlMetadata({
    runId,
    stateStore,
    pluginRoot,
    configDir: pluginConfigDir,
  }));
  run = await stateStore.updateRun(runId, (current) => {
    assertOrchestrator(current, callerPaneId);
    if (current.status !== "active") throw new Error(`Run ${runId} is ${current.status}, not active`);
    const currentAgent = current.agents.find((candidate) => candidate.agent_name === agentName);
    if (!currentAgent) throw new Error(`Unknown child agent: ${agentName}`);
    currentAgent.last_assignment_at = new Date().toISOString();
    currentAgent.status = "prompted";
    currentAgent.required = true;
    currentAgent.retired_at = null;
    currentAgent.retired_reason = null;
    currentAgent.latest_result = null;
    currentAgent.latest_result_status = null;
    currentAgent.latest_result_at = null;
    currentAgent.latest_result_data = null;
    currentAgent.control_scope_version = 1;
    currentAgent.control_recovery_pending = false;
    agent = { ...currentAgent };
    return current;
  });
  try {
    await herdr.promptAgent(agentName, buildChildTaskPrompt({
      role: agent.role,
      task,
      run,
      pluginRoot,
    }));
    return agent;
  } catch (error) {
    await stateStore.updateRun(runId, (current) => {
      const currentAgent = current.agents.find((candidate) => candidate.agent_name === agentName);
      currentAgent.status = "failed";
      currentAgent.failure = error.message;
      currentAgent.control_recovery_pending = true;
      return current;
    });
    throw error;
  }
}

export async function submitResult({ runId, callerPaneId, status, result, stateStore = storeFromEnv() }) {
  const normalizedStatus = String(status || "completed").toLowerCase();
  let resultPath;
  await stateStore.updateRun(runId, async (current) => {
    if (!new Set(["active", "paused"]).has(current.status)) {
      throw new Error(`Run ${runId} no longer accepts results (${current.status})`);
    }
    const member = current.agents.find((candidate) => candidate.pane_id === callerPaneId);
    if (!member) throw new Error("Only a registered child Agent may submit a result");
    const structured = member.role === "verifier" && normalizedStatus === "pass"
      ? validateVerifierPass(result)
      : tryParseJson(result);
    resultPath = await stateStore.writeResult(runId, member.agent_name, {
      role: member.role,
      status: normalizedStatus,
      content: result,
      structured,
    });
    member.latest_result = resultPath;
    member.latest_result_status = normalizedStatus;
    member.latest_result_at = new Date().toISOString();
    member.latest_result_data = structured;
    return current;
  });
  return resultPath;
}

export function completionProblems(run) {
  const problems = [];
  const requiredAgents = run.agents.filter((agent) => agent.required !== false && !agent.retired_at);
  const verifiers = requiredAgents.filter((agent) => agent.role === "verifier");
  if (!verifiers.length) problems.push("no verifier has been created");

  const busy = requiredAgents.filter((agent) => !new Set(["idle", "done"]).has(agent.status));
  if (busy.length) problems.push(`child Agents are not settled: ${busy.map((agent) => agent.agent_name).join(", ")}`);

  const lastImplementationActivity = Math.max(0, ...run.agents
    .filter((agent) => agent.role === "implementer")
    .flatMap((agent) => [agent.last_assignment_at, agent.latest_result_at])
    .filter(Boolean)
    .map((value) => Date.parse(value) || 0));

  for (const verifier of verifiers) {
    if (verifier.latest_result_status !== "pass") {
      problems.push(`${verifier.agent_name} has no latest PASS result`);
      continue;
    }
    const data = verifier.latest_result_data;
    if (!data || data.verdict !== "PASS") problems.push(`${verifier.agent_name} PASS result is not structured`);
    if (data?.unresolved_issues?.length) problems.push(`${verifier.agent_name} still has unresolved issues`);
    if (data?.required_checks_skipped?.length) problems.push(`${verifier.agent_name} skipped required checks`);
    if ((Date.parse(verifier.latest_result_at) || 0) < (Date.parse(verifier.last_assignment_at) || 0)) {
      problems.push(`${verifier.agent_name} PASS predates its latest assignment`);
    }
    if ((Date.parse(verifier.latest_result_at) || 0) < lastImplementationActivity) {
      problems.push(`${verifier.agent_name} PASS predates the latest implementation activity`);
    }
  }
  return problems;
}

export function assertCompletionReady(run) {
  const problems = completionProblems(run);
  if (problems.length) throw new Error(`Run cannot complete: ${problems.join("; ")}`);
}

export async function readTaskFile(filename) {
  if (!filename) throw new Error("--task-file or --result-file is required");
  return readFile(path.resolve(filename), "utf8");
}

export function assertOrchestrator(run, callerPaneId) {
  if (!callerPaneId || run.orchestrator?.pane_id !== callerPaneId) {
    throw new Error("This operation is restricted to the run's Orchestrator pane");
  }
}

export async function ensureRunControlMetadata({ runId, stateStore, pluginRoot, configDir }) {
  let migrated = false;
  const run = await stateStore.updateRun(runId, (current) => {
    const membersCurrent = current.agents.every((agent) => agent.control_scope_version === 1);
    if (current.control_scope_version === 1 && current.state_root && current.plugin_root && membersCurrent) {
      return current;
    }
    current.state_root = current.state_root || stateStore.rootDir;
    current.plugin_root = current.plugin_root || pluginRoot;
    if (!Object.hasOwn(current, "config_dir")) current.config_dir = configDir || null;
    current.control_scope_version = 1;
    current.control_recovery_pending = true;
    current.control_scope_migrated_at = new Date().toISOString();
    for (const agent of current.agents) {
      if (agent.control_scope_version === 1) continue;
      agent.control_scope_version = 1;
      agent.control_recovery_pending = true;
    }
    migrated = true;
    return current;
  });
  return { run, migrated };
}

function paneEnvironment({ run, stateStore, pluginRoot, configDir, role, agentName }) {
  const env = {
    AGENT_LOOP_RUN_ID: run.run_id,
    AGENT_LOOP_STATE_DIR: stateStore.rootDir,
    AGENT_LOOP_PLUGIN_ROOT: pluginRoot,
    AGENT_LOOP_ROLE: role,
    AGENT_LOOP_AGENT_NAME: agentName,
  };
  if (configDir) env.AGENT_LOOP_CONFIG_DIR = configDir;
  return env;
}

function validateVerifierPass(result) {
  const parsed = tryParseJson(result);
  if (!parsed || String(parsed.verdict).toUpperCase() !== "PASS") {
    throw new Error("Verifier PASS requires JSON with verdict: PASS");
  }
  if (!Array.isArray(parsed.unresolved_issues) || !Array.isArray(parsed.required_checks_skipped)) {
    throw new Error("Verifier PASS requires unresolved_issues and required_checks_skipped arrays");
  }
  if (parsed.unresolved_issues.length || parsed.required_checks_skipped.length) {
    throw new Error("Verifier cannot report PASS with unresolved issues or skipped required checks");
  }
  return { ...parsed, verdict: "PASS" };
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
