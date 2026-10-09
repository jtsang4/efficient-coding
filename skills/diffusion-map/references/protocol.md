# 生长、重组与 lens 设计

## 一张好图谱的样子

- **支柱少而稳**：3–7 个。它们之间尽量不重叠，合起来能覆盖这个主题的主体。支柱一旦确立就很少变动，要变动先和用户确认。
- **越往外越具体**：支柱下是关键概念或主要方向，再往外是细节、例子、具体方案。
- **主干是树，交叉关系用边表示**：每个节点只有一个父节点（`parent`），表示它是从哪里扩散出来的。和其他分支的关系用 `link` 连边，不要为了表达关系把同一个节点挂到两个地方。
- **frontier 是活的**：`open` 语气的节点就是"知道它存在，但还没展开"的地方。它们既是给用户的下一步建议，也是你开场续学时的切入点。

## 每轮的判断顺序

1. 这一轮有没有**实质性的新内容**？有的话，它最贴近哪个已有节点？挂在那个节点下面。如果和所有分支都不贴近，考虑它是不是漏掉的支柱（这需要先确认）。
2. 这一轮有没有提到**值得以后展开、但这次没展开**的点？加成 frontier，最多 2–3 个，别把图谱堆满。
3. 现有结构有没有被这一轮**证伪或修正**？
   - 两个节点讲的是同一件事 → `merge`
   - 某个节点其实属于另一个分支 → `move`
   - 某个"支柱"其实只是细节 → 先确认，再 `move` 到合适的父节点下
   - 某个节点是误解或者跑题 → 修改它；确实无效再 `remove`
4. 有没有**跨分支的关系**被讲清楚了？比如依赖、对比、因果，用 lens 里的关系类型 `link`。
5. 用户的**掌握程度或决定**有没有变化？用 `update --status` 更新。
6. 讨论到了已有节点但结构没变 → `touch`。

把这些操作合进一次 `apply`。

## 粒度

- 一个节点对应一个能用一句话命名的东西：一个概念、一个问题、一个方案、一个决定。
- 一轮新增 1–5 个节点比较正常。如果一轮要加十几个，说明粒度太细，或者讲得太散。
- 单个节点下的子节点超过 7–8 个时，考虑加一层中间分组。

## lens 设计

lens 是这张图谱的"语法"。网页的颜色、图例和视觉强弱完全由它生成。

```json
{
  "pillar": "支柱代表什么（一句话）",
  "kinds": [{ "id": "kebab-id", "label": "显示名", "description": "可选" }],
  "statuses": [{ "id": "kebab-id", "label": "显示名", "tone": "open | active | settled | muted" }],
  "relations": [{ "id": "kebab-id", "label": "显示名" }]
}
```

- `kinds`：节点类型，2–5 种为宜。
- `statuses`：按推进顺序排列，**第一个是新节点的默认状态**。每个状态都必须指定 `tone`，网页按 tone 来决定视觉表现：
  - `open`：知道它存在，但还没展开（frontier）；
  - `active`：正在进行；
  - `settled`：已经稳定，即理解了、定下了、完成了；
  - `muted`：保留下来作为记录，但不再参与，比如被否决、被放弃。
- `relations`：交叉边的类型，2–5 种。

lens 可以在使用过程中演化，比如发现需要一种新的节点类型。修改 lens 前先和用户确认。

### 示例：学习一个领域

```json
{
  "pillar": "这个领域的核心概念：理解它们就能自己推出其余部分",
  "kinds": [
    { "id": "concept", "label": "概念" },
    { "id": "mechanism", "label": "机制" },
    { "id": "example", "label": "例子" },
    { "id": "pitfall", "label": "易错点" }
  ],
  "statuses": [
    { "id": "frontier", "label": "待展开", "tone": "open" },
    { "id": "learning", "label": "学习中", "tone": "active" },
    { "id": "grasped", "label": "已掌握", "tone": "settled" }
  ],
  "relations": [
    { "id": "depends-on", "label": "依赖" },
    { "id": "contrasts", "label": "对比" },
    { "id": "leads-to", "label": "推导出" }
  ]
}
```

用户能用自己的话复述、能回答追问，或者能举出新例子时，才把状态标为 `grasped`。

### 示例：构思一个项目

```json
{
  "pillar": "决定这个项目成败的根本问题：为谁、解决什么、凭什么、受什么约束、怎样算成功",
  "kinds": [
    { "id": "question", "label": "问题" },
    { "id": "option", "label": "方案" },
    { "id": "feature", "label": "功能" },
    { "id": "risk", "label": "风险" },
    { "id": "decision", "label": "决定" }
  ],
  "statuses": [
    { "id": "open", "label": "待议", "tone": "open" },
    { "id": "exploring", "label": "探索中", "tone": "active" },
    { "id": "decided", "label": "已定", "tone": "settled" },
    { "id": "rejected", "label": "已否决", "tone": "muted" }
  ],
  "relations": [
    { "id": "enables", "label": "支撑" },
    { "id": "conflicts", "label": "冲突" },
    { "id": "alternative-to", "label": "替代" },
    { "id": "mitigates", "label": "缓解" }
  ]
}
```

被否决的方案标为 `rejected`，不要删除，"为什么不选它"本身就是有价值的信息，写进摘要里。

### 示例：做一个决策

```json
{
  "pillar": "影响这个决策的关键维度",
  "kinds": [
    { "id": "criterion", "label": "标准" },
    { "id": "evidence", "label": "证据" },
    { "id": "candidate", "label": "候选" }
  ],
  "statuses": [
    { "id": "unknown", "label": "未知", "tone": "open" },
    { "id": "weighing", "label": "权衡中", "tone": "active" },
    { "id": "clear", "label": "已清楚", "tone": "settled" },
    { "id": "ruled-out", "label": "已排除", "tone": "muted" }
  ],
  "relations": [
    { "id": "supports", "label": "支持" },
    { "id": "undermines", "label": "削弱" }
  ]
}
```
