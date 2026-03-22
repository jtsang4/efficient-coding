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
| [`codex-skill-creator`](skills/codex-skill-creator/SKILL.md) | 元技能 | 创建、改进、评测、人工评审并打包 Codex skills，包含成对 eval 运行和 `eval-viewer/generate_review.py` 审阅流程。 |
| [`cubox-research`](skills/cubox-research/SKILL.md) | 研究 | 以用户的 Cubox 收藏为事实来源做主题研究：主动扩展关键词、抓取最相关文章详情，并基于导出的 Markdown 做本地分析。需要 Bun 和已配置的 `.env`。 |
| [`harness`](skills/harness/SKILL.md) | 流程 | 通过 Harness Engineering 将任意代码项目转化为适配 AI Agent 协作的形态。扫描代码库、提取工程知识、生成结构化上下文文档。 |
| [`dev-browser`](skills/dev-browser/SKILL.md) | 自动化 | 浏览器/Web 自动化：页面导航、点击/填表、截图、抓取数据，或测试登录态流程。 |
| [`exa-web-search`](skills/exa-web-search/SKILL.md) | 研究 | 通过 Exa MCP 免费做 Web/代码/公司信息检索（无需 API key），适合查最新信息与代码示例。 |
| [`readwise-research`](skills/readwise-research/SKILL.md) | 研究 | 基于用户的 Readwise/Reader 文档与 highlights 生成主题 memo，并在任何写操作前先给出 shortlist/tag/archive 建议。 |
| [`see`](skills/see/SKILL.md) | 集成 | 对接 S.EE 平台 API，处理短链、文本分享与文件分享。 |
| [`shape`](skills/shape/SKILL.md) | 产品 | 在编码前把模糊想法梳理为清晰的产品决策与 SPEC 文档。 |
| [`impeccable`（外部收藏）](https://github.com/pbakaus/impeccable) | 参考（外部） | 面向前端设计的外部参考（包含 `frontend-design` skill、17 个设计指令与反模式清单），适合做审查、润色、动效、配色与响应式细化；仅作收藏链接（本仓库未内置）。 |
| [`ui-ux-pro-max-skill`（外部收藏）](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 参考（外部） | UI/UX 相关提示词与流程参考；仅作为收藏链接（本仓库未内置）。 |
| [`systematic-debugging`](skills/systematic-debugging/SKILL.md) | 流程 | 修 bug / 测试不稳定 / 行为异常：先定位根因并稳定复现，再谈修复。 |
| [`writing-plans`](skills/writing-plans/SKILL.md) | 流程 | 方案基本定了：把工作拆成可执行步骤与验证口径。 |
| [`executing-plans`](skills/executing-plans/SKILL.md) | 推进 | 按计划分批执行，每批有检查点与复核。 |
| [`subagent-driven-development`](skills/subagent-driven-development/SKILL.md) | 推进 | 在当前会话逐任务派发子代理，并做“spec 合规 → 代码质量”两阶段 review。 |
| [`test-driven-development`](skills/test-driven-development/SKILL.md) | 实现 | 编码阶段：Red → Green → Refactor（没有失败测试不写生产代码）。 |
| [`worktree-manager`](skills/worktree-manager/SKILL.md) | 流程 | 基于 Worktrunk（`wt`）的 worktree 管理：switch/create/list/merge/remove + 安全护栏。 |

### 安装

- `bunx skills add http://github.com/jtsang4/efficient-coding --skill brainstorming`
- `bunx skills add http://github.com/jtsang4/efficient-coding --skill codex-skill-creator`
- 模板：`bunx skills add http://github.com/jtsang4/efficient-coding --skill <skill>`

### 使用

- 想强制触发某个 skill：在指令里直接点名（点名优先）。
- 如果你是在创建新 skill、修改已有 skill、优化 description 触发效果，或者给 skill 跑一轮可人工审阅的 eval，优先使用 `codex-skill-creator`。
- 同时命中多个 skills：默认“流程优先”——先决定怎么做，再进入实现：`brainstorming`/`systematic-debugging` → `writing-plans` →（`executing-plans` 或 `subagent-driven-development`）→ 每个任务内部用 `test-driven-development`。
- 修 bug：先 `systematic-debugging`，补上失败用例，再用 `test-driven-development` 做最小修复。
- 浏览器交互类任务（导航/点击/填表/截图/抓取）优先使用 `dev-browser`。
- 只要问题应该从用户的 Cubox 收藏里找答案，优先使用 `cubox-research`；它会有意识地扩展关键词、抓取最相关文章详情，并在用户明确要求前保持只读。
- Web/代码/公司信息检索类任务优先使用 `exa-web-search`。
- 只要问题是在问“我在 Readwise/Reader 里已经读过、存过、标注过什么”，优先使用 `readwise-research`；它会把 Readwise 库当作事实来源，并在用户明确确认前保持只读。
- 前端视觉设计 / UI 润色 / 设计审查 / 动效与响应式细化时，可把 [`impeccable`](https://github.com/pbakaus/impeccable) 作为外部设计参考一起使用。

<details>
<summary>Skill 来源（可选展开）</summary>

下表列出了从外部仓库安装/更新的 skills 的来源仓库；“备注”列用于简要说明本仓库对这些 skills 的本地定制（如有）。

| Skill | 来源仓库 | 备注 |
| --- | --- | --- |
| `brainstorming` | [`obra/superpowers`](https://github.com/obra/superpowers) | worktree 操作统一委托给 `worktree-manager`（复制当前 working state）。 |
| `systematic-debugging` | [`obra/superpowers`](https://github.com/obra/superpowers) | 需要 dedicated worktree 隔离复现时，用 `worktree-manager`。 |
| `writing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) | worktree 操作统一委托给 `worktree-manager`（复制当前 working state）。 |
| `executing-plans` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `subagent-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |
| `test-driven-development` | [`obra/superpowers`](https://github.com/obra/superpowers) |  |

</details>

## 规范（Specs）

这里记录本仓库推荐采用的工程规范。表格刻意保持扁平，后续如果要增加新的 spec，直接追加一行即可，不需要调整章节结构。

| 类别 | 适用范围 | 推荐方案 | 简要说明 | 参考 |
| --- | --- | --- | --- | --- |
| 项目结构 | Go 服务 / 应用 | [`golang-standards/project-layout`](https://github.com/golang-standards/project-layout) | 适合作为中大型 Go 项目的默认结构参考，常见目录包括 `cmd`、`internal`、`pkg`。如果项目很小，保持简单通常比强行套结构更重要。 | <https://github.com/golang-standards/project-layout> |
| 项目结构 | 前端应用 | [Feature-Sliced Design (FSD)](https://fsd.how/docs/get-started/overview/) | 通过分层 + 按业务切片组织代码（如 `app`、`pages`、`features`、`entities`、`shared`），让前端代码更容易扩展和协作。 | <https://fsd.how/docs/get-started/overview/> |
| Lint | 前端 / JS / TS | [Biome](https://biomejs.dev/linter/) | 统一 formatter + linter 的前端工具链，性能快、默认配置也比较稳；建议先采用推荐规则，再按团队约定逐步加严。 | <https://biomejs.dev/linter/> |
| i18n | React / 前端 | [`react-i18next`](https://github.com/i18next/react-i18next) | React 生态里很常用的国际化方案，基于 `i18next`，支持 hooks / 组件、命名空间、插值和复数规则。 | <https://github.com/i18next/react-i18next> |
| i18n | Go 服务 / 应用 | [`go-i18n`](https://github.com/nicksnyder/go-i18n) | 通过 bundle + locale 文件管理 Go 项目的多语言文案，支持复数规则、模板变量，以及 CLI 的 extract / merge 工作流。 | <https://github.com/nicksnyder/go-i18n> |

## Scripts

| 脚本 | 说明 | 用法 |
| --- | --- | --- |
| [`install-autojump-rs.sh`](scripts/install-autojump-rs.sh) | 一键安装 `autojump-rs`，支持 macOS/Linux，并处理 `bash`/`zsh`/`fish` 的集成与卸载。 | `bash scripts/install-autojump-rs.sh` 或 `bash scripts/install-autojump-rs.sh --uninstall` |

## Config

推荐配置：

| 配置项 | 文件 | 作用 | 备注 |
| --- | --- | --- | --- |
| Worktrunk “copy from base” hook | `.config/wt.toml`、`scripts/wt-copy-from-base` | Worktrunk 创建新 worktree 时，将 base worktree 的当前工作空间状态复制到新 worktree（而不是得到一个完全干净的 worktree）。 | 方便把 git ignore 的文件（如项目依赖、`.env`、缓存等）快速带到新 worktree 中，提升开发效率。建议搭配 `worktree-manager` skill 使用。 |

## License

MIT 协议，详见 [`LICENSE`](LICENSE)。
