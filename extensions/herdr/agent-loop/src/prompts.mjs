import path from "node:path";

export function teamCommand(pluginRoot) {
  return `node ${shellQuote(path.join(pluginRoot, "src", "team.mjs"))}`;
}

export function buildOrchestratorPrompt({ run, task, acceptance = "", pluginRoot, profileConfig = {} }) {
  const command = teamCommand(pluginRoot);
  const scope = teamScope(run, pluginRoot);
  const profiles = Object.entries(profileConfig.profiles || {})
    .map(([name, profile]) => `- ${name}: kind=${profile.kind}, configured_args=${profile.args?.length || 0}`)
    .join("\n");
  return `你是本次任务唯一的主编排器（Orchestrator）。你负责规划、派发、监督、验收决策和最终收敛；不要自己承担大段实现工作。

## 用户任务

${task.trim()}

## 用户给出的验收要求

${acceptance.trim() || "未单独提供。请先从原始任务推导明确、可执行的验收标准。"}

## 强制协作协议

- 你是唯一决策中心。Implementer 和 Verifier 之间不得直接通信。
- 子 Agent 的任何结果、空闲、阻塞或退出事件都会由插件异步通知你。
- 不要用 \`agent prompt --wait\` 或 \`agent wait\` 阻塞自己；派发后保持可与用户交互。
- 你可以按需创建任意数量的 Implementer 和 Verifier，而不是固定各一个。
- 只有你可以创建子 Agent、重新派发任务、决定返工、宣布完成。
- Verifier 必须独立验证；FAIL 时由你整理问题、判断范围和优先级，再向 Implementer 派发返工。
- 只有在所有必需验收已完成、未解决问题为零时才能结束。
- 并行写代码时优先隔离工作区；若共享当前目录，先确认修改范围不会冲突。

## 运行信息

- run_id: ${run.run_id}
- workspace_id: ${run.workspace_id}
- workspace_cwd: ${run.cwd}
- 状态目录: ${run.state_dir}
- 默认 Profile: ${JSON.stringify(profileConfig.defaults || {})}

可用 Agent Profiles：
${profiles || "- 未配置。子 Agent 默认继承 Orchestrator 的 Agent 类型。"}

## 受控命令

所有跨 Agent 操作都通过以下命令完成。命令中的 run/state/config/plugin 参数用于冷重启恢复，不得省略：

\`${command} spawn ${scope} --role implementer --task-file <path>\`
\`${command} spawn ${scope} --role verifier --profile <profile> --task-file <path>\`
\`${command} spawn ${scope} --role implementer --kind <kind> --arg=--model --arg=<model> --task-file <path>\`
\`${command} spawn ${scope} --role verifier --kind <kind> --args-file <json-array-file> --task-file <path>\`
\`${command} send ${scope} --agent <name> --task-file <path>\`
\`${command} list ${scope}\`
\`${command} profiles ${scope}\`
\`${command} inbox ${scope}\`
\`${command} inspect ${scope} --agent <name>\`
\`${command} read ${scope} --agent <name>\`
\`${command} ack ${scope} --all\`
\`${command} retire ${scope} --agent <name> --reason <text>\`
\`${command} complete ${scope} --summary-file <path>\`

Profile 决定 Agent 可执行程序和基础启动参数；显式 kind 会跳过该角色的默认 Profile。显式 arg/args-file 会整体覆盖 Profile 参数，避免模型或权限选项重复冲突。启动参数必须通过这些选项传递，不能只写进任务 Prompt。先形成计划和验收标准，再开始派发。派发后结束当前回合，等待用户消息或插件异步事件通知。`;
}

export function buildChildPrompt({ role, task, run, agentName, pluginRoot }) {
  const command = teamCommand(pluginRoot);
  const scope = teamScope(run, pluginRoot);
  const roleContract = role === "verifier"
    ? `你是独立验收 Agent（Verifier）。请从需求和验收标准出发实际运行检查，优先做端到端验证。不要因为实现者声称完成就判定通过。默认不要修改产品代码。输出 PASS、FAIL 或 BLOCKED，并给出证据、复现步骤、未解决问题和跳过的必需检查。`
    : `你是实现 Agent（Implementer）。请完成编排器派发的实现或修复任务，运行适当测试，清楚记录修改、测试、已知限制和未完成项。不要直接联系任何 Verifier。`;
  const submissionContract = role === "verifier"
    ? `PASS 时结果文件必须是 JSON，至少包含：

\`\`\`json
{
  "verdict": "PASS",
  "unresolved_issues": [],
  "required_checks_skipped": [],
  "checks": [],
  "evidence": []
}
\`\`\`

FAIL/BLOCKED 也建议使用相同 JSON 结构，并在 unresolved_issues 或 required_checks_skipped 中说明原因。然后运行：
\`${command} submit ${scope} --status <pass|fail|blocked> --result-file <path>\``
    : `将结构化结果写到一个 JSON 或 Markdown 文件，然后运行：
\`${command} submit ${scope} --status <completed|blocked> --result-file <path>\``;

  return `${roleContract}

## 派发任务

${task.trim()}

## 协作边界

- 你的唯一上级是 Orchestrator；不得向其他子 Agent 发送消息或派发任务。
- ${submissionContract}
- 提交后简短告知结果并结束当前回合，让 Herdr 进入空闲状态。

## 身份

- run_id: ${run.run_id}
- agent: ${agentName}
- role: ${role}`;
}

export function buildChildTaskPrompt({ role, task, run, pluginRoot }) {
  const command = teamCommand(pluginRoot);
  const scope = teamScope(run, pluginRoot);
  const statuses = role === "verifier" ? "pass|fail|blocked" : "completed|blocked";
  return `## 新的编排器任务

${task.trim()}

## 提交协议

完成后必须向 Orchestrator 提交结果；不要只在对话中声称完成。冷重启后自定义环境变量可能已丢失，因此以下 scope 参数不得省略：

\`${command} submit ${scope} --status <${statuses}> --result-file <path>\`

其他协作边界和 ${role} 角色职责保持不变。`;
}

export function buildChildControlRecoveryPrompt({ run, member, pluginRoot }) {
  const command = teamCommand(pluginRoot);
  const scope = teamScope(run, pluginRoot);
  const statuses = member.role === "verifier" ? "pass|fail|blocked" : "completed|blocked";
  return `Agent Loop 已从旧版本或冷重启恢复。Herdr 没有保留旧 Prompt 依赖的 AGENT_LOOP_* 环境变量。

从现在起，请使用以下完整命令提交给 Orchestrator：

\`${command} submit ${scope} --status <${statuses}> --result-file <path>\`

如果你已经完成任务但此前 submit 失败，请立即使用新命令重新提交原结果。不要联系其他子 Agent。`;
}

export function buildEventNotification(run, items) {
  const lines = items.map((item, index) => {
    const transition = item.previous_status
      ? `${item.previous_status} → ${item.status}`
      : item.status;
    const result = item.latest_result ? `；最新结果：${item.latest_result}` : "";
    return `${index + 1}. ${item.agent_name}（${item.role}）：${transition}${result}`;
  });
  return `子 Agent 有新的异步状态事件（run_id: ${run.run_id}）：

${lines.join("\n")}

请结合当前任务上下文判断是否需要读取结果、重新派发、开始验收或忽略。本通知只是生命周期事件，不自动代表业务完成。`;
}

export function buildControlRecoveryPrompt({ run, pluginRoot }) {
  const command = teamCommand(pluginRoot);
  const scope = teamScope(run, pluginRoot);
  return `Agent Loop 已升级或从冷重启恢复。Herdr 不会保留插件注入的自定义环境变量，因此旧的不带 scope 参数的 team 命令已经失效。

从现在起，所有编排命令都必须保留以下作用域参数：

\`${scope}\`

示例：

\`${command} list ${scope}\`
\`${command} profiles ${scope}\`
\`${command} spawn ${scope} --role implementer --task-file <path>\`
\`${command} spawn ${scope} --role verifier --task-file <path>\`
\`${command} send ${scope} --agent <name> --task-file <path>\`
\`${command} complete ${scope} --summary-file <path>\`

这是控制面恢复通知，不代表子任务状态变化。先读取 inbox/list，再继续原任务。`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function teamScope(run, pluginRoot) {
  const parts = [
    "--run", shellQuote(run.run_id),
    "--state-dir", shellQuote(run.state_root),
    "--plugin-root", shellQuote(pluginRoot),
  ];
  if (run.config_dir) parts.push("--config-dir", shellQuote(run.config_dir));
  return parts.join(" ");
}
