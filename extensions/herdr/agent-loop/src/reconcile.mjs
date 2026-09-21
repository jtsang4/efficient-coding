import { pathToFileURL } from "node:url";
import { storeFromEnv } from "./core.mjs";
import { flushOrchestratorInbox } from "./event-handler.mjs";
import { HerdrClient } from "./herdr.mjs";

const SETTLED_STATUSES = new Set(["idle", "done", "blocked", "unknown"]);

export async function reconcileRuns({
  stateStore = storeFromEnv(),
  herdr = new HerdrClient(),
  sessionKey = process.env.HERDR_SOCKET_PATH || "default",
} = {}) {
  const runs = await stateStore.listRuns({
    activeOnly: true,
    sessionKey,
  });
  const results = [];
  for (const run of runs) {
    if (run.status === "starting") {
      await stateStore.updateRun(run.run_id, (current) => {
        current.status = "failed";
        current.failure = {
          code: "stale_starting_run",
          message: "Run did not finish creating its Orchestrator before server recovery",
          at: new Date().toISOString(),
        };
        return current;
      });
      results.push({ run_id: run.run_id, status: "failed", reason: "stale_starting_run" });
      continue;
    }
    if (!["active", "blocked", "paused"].includes(run.status)) continue;

    if (!run.orchestrator?.agent_name) {
      await markOrchestratorUnavailable(stateStore, run.run_id, "Run has no registered Orchestrator");
      results.push({ run_id: run.run_id, status: "blocked", reason: "orchestrator_unavailable" });
      continue;
    }
    try {
      await herdr.getAgent(run.orchestrator.agent_name);
      if (run.status === "blocked" && run.failure?.code === "orchestrator_unavailable") {
        await stateStore.updateRun(run.run_id, (current) => {
          current.status = "active";
          current.failure = null;
          return current;
        });
      }
    } catch {
      await markOrchestratorUnavailable(stateStore, run.run_id, "Orchestrator was not available during startup recovery");
      results.push({ run_id: run.run_id, status: "blocked", reason: "orchestrator_unavailable" });
      continue;
    }

    for (const member of run.agents) {
      let status = "unavailable";
      try {
        const agent = await herdr.getAgent(member.agent_name);
        status = agent?.status || agent?.agent_status || "unknown";
      } catch {
        // An unavailable child still deserves an Orchestrator decision after restore.
      }
      const previousStatus = member.status || null;
      await stateStore.updateRun(run.run_id, (current) => {
        const currentMember = current.agents.find((candidate) => candidate.agent_name === member.agent_name);
        currentMember.status = status;
        currentMember.last_status_at = new Date().toISOString();
        return current;
      });
      if (SETTLED_STATUSES.has(status) || status === "unavailable") {
        await stateStore.enqueue(run.run_id, {
          type: "startup.reconciled",
          pane_id: member.pane_id,
          agent_name: member.agent_name,
          role: member.role,
          previous_status: previousStatus,
          status,
          latest_result: member.latest_result || null,
        });
      }
    }
    results.push({ run_id: run.run_id, delivery: await flushOrchestratorInbox({ runId: run.run_id, stateStore, herdr }) });
  }
  return results;
}

async function markOrchestratorUnavailable(stateStore, runId, message) {
  await stateStore.updateRun(runId, (current) => {
    current.status = "blocked";
    current.failure = {
      code: "orchestrator_unavailable",
      message,
      at: new Date().toISOString(),
    };
    return current;
  });
}

async function main() {
  process.stdout.write(`${JSON.stringify(await reconcileRuns())}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
