# Efficient Coding（高效编码）

[English](README.md) | 中文

## Worktree

通过 [Worktrunk](https://worktrunk.dev/) 管理 Worktree，可实现多特性并行开发，并复制包含依赖与未提交代码的“脏状态”。相关配置文件位于 [.config/wt.toml]。

目标:
- 创建新 worktree 时直接复制当前未提交状态，便于对比多种方案。

说明:
- `.config/wt.toml` 中的 `post-create` hook 会在 `wt switch --create` 创建新 worktree 后执行。
- 当 `base_worktree_path` 可用时，hook 运行 `scripts/wt-copy-from-base` 将基准 worktree 的工作区复制到新 worktree（排除 `.git`）。优先使用写时复制（macOS/APFS: `ditto --clones`；Linux: `cp --reflink=auto`），否则回退到 `rsync`。
- 建议使用 `--base=@`，让基准为当前 worktree，可稳定触发复制。
- 如果 `--base` 指向的分支没有对应 worktree，则不会复制。

用法:
- 基于当前状态创建新 worktree：`wt switch --create idea-a --base=@`
- 基于同一状态创建多个对比 worktree：`wt switch --create idea-b --base=@`
- 获取干净工作区（跳过复制）：`wt switch --create clean --base=@ --no-verify`

注意:
- `--no-verify` 会跳过所有 hooks。
- 至少需要以下其一：`ditto`（macOS）、支持 reflink 的 `cp`（部分 Linux 文件系统）、或 `rsync`。
- 不想复制依赖可在 `.config/wt.toml` 中设置 `WT_COPY_EXCLUDES`（例如 `WT_COPY_EXCLUDES="node_modules .cache" ...`）。

## MCP Servers

| 服务器 | 用途 | 传输 | 配置 | 来源 |
| --- | --- | --- | --- | --- |
| fetcher (fetcher-mcp) | 使用 Playwright 无头浏览器抓取网页内容。 | stdio | `bunx -y fetcher-mcp` | https://www.npmjs.com/package/fetcher-mcp |
