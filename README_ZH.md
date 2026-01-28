# Efficient Coding（高效编码）

[English](README.md) | 中文

这个仓库包含：
- 可选的 MCP Server 配置。
- 可复用的 agent skills/playbooks（用 `bunx skills add` 安装）。

## MCP Servers

| 服务器 | 用途 | 传输 | 命令 | 来源 |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | 使用 Playwright 无头浏览器抓取网页内容。 | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |

使用 MCP Server 时，把它添加到你所用 coding agent 的 MCP 配置里即可。更通用的示例配置见 `.mcp.json`。

## Skills

Skills 是可复用的“能力/流程/方法论”，用来指导如何推进任务（例如拆解需求、写计划、系统化调试、TDD）。

| Skill | 类型 | 适用场景 |
| --- | --- | --- |
| [`brainstorming`](skills/brainstorming/SKILL.md) | 流程 | 新功能/需求不清：先把目标、约束、方案与验收口径问清楚。 |
| [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | 流程 | 修 bug / 测试不稳定 / 行为异常：先定位根因并稳定复现，再谈修复。 |
| [`writing-plans`](skills/writing-plans/SKILL.md) | 流程 | 方案基本定了：把工作拆成可执行步骤与验证口径。 |
| [`executing-plans`](skills/executing-plans/SKILL.md) | 推进 | 按计划分批执行，每批有检查点与复核。 |
| [`subagent-driven-development`](skills/subagent-driven-development/SKILL.md) | 推进 | 在当前会话逐任务派发子代理，并做“spec 合规 → 代码质量”两阶段 review。 |
| [`test-driven-development`](skills/test-driven-development/SKILL.md) | 实现 | 编码阶段：Red → Green → Refactor（没有失败测试不写生产代码）。 |
| [`worktree-manager`](skills/worktree-manager/SKILL.md) | 流程 | 基于 Worktrunk（`wt`）的 worktree 管理：switch/create/list/merge/remove + 安全护栏。 |

### 安装

- `bunx skills add http://github.com/jtsang4/efficient-coding --skill brainstorming`
- 模板：`bunx skills add http://github.com/jtsang4/efficient-coding --skill <skill>`

### 使用

- 想强制触发某个 skill：在指令里直接点名（点名优先）。
- 同时命中多个 skills：默认“流程优先”——先决定怎么做，再进入实现：`brainstorming`/`systematic-debugging` → `writing-plans` →（`executing-plans` 或 `subagent-driven-development`）→ 每个任务内部用 `test-driven-development`。
- 修 bug：先 `systematic-debugging`，补上失败用例，再用 `test-driven-development` 做最小修复。

<details>
<summary>Skill 来源（可选展开）</summary>

下表列出了从外部仓库安装/更新的 skills 的来源仓库；“备注”列用于简要说明本仓库对这些 skills 的本地定制（如有）。

安装/更新模板：`bunx skills add <source_repo> --skill <skill>`（例如：`bunx skills add http://github.com/jtsang4/efficient-coding --skill brainstorming`）

| Skill | 来源仓库 | 备注 |
| --- | --- | --- |
| `brainstorming` | [`obra/superpowers`](https://github.com/obra/superpowers) | worktree 操作统一委托给 `worktree-manager`（复制当前 working state）。 |
| `systematic-debugging` | [`obra/superpowers`](https://github.com/obra/superpowers) | 需要 dedicated worktree 隔离复现时，用 `worktree-manager`。 |
| `writing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) | worktree 操作统一委托给 `worktree-manager`（复制当前 working state）。 |
| `executing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `subagent-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `test-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |

</details>

## Config

推荐配置：

| 配置项 | 文件 | 作用 | 备注 |
| --- | --- | --- | --- |
| Worktrunk “copy from base” hook | `.config/wt.toml`、`scripts/wt-copy-from-base` | Worktrunk 创建新 worktree 时，将 base worktree 的当前工作空间状态复制到新 worktree（而不是得到一个完全干净的 worktree）。 | 方便把 git ignore 的文件（如项目依赖、`.env`、缓存等）快速带到新 worktree 中，提升开发效率。建议搭配 `worktree-manager` skill 使用。 |

## License

MIT 协议，详见 [`LICENSE`](LICENSE)。
