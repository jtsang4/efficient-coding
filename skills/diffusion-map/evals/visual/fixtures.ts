// Synthetic maps and transcripts for visual review and manual testing. No real conversations.
// Usage: bun evals/visual/fixtures.ts <root>  → writes <root>/{diffusion,claude,codex}
import { join } from "node:path";
import type { Lens } from "../../scripts/lib/model";
import { Session as BaseSession, day, useHome } from "./fixture-kit";

const root = process.argv[2] ?? join(import.meta.dir, "out", "home");
const { applyOps, createMap } = await useHome(root);
type Op = import("../../scripts/lib/store").Op;
class Session extends BaseSession {
  constructor(agent: ConstructorParameters<typeof BaseSession>[1], id: string, clock: Date) {
    super(root, agent, id, clock);
  }
}

// ---------- lenses ----------

const learnLens: Lens = {
  pillar: "这个领域的核心概念：理解它们就能推出其余部分",
  kinds: [
    { id: "concept", label: "概念" },
    { id: "mechanism", label: "机制" },
    { id: "example", label: "例子" },
    { id: "pitfall", label: "易错点" },
  ],
  statuses: [
    { id: "frontier", label: "待展开", tone: "open" },
    { id: "learning", label: "学习中", tone: "active" },
    { id: "grasped", label: "已掌握", tone: "settled" },
  ],
  relations: [
    { id: "depends-on", label: "依赖" },
    { id: "contrasts", label: "对比" },
    { id: "leads-to", label: "推导出" },
  ],
};

const ideateLens: Lens = {
  pillar: "决定项目成败的根本问题",
  kinds: [
    { id: "question", label: "问题" },
    { id: "option", label: "方案" },
    { id: "feature", label: "功能" },
    { id: "risk", label: "风险" },
    { id: "decision", label: "决定" },
  ],
  statuses: [
    { id: "open", label: "待议", tone: "open" },
    { id: "exploring", label: "探索中", tone: "active" },
    { id: "decided", label: "已定", tone: "settled" },
    { id: "rejected", label: "已否决", tone: "muted" },
  ],
  relations: [
    { id: "enables", label: "支撑" },
    { id: "conflicts", label: "冲突" },
    { id: "alternative-to", label: "替代" },
    { id: "mitigates", label: "缓解" },
  ],
};

// ---------- map 1: learning Rust ownership ----------

{
  const a = new Session("claude-code", "7c1e2a90-4b1d-4e55-9a51-0d3f6c2b8e11", day("2026-10-03", "20:10"));
  const slug = createMap({ title: "Rust 所有权与借用", slug: "rust-ownership", purpose: "从零理解 Rust 的内存安全模型，能读懂借用检查器的报错", lens: learnLens }, a.actor, a.clock);

  let at = a.turn({
    user: "我想系统地学一下 Rust 的所有权，先帮我搭个骨架吧。",
    assistant: "Rust 的内存安全建立在五根支柱上：\n\n1. **所有权**：每个值有且只有一个所有者，所有者离开作用域时值被释放。\n2. **借用**：不转移所有权地访问值，受“共享不可变、可变不共享”约束。\n3. **生命周期**：编译器用来证明引用不会比数据活得更久的标注。\n4. **智能指针**：在所有权规则之上提供堆分配、共享与内部可变性。\n5. **并发安全**：用 `Send`/`Sync` 把数据竞争变成编译错误。\n\n建议从所有权开始，其余四个都是它的推论。",
  });
  applyOps(slug, [
    { op: "add", id: "ownership", title: "所有权", kind: "concept", status: "learning", summary: "每个值有且只有一个所有者；所有者离开作用域时，值被自动释放。这条规则让 Rust 不需要 GC 也不需要手动 free。" },
    { op: "add", id: "borrowing", title: "借用", kind: "concept", summary: "通过引用临时访问值而不取得所有权。核心约束：同一时刻要么有任意多个不可变引用，要么只有一个可变引用。" },
    { op: "add", id: "lifetimes", title: "生命周期", kind: "concept", summary: "编译器用来证明“引用不会比它指向的数据活得更久”的区间标注，绝大多数情况下可以省略。" },
    { op: "add", id: "smart-pointers", title: "智能指针", kind: "concept", summary: "实现了 `Deref` 与 `Drop` 的结构体，在所有权规则之上提供堆分配、共享所有权与内部可变性。" },
    { op: "add", id: "concurrency", title: "并发安全", kind: "concept", summary: "`Send` 与 `Sync` 两个标记 trait 让编译器在类型层面排除数据竞争——“无畏并发”。" },
  ], a.actor, at);

  at = a.turn({
    user: "所有权里的“移动”到底是什么？为什么 `let b = a;` 之后 a 就不能用了？",
    assistant: "对于 `String` 这类在堆上持有资源的类型，`let b = a;` 是一次**移动**：栈上的指针、长度、容量被按位复制给 `b`，同时编译器把 `a` 标记为失效。\n\n```rust\nlet a = String::from(\"墨\");\nlet b = a;          // 所有权移动到 b\n// println!(\"{a}\"); // error[E0382]: borrow of moved value: `a`\n```\n\n如果不让 `a` 失效，两个变量离开作用域时会对同一块堆内存释放两次（double free）。移动语义就是用编译期检查换掉了这个运行时风险。",
    tools: ["Bash"],
  });
  applyOps(slug, [
    { op: "add", id: "move-semantics", title: "移动语义", kind: "mechanism", parent: "ownership", status: "grasped", summary: "赋值或传参时，堆资源的所有权转移给新变量，旧变量在编译期被标记为失效，从根本上避免 double free。" },
    { op: "add", id: "stack-heap", title: "栈与堆", kind: "concept", parent: "ownership", status: "grasped", summary: "栈上数据大小固定、按作用域自动弹出；堆上数据通过指针间接访问。所有权规则管理的主要是堆上的资源。" },
    { op: "add", id: "move-into-fn", title: "传参即移动", kind: "example", parent: "move-semantics", status: "grasped", summary: "把 `String` 传给按值接收的函数后，调用方就不能再用它；想继续用，要么传引用，要么让函数把值返回。" },
    { op: "add", id: "partial-move", title: "部分移动", kind: "mechanism", parent: "move-semantics", summary: "从结构体中移出某个字段后，该结构体整体不可再用，但其余未移动的字段仍可单独访问。" },
  ], a.actor, at);

  at = a.turn({
    user: "那 i32 为什么赋值后原变量还能用？",
    assistant: "因为 `i32` 实现了 `Copy`：它完全存在栈上，按位复制就是一个完整、独立的值，不存在重复释放的问题，所以赋值是**复制**而不是移动。\n\n- `Copy`：隐式、廉价的按位复制，只能用于不持有资源的类型。\n- `Clone`：显式调用 `.clone()`，可以执行任意深拷贝。\n\n一个类型如果实现了 `Drop`，就不能是 `Copy`。",
  });
  applyOps(slug, [
    { op: "add", id: "copy-clone", title: "Copy 与 Clone", kind: "concept", parent: "ownership", status: "grasped", summary: "`Copy` 是隐式的按位复制，只适用于不持有资源的类型；`Clone` 是显式的深拷贝。实现了 `Drop` 的类型不能是 `Copy`。" },
    { op: "link", from: "copy-clone", to: "move-semantics", relation: "contrasts" },
    { op: "update", node: "ownership", status: "grasped" },
  ], a.actor, at);

  at = a.turn({
    user: "离开作用域时具体发生了什么？",
    assistant: "编译器会在作用域结束处插入对 `Drop::drop` 的调用，这就是 Rust 版的 **RAII**：资源的获取与对象的生命周期绑定。\n\n析构顺序与声明顺序**相反**；结构体先 drop 自身，再按字段声明顺序 drop 字段。\n\n典型例子是 `MutexGuard`：拿到锁返回一个 guard，guard 离开作用域就自动解锁，不可能忘记 unlock。",
  });
  applyOps(slug, [
    { op: "add", id: "drop-raii", title: "Drop 与 RAII", kind: "mechanism", parent: "ownership", status: "grasped", summary: "所有者离开作用域时编译器自动插入 `Drop::drop`，把资源释放绑定到对象生命周期上。" },
    { op: "add", id: "drop-order", title: "析构顺序", kind: "mechanism", parent: "drop-raii", status: "learning", summary: "局部变量按声明的逆序析构；结构体先执行自身的 `drop`，再按字段声明顺序析构字段。" },
    { op: "add", id: "mutexguard-raii", title: "MutexGuard 自动解锁", kind: "example", parent: "drop-raii", status: "grasped", summary: "`lock()` 返回的 guard 在离开作用域时自动释放锁，把“忘记解锁”从运行时 bug 变成不可能发生的事。" },
  ], a.actor, at);

  // Day 2 — Codex picks up borrowing and lifetimes.
  const b = new Session("codex", "01a12f3c-88e0-7d21-b6f4-2c9e5a7d3b40", day("2026-10-05", "09:30"));
  at = b.turn({
    user: "继续上次的 Rust 图谱，今天想把借用讲透。",
    assistant: "借用的全部规则可以压缩成一句话：**共享不可变，可变不共享**。\n\n```rust\nlet mut s = String::from(\"扩散\");\nlet r1 = &s;      // ok\nlet r2 = &s;      // ok，多个不可变借用\nlet r3 = &mut s;  // error[E0502]: 已存在不可变借用\n```\n\n这条规则在编译期排除了“边读边写”导致的数据竞争和迭代器失效。",
    tools: ["exec_command", "exec_command"],
  });
  applyOps(slug, [
    { op: "add", id: "borrow-rules", title: "借用规则", kind: "concept", parent: "borrowing", status: "grasped", summary: "同一时刻：任意多个 `&T`，或者恰好一个 `&mut T`，二者不可同时存在。引用必须始终有效。" },
    { op: "add", id: "shared-ref", title: "不可变借用 &T", kind: "concept", parent: "borrowing", status: "grasped", summary: "只读访问，可以同时存在任意多个；被借用期间所有者也不能修改值。" },
    { op: "add", id: "mut-ref", title: "可变借用 &mut T", kind: "concept", parent: "borrowing", status: "grasped", summary: "独占的读写访问；存在期间不能有任何其他引用，包括所有者自己的访问。" },
    { op: "update", node: "borrowing", status: "learning" },
  ], b.actor, at);

  at = b.turn({
    user: "为什么有时候我先借用、后修改，编译器又不报错？",
    assistant: "因为 **NLL（非词法生命周期）**：借用的有效范围不再是整个词法作用域，而是到它**最后一次被使用**为止。\n\n```rust\nlet mut v = vec![1, 2, 3];\nlet first = &v[0];\nprintln!(\"{first}\"); // first 最后一次使用\nv.push(4);            // ok：借用已经结束\n```\n\n如果把 `println!` 挪到 `push` 之后，就会报 E0502。",
  });
  applyOps(slug, [
    { op: "add", id: "nll", title: "非词法生命周期 NLL", kind: "mechanism", parent: "borrowing", status: "learning", summary: "借用的有效区间截止到最后一次使用，而不是词法作用域的结尾。很多“看起来该报错”的代码因此可以通过。" },
    { op: "link", from: "nll", to: "borrow-rules", relation: "depends-on" },
    { op: "add", id: "two-phase-borrows", title: "两阶段借用", kind: "mechanism", parent: "nll" },
    { op: "add", id: "mutate-while-iter", title: "迭代时修改集合", kind: "pitfall", parent: "borrowing", status: "learning", summary: "`for x in &v { v.push(..) }` 会被拒绝：迭代器持有不可变借用，`push` 又需要可变借用，可能导致迭代器失效。" },
    { op: "add", id: "borrowck-errors", title: "读懂 E0502 / E0499", kind: "pitfall", parent: "borrowing", status: "learning", summary: "E0502：可变与不可变借用冲突；E0499：同时存在两个可变借用。先找出“谁还持有借用”，再看它最后一次使用在哪里。" },
  ], b.actor, at);

  at = b.turn({
    user: "有时候我确实需要在 &self 方法里改内部状态，怎么办？",
    assistant: "这就是**内部可变性**：把“可变性检查”从编译期推迟到运行期。\n\n- `Cell<T>`：适合 `Copy` 类型，通过 `get`/`set` 整体替换。\n- `RefCell<T>`：运行时维护借用计数，违反规则时 panic。\n\n它们没有破坏借用规则，只是换了一个执行规则的时机。多线程场景下对应的是 `Mutex`/`RwLock`。",
  });
  applyOps(slug, [
    { op: "add", id: "interior-mutability", title: "内部可变性", kind: "concept", parent: "borrowing", status: "learning", summary: "通过 `&T` 修改内部数据：把借用规则的检查从编译期挪到运行期。单线程用 `Cell`/`RefCell`，多线程用 `Mutex`/`RwLock`。" },
    { op: "add", id: "cell", title: "Cell", kind: "mechanism", parent: "interior-mutability", status: "grasped", summary: "只能整体 `get`/`set`，不能拿出内部引用，因此零运行时开销、永不 panic。" },
    { op: "add", id: "refcell", title: "RefCell", kind: "mechanism", parent: "interior-mutability", status: "learning", summary: "运行时记录借用计数，`borrow_mut` 冲突时 panic。常与 `Rc` 组合成 `Rc<RefCell<T>>`。" },
  ], b.actor, at);

  at = b.turn({
    user: "生命周期标注 `'a` 我一直看不懂。",
    assistant: "关键在于：**标注不会改变任何引用的实际存活时间**，它只是在描述输入和输出引用之间的关系，让编译器能够检查。\n\n```rust\nfn longest<'a>(x: &'a str, y: &'a str) -> &'a str {\n    if x.len() > y.len() { x } else { y }\n}\n```\n\n意思是：返回值的有效期不超过 `x` 和 `y` 中较短的那个。大部分函数不用写，是因为有三条**省略规则**。",
  });
  applyOps(slug, [
    { op: "add", id: "annotations", title: "生命周期标注", kind: "concept", parent: "lifetimes", status: "learning", summary: "`'a` 不改变引用的实际存活时间，只声明输入与输出引用之间的约束关系，供编译器验证。" },
    { op: "add", id: "elision", title: "省略规则", kind: "mechanism", parent: "lifetimes", status: "learning", summary: "三条规则：每个引用参数各自一个生命周期；只有一个输入生命周期时赋给所有输出；方法中 `&self` 的生命周期赋给所有输出。" },
    { op: "add", id: "dangling", title: "悬垂引用", kind: "pitfall", parent: "lifetimes", status: "grasped", summary: "返回指向局部变量的引用会被拒绝：局部变量在函数返回时已经释放。生命周期检查的首要目的就是消灭它。" },
    { op: "add", id: "static-lifetime", title: "'static", kind: "concept", parent: "lifetimes", summary: "整个程序运行期间都有效。`T: 'static` 的含义是“不含非 static 引用”，并不等于“永远存活”。" },
    { op: "add", id: "struct-refs", title: "结构体中的引用", kind: "concept", parent: "lifetimes" },
    { op: "add", id: "variance", title: "协变与逆变", kind: "concept", parent: "lifetimes" },
    { op: "add", id: "hrtb", title: "高阶生命周期 HRTB", kind: "concept", parent: "lifetimes" },
    { op: "link", from: "annotations", to: "borrow-rules", relation: "depends-on" },
    { op: "link", from: "elision", to: "annotations", relation: "contrasts" },
    { op: "update", node: "lifetimes", status: "learning" },
  ], b.actor, at);

  // Day 3 — Claude Code again: smart pointers and concurrency.
  const c = new Session("claude-code", "c4b7d2e1-0f39-4a6b-8e2d-5f1a9c3e7b62", day("2026-10-08", "21:05"));
  at = c.turn({
    user: "来看智能指针吧，Box、Rc、Arc 分别解决什么问题？",
    assistant: "| 类型 | 解决的问题 | 线程安全 |\n|---|---|---|\n| `Box<T>` | 把值放到堆上；递归类型、trait 对象 | 跟随 `T` |\n| `Rc<T>` | 单线程内**共享所有权**（引用计数） | 否 |\n| `Arc<T>` | 跨线程共享所有权（原子计数） | 是 |\n\n`Rc` 和 `Arc` 只给出共享的**只读**访问；想要修改，要配合 `RefCell` 或 `Mutex`。",
    tools: ["Read"],
  });
  applyOps(slug, [
    { op: "add", id: "box", title: "Box", kind: "mechanism", parent: "smart-pointers", status: "grasped", summary: "把值放到堆上、栈上只留指针。用于递归类型、大对象转移，以及 `Box<dyn Trait>`。" },
    { op: "add", id: "rc", title: "Rc", kind: "mechanism", parent: "smart-pointers", status: "learning", summary: "单线程引用计数，提供共享所有权；最后一个 `Rc` 被 drop 时释放数据。只给出不可变访问。" },
    { op: "add", id: "arc", title: "Arc", kind: "mechanism", parent: "smart-pointers", status: "learning", summary: "原子引用计数版本的 `Rc`，可以跨线程共享，代价是计数操作更慢。" },
    { op: "add", id: "deref", title: "Deref 强制转换", kind: "mechanism", parent: "smart-pointers", status: "grasped", summary: "实现 `Deref` 后，`&Box<String>` 可以自动转换成 `&String` 再转换成 `&str`，智能指针因此用起来像普通引用。" },
    { op: "link", from: "rc", to: "arc", relation: "contrasts" },
    { op: "link", from: "rc", to: "refcell", relation: "leads-to", label: "Rc<RefCell<T>>" },
    { op: "update", node: "smart-pointers", status: "learning" },
  ], c.actor, at);

  at = c.turn({
    user: "Rc 会不会内存泄漏？",
    assistant: "会：两个 `Rc` 互相指向，就形成**引用循环**，计数永远不会归零。\n\n解决办法是用 `Weak<T>` 表示“非拥有”的那一边：它不增加强引用计数，使用前需要 `upgrade()` 得到 `Option<Rc<T>>`。\n\n经典场景：树结构中子节点指向父节点用 `Weak`，父节点指向子节点用 `Rc`。",
  });
  applyOps(slug, [
    { op: "add", id: "weak", title: "Weak 打破循环", kind: "mechanism", parent: "rc", status: "learning", summary: "不增加强引用计数的指针，`upgrade()` 后才能访问。用来表示“非拥有”的反向关系，避免 `Rc` 循环引用导致泄漏。" },
    { op: "add", id: "pin", title: "Pin", kind: "concept", parent: "smart-pointers" },
    { op: "add", id: "cow", title: "Cow", kind: "concept", parent: "smart-pointers" },
  ], c.actor, at);

  at = c.turn({
    user: "最后讲讲并发：Send 和 Sync 有什么区别？",
    assistant: "- **`Send`**：所有权可以安全地**转移**到另一个线程。\n- **`Sync`**：`&T` 可以安全地被多个线程**共享**；等价于 `&T: Send`。\n\n`Rc` 两者都不是（计数不是原子操作）；`Arc<T>` 在 `T: Send + Sync` 时两者都是；`RefCell` 是 `Send` 但不是 `Sync`。\n\n所以 `Arc<Mutex<T>>` 是跨线程共享可变状态的标准写法。",
  });
  applyOps(slug, [
    { op: "add", id: "send-sync", title: "Send 与 Sync", kind: "concept", parent: "concurrency", status: "learning", summary: "`Send`：所有权可以跨线程转移；`Sync`：引用可以跨线程共享（`&T: Send`）。由编译器自动推导，手动实现需要 `unsafe`。" },
    { op: "add", id: "mutex", title: "Mutex", kind: "mechanism", parent: "concurrency", status: "learning", summary: "互斥锁。`lock()` 返回 RAII guard；与 `Arc` 组合成 `Arc<Mutex<T>>`，在线程间共享可变状态。" },
    { op: "add", id: "channels", title: "通道 mpsc", kind: "mechanism", parent: "concurrency", summary: "通过发送所有权来通信，而不是通过共享内存：值 `send` 出去之后，发送方就无法再访问它。" },
    { op: "add", id: "scoped-threads", title: "作用域线程", kind: "mechanism", parent: "concurrency" },
    { op: "add", id: "atomics", title: "原子类型", kind: "concept", parent: "concurrency" },
    { op: "add", id: "async-borrow", title: "async 中的借用", kind: "pitfall", parent: "concurrency" },
    { op: "link", from: "arc", to: "send-sync", relation: "depends-on" },
    { op: "link", from: "refcell", to: "mutex", relation: "contrasts", label: "单线程 vs 多线程" },
    { op: "link", from: "mutexguard-raii", to: "mutex", relation: "leads-to" },
    { op: "link", from: "scoped-threads", to: "lifetimes", relation: "depends-on" },
    { op: "touch", nodes: ["mutexguard-raii", "refcell"] },
    { op: "update", node: "concurrency", status: "learning" },
  ], c.actor, at);
}

// ---------- map 2: ideation ----------

{
  const s = new Session("codex", "01a1d3e7-5c2b-7f90-a8c4-9e6b1d2f4a73", day("2026-10-09", "14:00"));
  const slug = createMap({ title: "本地优先的笔记同步工具", slug: "local-first-notes", purpose: "构思一个面向重度 Markdown 用户、离线优先、端到端加密的笔记同步工具", lens: ideateLens }, s.actor, s.clock);
  let at = s.turn({
    user: "我想做一个本地优先的笔记同步工具，帮我把思路理一理。",
    assistant: "先立五根支柱，后面所有讨论都挂在它们下面：\n\n1. **目标用户**：谁会为它付费、换工具？\n2. **核心问题**：现有方案到底痛在哪？\n3. **价值主张**：我们凭什么更好？\n4. **关键约束**：技术、成本、团队上有哪些硬限制？\n5. **成功标准**：半年后怎样算做成了？",
  });
  const pillars: Op[] = [
    { op: "add", id: "users", title: "目标用户", kind: "question", status: "exploring", summary: "以纯 Markdown 文件管理知识、在多台设备之间切换的重度写作者和开发者。" },
    { op: "add", id: "problem", title: "核心问题", kind: "question", status: "exploring", summary: "现有同步方案要么锁定格式，要么离线体验差、冲突处理粗暴，要么隐私不可控。" },
    { op: "add", id: "value", title: "价值主张", kind: "question", status: "open" },
    { op: "add", id: "constraints", title: "关键约束", kind: "question", status: "exploring" },
    { op: "add", id: "success", title: "成功标准", kind: "question", status: "open" },
  ];
  applyOps(slug, pillars, s.actor, at);

  at = s.turn({
    user: "同步引擎用什么方案？CRDT 还是基于文件的三方合并？",
    assistant: "两条路线都可行，取舍很清楚：\n\n- **CRDT（如 Automerge）**：任意离线编辑都能自动合并，但要维护额外的操作日志，和“纯 Markdown 文件”这个承诺有张力。\n- **文件级三方合并**：以 git 式的 base/ours/theirs 合并文本，格式最纯粹，但冲突需要用户处理。\n\n结合“文件就是真相”的定位，我倾向于三方合并，再加上段落级的自动合并来减少冲突。",
    tools: ["web_search", "web_search"],
  });
  applyOps(slug, [
    { op: "add", id: "sync-engine", title: "同步引擎", kind: "question", parent: "constraints", status: "decided", summary: "决定：以文件为唯一真相，采用三方合并 + 段落级自动合并；不引入额外的操作日志格式。" },
    { op: "add", id: "crdt", title: "CRDT（Automerge）", kind: "option", parent: "sync-engine", status: "rejected", summary: "合并能力最强，但需要旁路的操作日志，违背“文件就是全部”的承诺，且迁出成本高。否决。" },
    { op: "add", id: "three-way", title: "三方合并", kind: "option", parent: "sync-engine", status: "decided", summary: "git 式的 base/ours/theirs 文本合并，按段落粒度自动合并不冲突的修改，剩余冲突交给用户。" },
    { op: "add", id: "conflict-ui", title: "冲突解决界面", kind: "feature", parent: "three-way", status: "exploring", summary: "并排展示两个版本，按段落选择或手动编辑；默认先保留双方内容，绝不静默丢弃。" },
    { op: "link", from: "crdt", to: "three-way", relation: "alternative-to" },
    { op: "add", id: "merge-risk", title: "大文件合并卡顿", kind: "risk", parent: "three-way", status: "open" },
  ], s.actor, at);

  at = s.turn({
    user: "加密和托管呢？",
    assistant: "端到端加密是“隐私可控”这一主张的前提：服务端只存密文分块，密钥由设备派生，不上传。\n\n托管上提供两个选项：官方托管（订阅收入）与自带 S3 兼容存储（吸引极客、建立信任）。后者成本几乎为零，却能显著降低“被锁定”的顾虑。",
  });
  applyOps(slug, [
    { op: "add", id: "e2ee", title: "端到端加密", kind: "decision", parent: "value", status: "decided", summary: "服务端只保存密文分块；密钥由设备派生，不离开用户设备。这是“隐私可控”主张的技术前提。" },
    { op: "add", id: "byo-storage", title: "自带 S3 存储", kind: "feature", parent: "value", status: "exploring", summary: "允许用户把密文同步到自己的 S3 兼容存储，几乎零成本，却能显著降低被锁定的顾虑。" },
    { op: "add", id: "hosted", title: "官方托管订阅", kind: "option", parent: "success", status: "exploring", summary: "主要收入来源：开箱即用的托管同步，按设备数和存储量分档。" },
    { op: "add", id: "key-loss", title: "密钥丢失无法恢复", kind: "risk", parent: "e2ee", status: "open", summary: "端到端加密意味着官方无法帮用户找回数据。需要恢复码，以及用户可理解的提示。" },
    { op: "add", id: "recovery-kit", title: "恢复套件", kind: "feature", parent: "key-loss", status: "open" },
    { op: "link", from: "recovery-kit", to: "key-loss", relation: "mitigates" },
    { op: "link", from: "e2ee", to: "byo-storage", relation: "enables" },
    { op: "link", from: "byo-storage", to: "hosted", relation: "conflicts", label: "收入 vs 信任" },
    { op: "add", id: "power-writers", title: "重度 Markdown 写作者", kind: "decision", parent: "users", status: "decided", summary: "首批用户：已经用 Obsidian/VS Code 管理上千篇 Markdown、跨三台以上设备的人。" },
    { op: "add", id: "teams", title: "小团队协作", kind: "option", parent: "users", status: "rejected", summary: "需要权限、实时协同与评论，会把产品拖向 Notion 的赛道。首版不做。" },
    { op: "add", id: "mobile-editing", title: "移动端编辑体验差", kind: "question", parent: "problem", status: "exploring" },
    { op: "add", id: "vendor-lockin", title: "格式锁定", kind: "question", parent: "problem", status: "decided", summary: "很多工具把笔记存进私有数据库，迁出时会丢失链接与元数据。我们的回答是：文件就是全部。" },
    { op: "add", id: "retention", title: "30 日留存 ≥ 40%", kind: "decision", parent: "success", status: "open" },
  ], s.actor, at);
}

// ---------- map 3: pillars only ----------

{
  const s = new Session("claude-code", "9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d", day("2026-10-02", "20:00"));
  const slug = createMap({
    title: "选择下一个前端框架",
    slug: "pick-a-framework",
    purpose: "为内部设计系统的重写选一个前端框架",
    lens: {
      pillar: "影响这个决策的关键维度",
      kinds: [{ id: "criterion", label: "标准" }, { id: "evidence", label: "证据" }, { id: "candidate", label: "候选" }],
      statuses: [
        { id: "unknown", label: "未知", tone: "open" },
        { id: "weighing", label: "权衡中", tone: "active" },
        { id: "clear", label: "已清楚", tone: "settled" },
        { id: "ruled-out", label: "已排除", tone: "muted" },
      ],
      relations: [{ id: "supports", label: "支持" }, { id: "undermines", label: "削弱" }],
    },
  }, s.actor, s.clock);
  const at = s.turn({ user: "帮我想想选框架要看哪些维度。", assistant: "我建议从五个维度来衡量：团队熟悉度、生态成熟度、渲染性能、长期维护风险、与现有设计系统的迁移成本。" });
  applyOps(slug, [
    { op: "add", title: "团队熟悉度", kind: "criterion", status: "weighing" },
    { op: "add", title: "生态成熟度", kind: "criterion" },
    { op: "add", title: "渲染性能", kind: "criterion" },
    { op: "add", title: "长期维护风险", kind: "criterion" },
    { op: "add", title: "迁移成本", kind: "criterion", status: "clear" },
  ], s.actor, at);
}

// ---------- map 4: a large map for performance ----------

{
  const s = new Session("codex", "01a1e9f0-2b3c-7d4e-9f50-6a7b8c9d0e1f", day("2026-09-20", "09:00"));
  const slug = createMap({ title: "分布式系统全景", slug: "distributed-systems", purpose: "压力测试：约 300 个节点", lens: learnLens }, s.actor, s.clock);
  const pillars = ["一致性模型", "共识算法", "复制与分区", "时间与顺序", "故障与容错", "存储引擎"];
  const words = ["线性一致", "因果一致", "最终一致", "Raft", "Paxos", "租约", "向量时钟", "混合逻辑时钟", "Quorum", "反熵", "Gossip", "两阶段提交", "Saga", "LSM 树", "B+ 树", "WAL", "快照", "成员变更", "领导选举", "脑裂", "幂等", "重试", "背压", "分片", "再平衡", "一致性哈希", "读修复", "提示移交", "拜占庭", "超时", "心跳", "租期", "CRDT", "MVCC", "隔离级别", "写偏斜", "幻读", "批处理", "流处理", "恰好一次"];
  const kinds = ["concept", "mechanism", "example", "pitfall"];
  const statuses = ["frontier", "learning", "grasped", "grasped"];
  let rnd = 7;
  const rand = (n: number) => ((rnd = (rnd * 1103515245 + 12345) % 2147483648), rnd % n);
  let made = 0;
  const ops: Op[] = pillars.map((title, i) => ({ op: "add", id: `p${i}`, title, kind: "concept", status: "learning", summary: `${title}是分布式系统的基础议题之一。` }));
  const frontier: string[] = pillars.map((_, i) => `p${i}`);
  while (made < 294) {
    const parent = frontier[rand(Math.min(frontier.length, 40 + made))]!;
    const id = `x${made}`;
    ops.push({ op: "add", id, title: `${words[rand(words.length)]}·${made}`, kind: kinds[rand(4)], status: statuses[rand(4)], parent, summary: "压力测试节点。" });
    frontier.push(id);
    made++;
  }
  for (let i = 0; i < 24; i++) ops.push({ op: "link", from: `x${rand(294)}`, to: `x${rand(294)}`, relation: "depends-on" });
  const chunk = 30;
  for (let i = 0; i < ops.length; i += chunk) {
    const at = s.turn({ user: `继续展开第 ${i / chunk + 1} 部分。`, assistant: "好的，继续扩散。" });
    try {
      applyOps(slug, ops.slice(i, i + chunk), s.actor, at);
    } catch {
      // Random self-links can collide; drop that chunk's links and retry.
      applyOps(slug, ops.slice(i, i + chunk).filter((o) => o.op !== "link"), s.actor, at);
    }
  }
}

// ---------- map 5: empty ----------

createMap({ title: "量子计算入门", slug: "quantum-intro", purpose: "刚开始，还没有任何节点", lens: learnLens }, { agent: null, sessionId: null, cwd: "/" }, day("2026-10-09", "21:30"));

console.log(`fixtures written to ${root}`);
