# 数据模型

## 目录

```
~/.efficient-coding/diffusion/            # 可用 DIFFUSION_HOME 覆盖
  server.json                             # 正在运行的网页服务 {pid, port, startedAt, idleMs}
  maps/<slug>/
    events.jsonl                          # 只追加的事件日志，是唯一的数据源
    transcripts/<agent>-<id>.jsonl        # 关联会话的快照
    transcripts/<agent>-<id>.sync.json    # {source, offset, headLen, headHash, syncedAt}
```

## 事件

每行一个事件：`{v: 1, seq, at, batch, actor: {agent, sessionId, cwd}, type, ...}`。同一次 `dm` 命令写入的事件共用一个 `batch`，撤销以 batch 为单位。

| type | 字段 |
|---|---|
| `map_created` | `title`，`purpose`，`lens` |
| `map_updated` | `title?`，`purpose?` |
| `lens_updated` | `lens` |
| `node_added` | `id`，`title`，`kind`，`status`，`summary`，`parentId` |
| `node_updated` | `id`，`patch` |
| `node_moved` | `id`，`parentId` |
| `node_removed` | `id`，`cascade` |
| `nodes_merged` | `from`，`into` |
| `edge_added` | `id`，`from`，`to`，`relation`，`label?` |
| `edge_removed` | `id` |
| `session_linked` | `nodeId`，`agent`，`sessionId`，`cwd`（发生时间就是事件的 `at`） |
| `reverted` | `target`：被撤销的 batch |

当前的图谱状态由这些事件按顺序 fold 得到（`scripts/lib/model.ts`）。fold 会跳过已被撤销的 batch，对无效操作（比如修改已经不存在的节点）直接忽略，所以撤销任何一个 batch，事件日志都仍然可读。网页的时间轴回放也是对事件的前缀做 fold。

## 网页服务

网页服务不修改任何图谱。它唯一接受的写操作是在列表页删除整张图谱（`DELETE /api/maps/<slug>`），而且只接受带有 `x-diffusion-map: delete` 请求头的请求。其他网站的页面在浏览器里无法添加这个请求头（需要 CORS 预检，而服务从不放行）。

## 会话关联与快照

- 节点上的 `sessions[]` 记录了：哪个 Agent、哪个会话、cwd，以及每次关联的时间。
- 网页打开一个会话时，用这些时间找到对应的那一轮（时间点之前最近的一条用户消息，到下一条用户消息为止），标为相关片段。
- 快照：每次执行 `dm` 命令（当前会话已关联到该图谱时），以及网页读取会话时，都会同步一次。
  - 源文件开头的哈希没变、且文件只是变长了，就只追加新增的完整行；
  - 否则整份重新复制。
- 读取时优先读 Agent 自己的原始会话文件；原始文件被清理后（Claude Code 默认保留 30 天），改读快照。
- 原始文件位置：
  - Claude Code：`~/.claude/projects/*/<id>.jsonl`（支持 `CLAUDE_CONFIG_DIR`）
  - Codex：`~/.codex/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl` 和 `~/.codex/archived_sessions/`（支持 `CODEX_HOME`）
