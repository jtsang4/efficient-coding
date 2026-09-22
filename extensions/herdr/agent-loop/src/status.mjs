import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { storeFromEnv } from "./core.mjs";

async function main() {
  const workspaceId = process.env.AGENT_LOOP_WORKSPACE_ID || process.env.HERDR_WORKSPACE_ID;
  if (!workspaceId) throw new Error("Status must be opened from a Herdr workspace");
  const store = storeFromEnv();
  const run = await store.findActiveByWorkspace(workspaceId, process.env.HERDR_SOCKET_PATH || "default");
  if (!run) {
    stdout.write("当前 Workspace 没有活跃的 Agent Loop。\n");
  } else {
    const inbox = await store.listInbox(run.run_id, { unacknowledgedOnly: true });
    stdout.write(`Agent Loop ${run.run_id}\n`);
    stdout.write(`状态：${run.status}\n`);
    const orchestratorLaunch = [run.orchestrator?.profile, run.orchestrator?.kind].filter(Boolean).join(" / ");
    stdout.write(`Orchestrator：${run.orchestrator?.agent_name} (${run.orchestrator?.status})${orchestratorLaunch ? ` [${orchestratorLaunch}]` : ""}\n`);
    stdout.write(`子 Agent：${run.agents.length}\n`);
    for (const agent of run.agents) {
      const launch = [agent.profile, agent.kind].filter(Boolean).join(" / ");
      stdout.write(`- ${agent.agent_name} [${agent.role}] ${agent.status}${launch ? ` [${launch}]` : ""}\n`);
    }
    stdout.write(`未确认事件：${inbox.length}\n`);
  }
  if (stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    await rl.question("\n按 Enter 关闭…");
    rl.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
