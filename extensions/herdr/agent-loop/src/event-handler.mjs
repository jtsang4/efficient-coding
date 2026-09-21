import { pathToFileURL } from "node:url";
import { storeFromEnv } from "./core.mjs";
import { normalizePluginEvent } from "./events.mjs";
import { HerdrClient } from "./herdr.mjs";
import { buildEventNotification } from "./prompts.mjs";

export async function handlePluginEvent({
  eventName,
  eventJson,
  sessionKey = process.env.HERDR_SOCKET_PATH || "default",
  stateStore = storeFromEnv(),
  herdr = new HerdrClient(),
} = {}) {
  const event = normalizePluginEvent(eventName, eventJson);
  if (!event.pane_id) return { ignored: true, reason: "missing_pane_id" };

  const match = await stateStore.findByPane(event.pane_id, sessionKey);
  if (!match) return { ignored: true, reason: "unregistered_pane" };

  const { run, member } = match;
  if (member.role === "orchestrator") {
    await stateStore.updateRun(run.run_id, (current) => {
      current.orchestrator.status = event.status;
      current.orchestrator.last_status_at = new Date().toISOString();
      if (
        ["idle", "done", "working"].includes(event.status)
        && current.status === "blocked"
        && current.failure?.code === "orchestrator_unavailable"
      ) {
        current.status = "active";
        current.failure = null;
      }
      if (event.status === "exited") {
        current.status = "failed";
        current.failure = {
          code: "orchestrator_exited",
          message: "Orchestrator pane exited",
          at: new Date().toISOString(),
        };
      }
      return current;
    });
    if (["idle", "done"].includes(event.status)) {
      return flushOrchestratorInbox({ runId: run.run_id, stateStore, herdr });
    }
    return { ignored: true, reason: "orchestrator_not_available" };
  }

  let previousStatus = null;
  let latestResult = null;
  await stateStore.updateRun(run.run_id, (current) => {
    const agent = current.agents.find((candidate) => candidate.pane_id === event.pane_id);
    previousStatus = agent.status || null;
    latestResult = agent.latest_result || null;
    agent.status = event.status;
    agent.last_status_at = new Date().toISOString();
    return current;
  });

  if (!new Set(["idle", "done", "blocked", "unknown", "exited"]).has(event.status)) {
    return { ignored: true, reason: `non_settled_${event.status}` };
  }

  const item = await stateStore.enqueue(run.run_id, {
    type: event.event_name || "agent_status_changed",
    pane_id: event.pane_id,
    agent_name: member.agent_name,
    role: member.role,
    previous_status: event.previous_status || previousStatus,
    status: event.status,
    latest_result: latestResult,
  });

  const delivery = await flushOrchestratorInbox({ runId: run.run_id, stateStore, herdr });
  return { queued: item.id, delivery };
}

export async function flushOrchestratorInbox({ runId, stateStore = storeFromEnv(), herdr = new HerdrClient() }) {
  try {
    return await stateStore.withDeliveryLock(runId, async () => {
      const run = await stateStore.readRun(runId);
      if (run.status !== "active" || !run.orchestrator?.agent_name) {
        return { delivered: 0, reason: `run_${run.status}` };
      }
      const pending = await stateStore.listInbox(runId, { undeliveredOnly: true });
      if (!pending.length) return { delivered: 0, reason: "empty" };

      let orchestrator;
      try {
        orchestrator = await herdr.getAgent(run.orchestrator.agent_name);
      } catch (error) {
        return { delivered: 0, reason: "orchestrator_unavailable", error: error.message };
      }
      const status = orchestrator?.status || orchestrator?.agent_status || "unknown";
      if (!new Set(["idle", "done"]).has(status)) {
        return { delivered: 0, reason: `orchestrator_${status}` };
      }

      const batch = pending.slice(0, 20);
      try {
        await herdr.promptAgent(run.orchestrator.agent_name, buildEventNotification(run, batch));
      } catch (error) {
        return { delivered: 0, reason: "prompt_failed", error: error.message };
      }
      await stateStore.markInbox(runId, batch.map((item) => item.id), "delivered_at");
      return { delivered: batch.length };
    });
  } catch (error) {
    return { delivered: 0, reason: "delivery_lock_failed", error: error.message };
  }
}

async function main() {
  const result = await handlePluginEvent({
    eventName: process.env.HERDR_PLUGIN_EVENT,
    eventJson: process.env.HERDR_PLUGIN_EVENT_JSON,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
