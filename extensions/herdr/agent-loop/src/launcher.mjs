import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { startRun } from "./core.mjs";

async function readBlock(rl, title, { required = false } = {}) {
  stdout.write(`\n${title}\n逐行输入；单独输入 . 完成。\n`);
  const lines = [];
  while (true) {
    const line = await rl.question(lines.length ? "... " : "> ");
    if (line.trim() === ".") break;
    lines.push(line);
  }
  const value = lines.join("\n").trim();
  if (required && !value) throw new Error(`${title}不能为空`);
  return value;
}

async function main() {
  if (!stdin.isTTY) throw new Error("Launcher requires an interactive Herdr popup");
  const workspaceId = process.env.HERDR_WORKSPACE_ID;
  if (!workspaceId) throw new Error("Launcher must be opened from a Herdr workspace");
  const cwd = process.env.AGENT_LOOP_WORKSPACE_CWD;
  if (!cwd) throw new Error("Launcher did not receive the target workspace cwd");

  stdout.write("Agent Loop\n==========\n");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const task = await readBlock(rl, "任务", { required: true });
    const acceptance = await readBlock(rl, "验收要求（可留空）");
    const kindInput = await rl.question("\nOrchestrator Agent 类型 [codex]: ");
    const orchestratorKind = kindInput.trim() || "codex";
    stdout.write("\n正在启动 Orchestrator…\n");
    const run = await startRun({ workspaceId, cwd, task, acceptance, orchestratorKind });
    stdout.write(`已启动 ${run.orchestrator.agent_name}（run_id: ${run.run_id}）。\n`);
  } finally {
    rl.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
