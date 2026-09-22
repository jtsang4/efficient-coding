# 使用 Agent 配置启动与停止快捷键

把下面的 Prompt 发送给能够操作本机终端和文件的 Coding Agent。它会为 `Agent Loop: Start` 和 `Agent Loop: Abandon active run` 选择未占用的快捷键、备份 Herdr 配置、完成修改并热重载，不需要重启 Herdr。

```text
请直接帮我为 Herdr 的 Agent Loop 插件配置启动和停止编排快捷键，不要只给操作说明。

目标插件动作：
- 启动：efficient-coding.agent-loop.start
- 停止编排：efficient-coding.agent-loop.abandon

Herdr 配置文件：~/.config/herdr/config.toml
首选快捷键：
- 启动：prefix+a
- 停止编排：prefix+shift+a

备用快捷键：prefix+alt+a、prefix+alt+shift+a

请按以下要求执行：

1. 先确认 Herdr 已安装，并确认插件 efficient-coding.agent-loop 以及 start、abandon 两个动作都存在；如果不存在，停止修改并报告原因。
2. 查看当前配置和 Herdr 的默认快捷键。如果某个目标动作已经绑定，保留它现有的快捷键；否则优先使用对应的首选快捷键，发生冲突时再从备用快捷键中选择未占用的键。启动和停止不能使用同一个键；不要覆盖、删除或重复已有绑定。
3. 修改前为 config.toml 创建带时间戳的备份。如果配置文件不存在，请先确认 Herdr 实际使用的配置路径，再创建配置。
4. 在配置中加入缺少的绑定，最终应包含等价于下面的两个动作；`key` 使用实际选出的快捷键：

   [[keys.command]]
   key = "<启动快捷键>"
   type = "plugin_action"
   command = "efficient-coding.agent-loop.start"
   description = "start agent loop"

   [[keys.command]]
   key = "<停止快捷键>"
   type = "plugin_action"
   command = "efficient-coding.agent-loop.abandon"
   description = "abandon active agent loop"

5. 运行 herdr config check。若校验失败，恢复备份，并报告错误，不要留下无效配置。
6. 校验通过后运行 herdr server reload-config，使当前正在运行的 Herdr 进程立即加载新快捷键，不要重启 Herdr。
7. 最后报告：启动和停止各自实际绑定的快捷键、配置文件路径、备份文件路径、配置校验结果和热重载结果。

请保留所有无关配置，只做完成此任务所需的最小修改。
```

配置完成后，启动快捷键在当前 Workspace 调用 `Agent Loop: Start`；停止快捷键调用 `Agent Loop: Abandon active run`，将编排状态标记为失败并释放 Workspace，但不会自动关闭 Orchestrator 或子 Agent 的 Tab/Pane。
