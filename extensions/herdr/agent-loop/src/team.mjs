import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertOrchestrator,
  assertCompletionReady,
  readTaskFile,
  runIdFromEnv,
  sendTask,
  spawnChild,
  storeFromEnv,
  submitResult,
} from "./core.mjs";
import { flushOrchestratorInbox } from "./event-handler.mjs";
import { HerdrClient } from "./herdr.mjs";
import { loadProfileConfig, parseArgvJson, summarizeProfileConfig } from "./profiles.mjs";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const stateStore = options["state-dir"]
    ? storeFromEnv({ AGENT_LOOP_STATE_DIR: options["state-dir"] })
    : storeFromEnv();
  const runId = options.run || runIdFromEnv();
  const callerPaneId = process.env.HERDR_PANE_ID;
  const herdr = new HerdrClient();

  if (command === "spawn") {
    const task = await readTask(options);
    const args = await readLaunchArgs(options);
    const member = await spawnChild({
      runId,
      role: options.role,
      task,
      profile: options.profile,
      kind: options.kind,
      args,
      callerPaneId,
      stateStore,
      herdr,
      pluginRoot: options["plugin-root"],
      pluginConfigDir: options["config-dir"],
    });
    return print(member);
  }

  if (command === "send") {
    const task = await readTask(options);
    const member = await sendTask({
      runId,
      agentName: options.agent,
      task,
      callerPaneId,
      stateStore,
      herdr,
      pluginRoot: options["plugin-root"],
      pluginConfigDir: options["config-dir"],
    });
    return print(member);
  }

  if (command === "submit") {
    const result = await readResult(options);
    const resultPath = await submitResult({
      runId,
      callerPaneId,
      status: options.status || "completed",
      result,
      stateStore,
    });
    return print({ result_path: resultPath });
  }

  const run = await stateStore.readRun(runId);

  if (command === "list") {
    assertOrchestrator(run, callerPaneId);
    return print({ orchestrator: run.orchestrator, agents: run.agents });
  }

  if (command === "profiles") {
    assertOrchestrator(run, callerPaneId);
    const config = await loadProfileConfig(
      options["config-dir"] || process.env.AGENT_LOOP_CONFIG_DIR || process.env.HERDR_PLUGIN_CONFIG_DIR,
    );
    return print(summarizeProfileConfig(config));
  }

  if (command === "inbox") {
    assertOrchestrator(run, callerPaneId);
    return print(await stateStore.listInbox(runId, { unacknowledgedOnly: true }));
  }

  if (command === "ack") {
    assertOrchestrator(run, callerPaneId);
    const pending = await stateStore.listInbox(runId, { unacknowledgedOnly: true });
    const ids = options.all ? pending.map((item) => item.id) : asArray(options.id);
    if (!ids.length) throw new Error("Use --all or one or more --id values");
    await stateStore.markInbox(runId, ids, "acknowledged_at");
    return print({ acknowledged: ids });
  }

  if (command === "inspect") {
    assertOrchestrator(run, callerPaneId);
    requireOption(options, "agent");
    return print(await herdr.getAgent(options.agent));
  }

  if (command === "read") {
    assertOrchestrator(run, callerPaneId);
    requireOption(options, "agent");
    process.stdout.write(await herdr.readAgent(options.agent, { lines: Number(options.lines || 120) }));
    return;
  }

  if (command === "flush") {
    assertOrchestrator(run, callerPaneId);
    return print(await flushOrchestratorInbox({ runId, stateStore, herdr }));
  }

  if (command === "pause" || command === "resume") {
    assertOrchestrator(run, callerPaneId);
    const nextStatus = command === "pause" ? "paused" : "active";
    const updated = await stateStore.updateRun(runId, (current) => {
      assertOrchestrator(current, callerPaneId);
      const allowed = command === "pause" ? new Set(["active"]) : new Set(["paused"]);
      if (!allowed.has(current.status)) {
        throw new Error(`Cannot ${command} run ${runId} while it is ${current.status}`);
      }
      current.status = nextStatus;
      return current;
    });
    return print({ run_id: runId, status: updated.status });
  }

  if (command === "retire") {
    assertOrchestrator(run, callerPaneId);
    requireOption(options, "agent");
    const updated = await stateStore.updateRun(runId, (current) => {
      assertOrchestrator(current, callerPaneId);
      if (!new Set(["active", "paused"]).has(current.status)) {
        throw new Error(`Cannot retire an Agent while run ${runId} is ${current.status}`);
      }
      const agent = current.agents.find((candidate) => candidate.agent_name === options.agent);
      if (!agent) throw new Error(`Unknown child agent: ${options.agent}`);
      agent.required = false;
      agent.retired_at = new Date().toISOString();
      agent.retired_reason = options.reason || "retired by Orchestrator";
      return current;
    });
    const retired = updated.agents.find((candidate) => candidate.agent_name === options.agent);
    return print(retired);
  }

  if (command === "complete") {
    assertOrchestrator(run, callerPaneId);
    const summary = await readResult(options, "summary-file", "summary");
    const destination = path.join(stateStore.runDir(runId), "final-report.md");
    const updated = await stateStore.updateRun(runId, async (current) => {
      assertOrchestrator(current, callerPaneId);
      if (current.status !== "active") {
        throw new Error(`Cannot complete run ${runId} while it is ${current.status}`);
      }
      assertCompletionReady(current);
      await writeFile(destination, summary, "utf8");
      current.status = "completed";
      current.completed_at = new Date().toISOString();
      current.final_report = destination;
      return current;
    });
    return print({ run_id: runId, status: updated.status, final_report: destination });
  }

  throw new Error(`Unknown command: ${command || "(missing)"}`);
}

async function readTask(options) {
  if (options["task-file"]) return readTaskFile(options["task-file"]);
  if (options.task) return options.task;
  throw new Error("Use --task-file <path> or --task <text>");
}

async function readResult(options, fileKey = "result-file", textKey = "result") {
  if (options[fileKey]) return readTaskFile(options[fileKey]);
  if (options[textKey]) return options[textKey];
  throw new Error(`Use --${fileKey} <path> or --${textKey} <text>`);
}

async function readLaunchArgs(options) {
  const provided = ["args-file", "args-json", "arg"].some((key) => options[key] !== undefined);
  if (!provided) return undefined;
  const args = [];
  if (options["args-file"]) {
    args.push(...parseArgvJson(await readTaskFile(options["args-file"]), "--args-file"));
  }
  if (options["args-json"]) {
    args.push(...parseArgvJson(options["args-json"], "--args-json"));
  }
  for (const value of asArray(options.arg)) {
    if (value === true) {
      throw new Error("Use --arg=<value> when the Agent argument begins with --");
    }
    args.push(String(value));
  }
  return args;
}

export function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const equalsAt = value.indexOf("=");
    const key = equalsAt >= 0 ? value.slice(2, equalsAt) : value.slice(2);
    const next = args[index + 1];
    const optionValue = equalsAt >= 0
      ? value.slice(equalsAt + 1)
      : (!next || next.startsWith("--") ? true : next);
    if (equalsAt < 0 && optionValue !== true) index += 1;
    if (parsed[key] === undefined) parsed[key] = optionValue;
    else if (Array.isArray(parsed[key])) parsed[key].push(optionValue);
    else parsed[key] = [parsed[key], optionValue];
  }
  return parsed;
}

function requireOption(options, key) {
  if (!options[key]) throw new Error(`--${key} is required`);
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
