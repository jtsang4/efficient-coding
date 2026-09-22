# 使用 Agent 完整卸载插件

把下面的 Prompt 发送给能够操作本机终端和文件的 Coding Agent。它会卸载 Agent Loop 插件，并清理插件专属 Profile、运行状态和快捷键；发现仍在运行的 Agent Loop 时会先停止，避免遗留失去管理的 Agent。

```text
请直接帮我完整卸载 Herdr 的 Agent Loop 插件，不要只给操作说明。

插件 ID：efficient-coding.agent-loop
GitHub 安装源：jtsang4/efficient-coding/extensions/herdr/agent-loop

清理范围：
- Herdr 中的插件注册和 Herdr 托管的插件 checkout。
- 插件配置目录，包括 profiles.json 等全局 Profile 配置。
- 插件状态目录，包括 runs、inbox、results 和运行历史。
- Herdr config.toml 中所有 command 以 efficient-coding.agent-loop. 开头的 plugin_action 快捷键，包括 start、abandon、focus 和 status。

请按以下要求执行：

1. 确认 Herdr 的实际版本、配置文件路径和当前连接的 session。列出 efficient-coding.agent-loop 的安装信息；如果插件已经不在注册表中，也继续检查并清理它遗留的配置、状态和快捷键。
2. 在卸载前记录：
   - herdr plugin config-dir efficient-coding.agent-loop 返回的精确配置目录。
   - 插件安装信息中的 plugin_root、source.kind 和 managed_path。
   - 插件状态目录。按当前平台和 Herdr 0.9.1 的规则解析并核实，不要猜测其他目录：
     - macOS/Linux：设置了 XDG_STATE_HOME 时使用 $XDG_STATE_HOME/herdr/plugins/efficient-coding.agent-loop，否则使用 ~/.local/state/herdr/plugins/efficient-coding.agent-loop。
     - Windows：优先使用 %LOCALAPPDATA%\herdr\plugins\efficient-coding.agent-loop；没有 LOCALAPPDATA 时使用 %USERPROFILE%\AppData\Local\herdr\plugins\efficient-coding.agent-loop；只有前两者均不可用时才根据 Herdr 实际环境继续解析，并在删除前报告路径。
3. 检查状态目录中所有 runs/*/run.json，并核对其中记录的 session_key、agent_name 和 pane_id 是否仍对应当前存活的 Herdr Agent。不要仅凭可能复用的 pane_id 关闭 Pane。
   - 若存在 status 为 starting、active、paused 或 blocked 的运行，列出 run_id、workspace_id、Orchestrator 和子 Agent；先在对应 Workspace 调用 efficient-coding.agent-loop.abandon，再关闭经身份核实的 Orchestrator、Implementer 和 Verifier Pane/Tab。
   - 即使运行已经 failed 或 completed，也要检查是否仍有插件创建的 Agent Pane 存活，并关闭经 agent_name、pane_id 和 session_key 共同核实的 Pane；abandon 本身不会自动关闭它们。
   - 无法安全进入对应 session、调用 Workspace 动作或确认 Pane 归属时，暂停卸载并告诉我需要在哪里操作；不要直接删除仍在使用的状态目录，也不要强杀不确定归属的进程。
4. 找到 Herdr 实际使用的 config.toml，为它创建带时间戳的备份。以 TOML 表为单位，删除所有同时满足以下条件的完整 [[keys.command]] 表：
   - type = "plugin_action"
   - command 以 "efficient-coding.agent-loop." 开头
   保留全部无关配置和快捷键，不要只删除单独一行而留下损坏的 TOML。
5. 运行 herdr config check。若失败，立即恢复 config.toml 备份并停止，不要继续卸载。
6. 执行 herdr plugin uninstall efficient-coding.agent-loop。若它报告插件未安装，可以继续清理已确认的遗留目录，但要在最终结果中说明。
7. 只处理第 2 步解析并核实过的插件专属目录：
   - 配置目录的最后一个路径组件必须是 efficient-coding.agent-loop，并且必须位于 Herdr 的 plugins/config 目录下。
   - 状态目录的最后一个路径组件必须是 efficient-coding.agent-loop，并且必须位于 Herdr 的 plugins 状态目录下。
   - 优先把这两个目录移动到系统废纸篓或带时间戳的隔离目录，使操作可恢复；不要对 HOME、~、Herdr 根目录、plugins 根目录或任何通配符执行递归删除。
   - 如果插件来自 local link，不要删除它指向的源码仓库；如果来自 GitHub managed install，托管 checkout 应由 herdr plugin uninstall 删除。
8. 运行 herdr server reload-config，让当前 Herdr 进程移除相关快捷键，不要为了卸载而重启或停止整个 Herdr server。
9. 完成以下验证：
   - herdr plugin list --plugin efficient-coding.agent-loop --json 不再返回该插件。
   - herdr plugin action list --plugin efficient-coding.agent-loop 不再返回任何动作。
   - 当前 config.toml 中不再包含 efficient-coding.agent-loop。
   - 插件配置目录和状态目录已不在原位置。
   - herdr config check 仍然通过。
10. 最后报告：是否发现并停止活跃运行、移除的快捷键、插件卸载结果、配置与状态目录的处理位置、config.toml 备份路径、验证和热重载结果。不要删除 config.toml 的备份，除非我另行明确要求。

整个过程中只处理 efficient-coding.agent-loop，保留所有其他插件、Profile、快捷键、Pane、项目源码和 Herdr 配置。
```

Herdr 的 `plugin uninstall` 会注销插件并删除 GitHub 托管的 checkout，但不会自动清理插件配置目录、状态目录或 `config.toml` 中的自定义快捷键，也不应被当作关闭仍在运行的 Agent 的替代操作。
