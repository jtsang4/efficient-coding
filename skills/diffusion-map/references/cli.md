# dm 命令速查

`dm` = `bun "$SKILL_DIR/scripts/dm.ts"`。在当前工作目录直接执行，不要 cd。

节点可以用 id 或标题（不区分大小写）来引用。标题有重名时，必须用 id。

## 图谱

| 命令 | 作用 |
|---|---|
| `dm maps` | 列出所有图谱（最近更新的在前），附占用空间 |
| `dm delete -m <slug> [--yes]` | 删除图谱及其会话快照；不加 `--yes` 只预览，不删除 |
| `dm new "<标题>" --lens '<json>' [--purpose "<意图>"] [--slug <slug>]` | 新建图谱。标题不是英文时最好指定 `--slug` |
| `dm show -m <slug>` | 大纲：id、类型、状态、会话数、交叉边、frontier |
| `dm show -m <slug> --json` | 完整快照 |
| `dm meta -m <slug> [--title] [--purpose]` | 修改标题或意图 |
| `dm lens -m <slug> --set '<json>'` | 替换 lens（先和用户确认） |
| `dm log -m <slug> [-n 10]` | 最近的批次 |
| `dm undo -m <slug>` | 撤销最近一个批次 |
| `dm export -m <slug> [--format md\|json]` | 导出 |
| `dm serve [-m <slug>] [--idle 30m]` | 启动或复用本地网页并打印网址；超过 idle 时长没有访问会自动退出 |
| `dm stop` | 停止网页服务 |

## apply：一轮的所有改动一次提交

```bash
bun "$SKILL_DIR/scripts/dm.ts" apply -m <slug> <<'EOF'
[
  { "op": "add", "title": "借用", "kind": "concept", "parent": "ownership", "status": "learning",
    "summary": "在不转移所有权的前提下临时访问值；同一时刻要么一个可变借用，要么任意多个不可变借用。" },
  { "op": "add", "id": "nll", "title": "非词法生命周期", "kind": "mechanism", "parent": "借用" },
  { "op": "link", "from": "nll", "to": "lifetimes", "relation": "depends-on" },
  { "op": "update", "node": "ownership", "status": "grasped" },
  { "op": "touch", "nodes": ["move-semantics"] }
]
EOF
```

同一批里，后面的操作可以引用前面刚新建的节点（用 id 或标题）。只要有一个操作失败，整批都不会写入，错误信息会指出是第几个操作。

| op | 字段 |
|---|---|
| `add` | `title`，`kind`（lens 只有一种类型时可省略），`parent`（省略即为支柱），`status`（默认取 lens 的第一个状态），`summary`，`id`（可选，kebab-case；英文标题会自动生成 id，非英文生成 `n1`、`n2`……） |
| `update` | `node`，以及 `title` / `kind` / `status` / `summary` 中的任意几项 |
| `move` | `node`，`parent`（`"root"` 表示提升为支柱） |
| `link` | `from`，`to`，`relation`，`label`（可选） |
| `unlink` | `edge`，或者 `from` + `to`（可选 `relation`） |
| `merge` | `from`，`into`：子节点、边、会话都转给 `into` |
| `remove` | `node`，`cascade`（默认 false：子节点上移一层，会话转给父节点） |
| `touch` | `nodes`：只登记"这一轮讨论了它们" |
| `lens` | `lens` |
| `meta` | `title` / `purpose` |

单条命令也可以用：`dm add|update|move|link|unlink|merge|remove|touch -m <slug> ...`，用 `--help` 查看参数。

## 会话识别

- Claude Code：`CLAUDE_CODE_SESSION_ID`
- Codex：`CODEX_THREAD_ID`
- 都检测不到时，可以加全局参数 `--agent claude-code|codex --session <id>`；否则只改结构，不关联会话（输出里会提示）。
