import { pathToFileURL } from "node:url";
import path from "node:path";
import { startRun, storeFromEnv } from "./core.mjs";
import { HerdrClient } from "./herdr.mjs";

export function selectedTextFromContext(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.selected_text === "string" && value.selected_text.trim()) {
    return value.selected_text.trim();
  }
  if (typeof value.selection === "string" && value.selection.trim()) {
    return value.selection.trim();
  }
  if (value.selection && typeof value.selection === "object") {
    const selected = value.selection.selected_text || value.selection.text;
    if (typeof selected === "string" && selected.trim()) return selected.trim();
  }
  for (const nested of Object.values(value)) {
    const found = selectedTextFromContext(nested);
    if (found) return found;
  }
  return "";
}

export function cwdFromContext(value) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["workspace_cwd", "focused_pane_cwd", "foreground_cwd", "cwd", "checkout_path"]) {
    if (typeof value[key] === "string" && path.isAbsolute(value[key])) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = cwdFromContext(nested);
    if (found) return found;
  }
  return "";
}

async function main() {
  const action = process.argv[2];
  const workspaceId = process.env.HERDR_WORKSPACE_ID;
  const herdr = new HerdrClient();
  const stateStore = storeFromEnv();
  const sessionKey = process.env.HERDR_SOCKET_PATH || "default";
  if (!workspaceId) throw new Error("Invoke this action from a Herdr workspace");

  if (action === "start") {
    const context = safeJson(process.env.HERDR_PLUGIN_CONTEXT_JSON);
    const selectedText = selectedTextFromContext(context);
    let cwd = cwdFromContext(context);
    if (!cwd && process.env.HERDR_PANE_ID) {
      try {
        const pane = await herdr.pane(process.env.HERDR_PANE_ID);
        cwd = pane?.foreground_cwd || pane?.cwd || "";
      } catch {
        // startRun will report a precise error if no cwd can be resolved.
      }
    }
    if (selectedText) {
      const run = await startRun({ workspaceId, cwd, task: selectedText, stateStore, herdr, sessionKey });
      process.stdout.write(`${JSON.stringify({ run_id: run.run_id, orchestrator: run.orchestrator.agent_name })}\n`);
      return;
    }
    if (!cwd) throw new Error("Could not resolve the current project cwd from the Herdr pane context");
    await herdr.openPluginPane("launcher", {
      focus: true,
      env: {
        AGENT_LOOP_WORKSPACE_ID: workspaceId,
        AGENT_LOOP_WORKSPACE_CWD: cwd,
      },
    });
    return;
  }

  const active = await stateStore.findActiveByWorkspace(workspaceId, sessionKey);
  if (!active) throw new Error(`No active Agent Loop run in workspace ${workspaceId}`);

  if (action === "focus") {
    await herdr.focusAgent(active.orchestrator.agent_name);
    return;
  }
  if (action === "status") {
    await herdr.openPluginPane("status", {
      focus: true,
      env: { AGENT_LOOP_WORKSPACE_ID: workspaceId },
    });
    return;
  }
  if (action === "abandon") {
    const updated = await stateStore.updateRun(active.run_id, (current) => {
      if (!new Set(["starting", "active", "paused", "blocked"]).has(current.status)) {
        throw new Error(`Run ${current.run_id} is already ${current.status}`);
      }
      current.status = "failed";
      current.failure = {
        code: "abandoned_by_user",
        message: "Run abandoned from workspace action",
        at: new Date().toISOString(),
      };
      return current;
    });
    process.stdout.write(`${JSON.stringify({ run_id: updated.run_id, status: updated.status })}\n`);
    return;
  }
  throw new Error(`Unknown action: ${action}`);
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
