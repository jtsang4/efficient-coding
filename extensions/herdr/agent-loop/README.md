# Agent Loop for Herdr

一个由单一 Orchestrator 统筹、支持动态数量 Implementer 与 Verifier 的 Herdr 插件。子 Agent 之间不横向通信；所有开发结果、验收结果和生命周期事件都返回 Orchestrator，由它决定继续开发、重新验收、扩展并行 Agent，或结束任务。

## 运行模型

```text
用户 ───────────────→ Orchestrator
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       N × Implementer        M × Verifier
              │                     │
              └──────→ Inbox ←──────┘
                         │
                         └──异步通知 Orchestrator
```

- Orchestrator 是唯一决策中心，也是唯一有权创建和派发子 Agent 的角色。
- Implementer 与 Verifier 只能向 Orchestrator 提交结果，不能直接通信。
- 插件监听 `pane.agent_status_changed` 与 `pane.exited`。子 Agent 进入 `idle`、`done`、`blocked`、`unknown` 或退出时，事件先持久化，再在 Orchestrator 可用时通过非阻塞 Prompt 批量通知。
- `idle` 只是生命周期信号，不自动代表业务完成；Orchestrator 结合结果文件和当前上下文判断。
- Agent 数量不固定。Orchestrator 可以随时创建新的实现器或验证器。

## 要求

- Herdr 0.9.1 或更高版本。
- Node.js 20 或更高版本。
- 至少一种 Herdr 支持的 Agent CLI，例如 Codex 或 Claude Code。
- 建议安装对应的 Herdr integration，以增强会话恢复能力。

## 安装

从 GitHub 子目录安装：

```bash
herdr plugin install jtsang4/efficient-coding/extensions/herdr/agent-loop
```

本地开发时链接：

```bash
herdr plugin link /absolute/path/to/efficient-coding/extensions/herdr/agent-loop
```

## 使用

1. 在 Herdr 中打开目标项目 Workspace。
2. 调用插件动作 `Agent Loop: Start`。
3. 在 Popup 中输入任务、验收要求和 Orchestrator Agent 类型；每个多行输入以单独一行 `.` 结束。
4. 插件在当前 Workspace 创建 Orchestrator Tab，并立即将任务交给它。
5. Orchestrator 根据任务动态创建 Implementer 和 Verifier，采用非阻塞方式派发。
6. 子 Agent 停下来后，插件将事件写入 Inbox，并在 Orchestrator 空闲时通知它。
7. Verifier 报告问题时，Orchestrator 整理问题并向合适的 Implementer 派发返工；随后再次组织验证。
8. 当必需验收全部通过且没有未解决问题时，Orchestrator 生成最终报告并结束运行。

如果调用动作时 Herdr 上下文中已有选中文本，插件会将选中文本直接作为任务并跳过 Popup。

可选快捷键：

```toml
[[keys.command]]
key = "prefix+a"
type = "plugin_action"
command = "efficient-coding.agent-loop.start"
description = "start agent loop"
```

其他动作：

- `Agent Loop: Focus orchestrator`：跳转到当前运行的 Orchestrator。
- `Agent Loop: Show status`：打开 Popup，显示当前子 Agent 与未确认事件。
- `Agent Loop: Abandon active run`：当 Orchestrator 无法恢复时，将当前运行标记为失败并释放 Workspace；不会删除代码、状态文件或 Tab。

## Orchestrator 命令

插件在 Orchestrator 初始 Prompt 中注入实际命令路径。主要命令包括：

```bash
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" spawn --role implementer --task-file /tmp/task.md
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" spawn --role verifier --task-file /tmp/verify.md
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" send --agent implementer-xxx-1 --task-file /tmp/rework.md
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" list
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" inbox
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" inspect --agent implementer-xxx-1
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" read --agent implementer-xxx-1
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" ack --all
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" retire --agent verifier-xxx-1 --reason "replaced after environment failure"
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" complete --summary-file /tmp/final.md
```

子 Agent 使用：

```bash
node "$AGENT_LOOP_PLUGIN_ROOT/src/team.mjs" submit \
  --status completed \
  --result-file /tmp/result.json
```

Verifier 报告 `pass` 时，结果文件必须是 JSON，并至少包含：

```json
{
  "verdict": "PASS",
  "unresolved_issues": [],
  "required_checks_skipped": [],
  "checks": [],
  "evidence": []
}
```

`complete` 有硬门禁：至少存在一个仍属必需的 Verifier；所有必需 Verifier 的最新结构化结果均为 PASS、没有未解决问题或跳过的必需检查；所有必需子 Agent 已稳定；PASS 不得早于最后一次实现活动。遇到已退出、被替代或不再相关的子 Agent，Orchestrator 可以先用 `retire` 将其移出门禁，但会保留完整历史记录和原因。

插件会验证调用 Pane：只有 Orchestrator Pane 能创建、派发和结束运行，只有已注册的子 Agent Pane 能提交结果。

## 状态与恢复

运行状态保存在 Herdr 提供的 `HERDR_PLUGIN_STATE_DIR`：

```text
runs/<run-id>/
├── run.json
├── inbox/
├── results/
└── final-report.md
```

事件处理程序是短命的一次性进程，不会阻塞 Herdr。并发事件通过目录锁和原子写入串行化。通知失败或 Orchestrator 正在工作时，事件保留在 Inbox；Orchestrator 下次进入 `idle`/`done` 时再次尝试投递。

每个运行还记录 `HERDR_SOCKET_PATH` 作为 Herdr session identity。即使多个 named session 都出现 `w1:p1` 之类的重复 Pane ID，事件也只会路由到同一 session 中的 Orchestrator。

插件还声明了一个一次性的 startup hook。Herdr 服务恢复后，它会重新查询活跃运行中的子 Agent，将断线期间可能遗漏的稳定状态补写到 Inbox，再尝试通知 Orchestrator；它不是常驻守护进程。

若启动过程在创建 Orchestrator 前中断，startup hook 会把残留的 `starting` 运行标记为失败。若恢复时暂时找不到 Orchestrator，则运行进入 `blocked`；Agent 稍后重新出现会自动恢复为 `active`。无法恢复时可使用 `Agent Loop: Abandon active run` 释放当前 Workspace。

## 已知边界

- Herdr 没有独立于 Agent 输入框的消息邮箱。插件只在 Orchestrator 为 `idle`/`done` 时注入通知，但用户直接在原始 Agent 输入框打字时仍存在很小的竞争窗口。需要完全串行化时，应通过插件入口向 Orchestrator 提交用户消息。
- 多个 Implementer 共享同一工作目录时可能产生文件冲突。真正的并行写入应使用独立 Git worktree；本插件当前负责 Agent 编排，不自动合并分支。
- Herdr 的 Agent 状态是终端生命周期信息，不是业务完成证明。最终结论必须以 Verifier 证据和 Orchestrator 判断为准。

## 开发验证

```bash
npm run check
npm test
```
