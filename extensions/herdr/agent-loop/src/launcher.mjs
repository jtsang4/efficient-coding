import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { startRun } from "./core.mjs";
import { loadProfileConfig, parseArgvJson } from "./profiles.mjs";

export function isBlockTerminator(line) {
  return new Set(["/done", "."]).has(line.trim().toLowerCase());
}

export function createLinePrompter(rl, output = stdout) {
  const lines = rl[Symbol.asyncIterator]();
  return async (prompt) => {
    output.write(prompt);
    const next = await lines.next();
    if (next.done) throw new Error("输入已关闭，启动操作已取消");
    return next.value;
  };
}

async function readBlock(askLine, { step, title, description, prompt, required = false }) {
  while (true) {
    stdout.write(`\n[${step}/3] ${title}\n${description}\n`);
    stdout.write("支持输入多行。完成后请另起一行输入 /done，再按 Enter。\n");
    const lines = [];
    while (true) {
      const line = await askLine(lines.length ? "继续 > " : `${prompt} > `);
      if (isBlockTerminator(line)) break;
      lines.push(line);
    }
    const value = lines.join("\n").trim();
    if (!required || value) return value;
    stdout.write("任务不能为空，请重新输入。\n");
  }
}

async function main() {
  if (!stdin.isTTY) throw new Error("Launcher requires an interactive Herdr popup");
  const workspaceId = process.env.AGENT_LOOP_WORKSPACE_ID || process.env.HERDR_WORKSPACE_ID;
  if (!workspaceId) throw new Error("Launcher must be opened from a Herdr workspace");
  const cwd = process.env.AGENT_LOOP_WORKSPACE_CWD;
  if (!cwd) throw new Error("Launcher did not receive the target workspace cwd");
  const profileConfig = await loadProfileConfig();

  stdout.write("Agent Loop 启动向导\n===================\n");
  stdout.write("接下来配置任务、验收要求和主编排器 Agent。\n");
  const profileNames = Object.keys(profileConfig.profiles);
  const rl = createInterface({ input: stdin, output: stdout });
  const askLine = createLinePrompter(rl);
  try {
    const task = await readBlock(askLine, {
      step: 1,
      title: "描述任务",
      description: "请输入希望主编排器规划并完成的工作。",
      prompt: "任务",
      required: true,
    });
    const acceptance = await readBlock(askLine, {
      step: 2,
      title: "补充验收要求（可选）",
      description: "请输入完成标准；如果没有额外要求，直接输入 /done。",
      prompt: "验收要求",
    });

    stdout.write("\n[3/3] 选择主编排器 Agent\n");
    stdout.write("Agent 类型决定使用 Claude Code、Codex、Pi 等；Profile 还可预设模型和启动参数。\n");
    if (profileNames.length) stdout.write(`可用 Profile：${profileNames.join(", ")}\n`);
    const defaultProfile = profileConfig.defaults.orchestrator || "";
    const kindInput = await askLine("Agent 类型覆盖（可选，如 claude、codex、pi；直接 Enter 使用 Profile）: ");
    const orchestratorKind = kindInput.trim() || undefined;
    let orchestratorProfile;
    if (!orchestratorKind) {
      const profileInput = await askLine(
        `Profile${defaultProfile ? `（直接 Enter 使用默认值 ${defaultProfile}）` : "（可选，直接 Enter 跳过）"}: `,
      );
      orchestratorProfile = profileInput.trim() || defaultProfile || undefined;
    }
    const argsInput = await askLine(
      "启动参数覆盖（可选 JSON 数组；直接 Enter 使用 Profile 参数，例如 [\"--model\",\"<model-id>\"]）: ",
    );
    const orchestratorArgs = argsInput.trim()
      ? parseArgvJson(argsInput.trim(), "Orchestrator launch args")
      : undefined;
    const launchChoice = orchestratorProfile
      ? `Profile ${orchestratorProfile}`
      : `Agent 类型 ${orchestratorKind || "codex（插件默认值）"}`;
    stdout.write(`\n正在使用 ${launchChoice} 启动主编排器…\n`);
    const run = await startRun({
      workspaceId,
      cwd,
      task,
      acceptance,
      orchestratorProfile,
      orchestratorKind,
      orchestratorArgs,
      profileConfig,
    });
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
