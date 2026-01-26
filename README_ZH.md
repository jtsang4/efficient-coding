# Efficient Coding（高效编码）

[English](README.md) | 中文

## Worktree

通过 [Worktrunk](https://worktrunk.dev/) 管理 Worktree，可实现多特性并行开发，并复制包含依赖与未提交代码的“脏状态”。相关配置文件位于 [.config/wt.toml]。

目标:
- 创建新 worktree 时直接复制当前未提交状态，便于对比多种方案。

说明:
- `.config/wt.toml` 中的 `post-create` hook 会在 `wt switch --create` 创建新 worktree 后执行。
- 当 `base_worktree_path` 可用时，hook 运行 `scripts/wt-copy-from-base` 将基准 worktree 的工作区复制到新 worktree（排除 `.git`）。优先使用写时复制（可用时），否则回退到 `rsync`。
- 建议使用 `--base=@`，让基准为当前 worktree，可稳定触发复制。
- 如果 `--base` 指向的分支没有对应 worktree，则不会复制。

用法:
- 基于当前状态创建新 worktree：`wt switch --create idea-a --base=@`
- 基于同一状态创建多个对比 worktree：`wt switch --create idea-b --base=@`
- 获取干净工作区（跳过复制）：`wt switch --create clean --base=@ --no-verify`

注意:
- `--no-verify` 会跳过所有 hooks。
- 至少需要以下其一：macOS 的 `cp`/`ditto`、支持 reflink 的 GNU `cp`（部分 Linux 文件系统）、或 `rsync`。
- 不想复制依赖可在 `.config/wt.toml` 中设置 `WT_COPY_EXCLUDES`（例如 `WT_COPY_EXCLUDES="node_modules .cache" ...`）。

## MCP Servers

| 服务器 | 用途 | 传输 | 配置 | 来源 |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | 使用 Playwright 无头浏览器抓取网页内容。 | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |

## Skills

Skills 是可复用的“能力/流程/方法论”，用来指导如何推进任务（例如拆解需求、写计划、系统化调试、TDD）。

| Skill | 类型 | 适用场景 |
| --- | --- | --- |
| [`brainstorming`](.codex/skills/brainstorming/SKILL.md) | 流程 | 新功能/需求不清：先把目标、约束、方案与验收口径问清楚。 |
| [`systematic-debugging`](.codex/skills/systematic-debugging/SKILL.md) | 流程 | 修 bug / 测试不稳定 / 行为异常：先定位根因并稳定复现，再谈修复。 |
| [`writing-plans`](.codex/skills/writing-plans/SKILL.md) | 流程 | 方案基本定了：把工作拆成可执行步骤与验证口径。 |
| [`executing-plans`](.codex/skills/executing-plans/SKILL.md) | 推进 | 按计划分批执行，每批有检查点与复核。 |
| [`subagent-driven-development`](.codex/skills/subagent-driven-development/SKILL.md) | 推进 | 在当前会话逐任务派发子代理，并做“spec 合规 → 代码质量”两阶段 review。 |
| [`test-driven-development`](.codex/skills/test-driven-development/SKILL.md) | 实现 | 编码阶段：Red → Green → Refactor（没有失败测试不写生产代码）。 |

### 怎么用

- 想强制触发某个 skill：在指令里直接点名（点名优先）。
- 能力/工具类 skills：按需在对应任务里直接使用；如果不确定先用流程型 skill 把边界与验收口径讲清楚。
- 同时命中多个 skills：默认“流程优先”——先决定怎么做，再进入实现：`brainstorming`/`systematic-debugging` → `writing-plans` →（`executing-plans` 或 `subagent-driven-development`）→ 每个任务内部用 `test-driven-development`。
- 典型选择：需求不清用 `brainstorming`；任务大/要 checkpoint 用 `executing-plans`；任务相对独立想并行推进用 `subagent-driven-development`。
- 当你想“先随便写一点/这太简单不用流程”时，反而是触发流程型 skill 的信号（用来防止跳步）。
- 修 bug：先 `systematic-debugging`，补上失败用例，再用 `test-driven-development` 做最小修复。
