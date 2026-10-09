// English demo maps for the English README screenshots. Synthetic content only.
// Usage: bun evals/visual/fixtures-en.ts <root>
import { join } from "node:path";
import type { Lens } from "../../scripts/lib/model";
import { Session, day, useHome } from "./fixture-kit";

const root = process.argv[2] ?? join(import.meta.dir, "out", "home-en");
const { applyOps, createMap } = await useHome(root);

const learnLens: Lens = {
  pillar: "The core ideas of the field: understand these and the rest follows",
  kinds: [
    { id: "concept", label: "Concept" },
    { id: "mechanism", label: "Mechanism" },
    { id: "example", label: "Example" },
    { id: "pitfall", label: "Pitfall" },
  ],
  statuses: [
    { id: "frontier", label: "To explore", tone: "open" },
    { id: "learning", label: "Learning", tone: "active" },
    { id: "grasped", label: "Grasped", tone: "settled" },
  ],
  relations: [
    { id: "depends-on", label: "depends on" },
    { id: "contrasts", label: "contrasts with" },
    { id: "leads-to", label: "leads to" },
  ],
};

// ---------- learning: Rust ownership ----------
{
  const a = new Session(root, "claude-code", "7c1e2a90-4b1d-4e55-9a51-0d3f6c2b8e11", day("2026-10-03", "20:10"));
  const slug = createMap({ title: "Rust Ownership & Borrowing", slug: "rust-ownership", purpose: "Understand Rust's memory-safety model well enough to read borrow-checker errors without fear", lens: learnLens }, a.actor, a.clock);

  let at = a.turn({
    user: "I'd like to learn Rust's ownership model properly. Can you sketch the skeleton first?",
    assistant:
      "Rust's memory safety rests on five pillars:\n\n1. **Ownership** — every value has exactly one owner, and it is freed when the owner goes out of scope.\n2. **Borrowing** — access without taking ownership: shared *or* mutable, never both.\n3. **Lifetimes** — how the compiler proves a reference never outlives its data.\n4. **Smart pointers** — heap allocation, shared ownership and interior mutability on top of those rules.\n5. **Fearless concurrency** — `Send` and `Sync` turn data races into compile errors.\n\nStart with ownership; the other four follow from it.",
  });
  applyOps(slug, [
    { op: "add", id: "ownership", title: "Ownership", kind: "concept", status: "learning", summary: "Every value has exactly one owner. When the owner goes out of scope the value is dropped — no GC and no manual `free`." },
    { op: "add", id: "borrowing", title: "Borrowing", kind: "concept", summary: "Temporary access through references without taking ownership. At any moment: many `&T` or exactly one `&mut T`." },
    { op: "add", id: "lifetimes", title: "Lifetimes", kind: "concept", summary: "Regions the compiler uses to prove that a reference never outlives the data it points to. Usually inferred." },
    { op: "add", id: "smart-pointers", title: "Smart pointers", kind: "concept", summary: "Types implementing `Deref` and `Drop` that add heap allocation, shared ownership or interior mutability." },
    { op: "add", id: "concurrency", title: "Fearless concurrency", kind: "concept", summary: "The marker traits `Send` and `Sync` let the type system rule out data races at compile time." },
  ], a.actor, at);

  at = a.turn({
    user: "What exactly is a move? Why can't I use `a` after `let b = a;`?",
    assistant:
      "For a heap-owning type like `String`, `let b = a;` is a **move**: the pointer, length and capacity are copied bit for bit into `b`, and the compiler marks `a` as unusable.\n\n```rust\nlet a = String::from(\"ink\");\nlet b = a;          // ownership moves to b\n// println!(\"{a}\"); // error[E0382]: borrow of moved value: `a`\n```\n\nIf `a` stayed valid, both variables would free the same buffer — a double free. Moves trade that runtime risk for a compile-time check.",
    tools: ["Bash"],
  });
  applyOps(slug, [
    { op: "add", id: "move-semantics", title: "Move semantics", kind: "mechanism", parent: "ownership", status: "grasped", summary: "Assigning or passing a heap-owning value transfers ownership; the old binding becomes unusable, which makes double frees impossible." },
    { op: "add", id: "stack-heap", title: "Stack vs heap", kind: "concept", parent: "ownership", status: "grasped", summary: "Stack values have a fixed size and vanish with their scope; heap data lives behind a pointer. Ownership mostly governs the heap." },
    { op: "add", id: "move-into-fn", title: "Passing moves", kind: "example", parent: "move-semantics", status: "grasped", summary: "Passing a `String` by value to a function moves it; borrow it or return it if the caller still needs it." },
    { op: "add", id: "partial-move", title: "Partial moves", kind: "mechanism", parent: "move-semantics" },
    { op: "add", id: "copy-clone", title: "Copy vs Clone", kind: "concept", parent: "ownership", status: "grasped", summary: "`Copy` is an implicit bitwise copy for types that own no resources; `Clone` is an explicit, possibly deep copy." },
    { op: "link", from: "copy-clone", to: "move-semantics", relation: "contrasts" },
    { op: "update", node: "ownership", status: "grasped" },
  ], a.actor, at);

  at = a.turn({
    user: "And what actually happens when a value goes out of scope?",
    assistant:
      "The compiler inserts a call to `Drop::drop` at the end of the scope. That is Rust's **RAII**: acquiring a resource is tied to an object's lifetime.\n\nLocals drop in *reverse* declaration order. A classic example is `MutexGuard`: `lock()` returns a guard, and the lock is released when the guard goes out of scope — you cannot forget to unlock.",
  });
  applyOps(slug, [
    { op: "add", id: "drop-raii", title: "Drop & RAII", kind: "mechanism", parent: "ownership", status: "grasped", summary: "When an owner leaves scope the compiler calls `Drop::drop`, binding resource release to object lifetime." },
    { op: "add", id: "drop-order", title: "Drop order", kind: "mechanism", parent: "drop-raii", status: "learning", summary: "Locals drop in reverse declaration order; a struct runs its own `drop` before dropping its fields in order." },
    { op: "add", id: "mutexguard", title: "MutexGuard unlocks", kind: "example", parent: "drop-raii", status: "grasped", summary: "The guard returned by `lock()` releases the lock when it goes out of scope, turning a forgotten unlock into an impossibility." },
  ], a.actor, at);

  const b = new Session(root, "codex", "01a12f3c-88e0-7d21-b6f4-2c9e5a7d3b40", day("2026-10-05", "09:30"));
  at = b.turn({
    user: "Let's continue the Rust map. Today I want to really get borrowing.",
    assistant:
      "All of borrowing fits in one sentence: **shared XOR mutable**.\n\n```rust\nlet mut s = String::from(\"spread\");\nlet r1 = &s;      // ok\nlet r2 = &s;      // ok, many shared borrows\nlet r3 = &mut s;  // error[E0502]: already borrowed as immutable\n```\n\nThat single rule rules out reading-while-writing bugs and iterator invalidation at compile time.",
    tools: ["exec_command", "exec_command"],
  });
  applyOps(slug, [
    { op: "add", id: "borrow-rules", title: "The borrow rules", kind: "concept", parent: "borrowing", status: "grasped", summary: "At any moment: any number of `&T`, or exactly one `&mut T` — never both. References must always be valid." },
    { op: "add", id: "shared-ref", title: "Shared refs &T", kind: "concept", parent: "borrowing", status: "grasped", summary: "Read-only access; any number may coexist, and the owner cannot mutate while they live." },
    { op: "add", id: "mut-ref", title: "Mutable refs &mut T", kind: "concept", parent: "borrowing", status: "grasped", summary: "Exclusive read-write access; no other reference may exist meanwhile, not even the owner's." },
    { op: "update", node: "borrowing", status: "learning" },
  ], b.actor, at);

  at = b.turn({
    user: "Why does borrowing first and mutating later sometimes compile?",
    assistant:
      "Because of **non-lexical lifetimes (NLL)**: a borrow lasts until its *last use*, not until the end of the block.\n\n```rust\nlet mut v = vec![1, 2, 3];\nlet first = &v[0];\nprintln!(\"{first}\"); // last use of `first`\nv.push(4);            // ok: the borrow has ended\n```\n\nMove the `println!` below the `push` and you get E0502 again.",
  });
  applyOps(slug, [
    { op: "add", id: "nll", title: "Non-lexical lifetimes", kind: "mechanism", parent: "borrowing", status: "learning", summary: "A borrow ends at its last use rather than at the end of its lexical scope, so much code that looks wrong is accepted." },
    { op: "link", from: "nll", to: "borrow-rules", relation: "depends-on" },
    { op: "add", id: "two-phase", title: "Two-phase borrows", kind: "mechanism", parent: "nll" },
    { op: "add", id: "iter-mutate", title: "Mutating while iterating", kind: "pitfall", parent: "borrowing", status: "learning", summary: "`for x in &v { v.push(..) }` is rejected: the iterator holds a shared borrow while `push` needs a mutable one." },
    { op: "add", id: "interior", title: "Interior mutability", kind: "concept", parent: "borrowing", status: "learning", summary: "Mutating through `&T` by moving the borrow check from compile time to run time: `Cell`/`RefCell`, or `Mutex` across threads." },
    { op: "add", id: "refcell", title: "RefCell", kind: "mechanism", parent: "interior", status: "learning", summary: "Tracks borrows at run time and panics on conflict. Often paired as `Rc<RefCell<T>>`." },
    { op: "add", id: "cell", title: "Cell", kind: "mechanism", parent: "interior", status: "grasped" },
  ], b.actor, at);

  at = b.turn({
    user: "Lifetime annotations like `'a` still confuse me.",
    assistant:
      "The key: **annotations never change how long anything lives**. They describe relationships between input and output references so the compiler can check them.\n\n```rust\nfn longest<'a>(x: &'a str, y: &'a str) -> &'a str {\n    if x.len() > y.len() { x } else { y }\n}\n```\n\nThe result is valid for no longer than the shorter of `x` and `y`. Most functions need none thanks to three **elision rules**.",
  });
  applyOps(slug, [
    { op: "add", id: "annotations", title: "Annotations 'a", kind: "concept", parent: "lifetimes", status: "learning", summary: "`'a` changes nothing at run time; it states how output references relate to inputs so the compiler can verify them." },
    { op: "add", id: "elision", title: "Elision rules", kind: "mechanism", parent: "lifetimes", status: "learning", summary: "Each input reference gets its own lifetime; a single input lifetime flows to all outputs; `&self` flows to all outputs." },
    { op: "add", id: "dangling", title: "Dangling references", kind: "pitfall", parent: "lifetimes", status: "grasped", summary: "Returning a reference to a local is rejected: the local is gone when the function returns." },
    { op: "add", id: "static", title: "'static", kind: "concept", parent: "lifetimes" },
    { op: "add", id: "variance", title: "Variance", kind: "concept", parent: "lifetimes" },
    { op: "link", from: "annotations", to: "borrow-rules", relation: "depends-on" },
    { op: "update", node: "lifetimes", status: "learning" },
  ], b.actor, at);

  const c = new Session(root, "claude-code", "c4b7d2e1-0f39-4a6b-8e2d-5f1a9c3e7b62", day("2026-10-08", "21:05"));
  at = c.turn({
    user: "Smart pointers next: what problem does each of Box, Rc and Arc solve?",
    assistant:
      "| Type | Solves | Thread-safe |\n|---|---|---|\n| `Box<T>` | Put a value on the heap; recursive types, trait objects | follows `T` |\n| `Rc<T>` | **Shared ownership** within one thread (ref counting) | no |\n| `Arc<T>` | Shared ownership across threads (atomic counting) | yes |\n\n`Rc` and `Arc` only give shared, read-only access; pair them with `RefCell` or `Mutex` to mutate.",
    tools: ["Read"],
  });
  applyOps(slug, [
    { op: "add", id: "box", title: "Box", kind: "mechanism", parent: "smart-pointers", status: "grasped", summary: "Moves a value to the heap and keeps a pointer on the stack: recursive types, large values, `Box<dyn Trait>`." },
    { op: "add", id: "rc", title: "Rc", kind: "mechanism", parent: "smart-pointers", status: "learning", summary: "Single-threaded reference counting for shared ownership; the data is freed when the last `Rc` drops." },
    { op: "add", id: "arc", title: "Arc", kind: "mechanism", parent: "smart-pointers", status: "learning", summary: "The atomic, thread-safe `Rc`, at the cost of slower counter updates." },
    { op: "add", id: "weak", title: "Weak breaks cycles", kind: "mechanism", parent: "rc", status: "learning", summary: "A non-owning pointer that does not keep data alive; `upgrade()` before use. Breaks `Rc` reference cycles." },
    { op: "add", id: "pin", title: "Pin", kind: "concept", parent: "smart-pointers" },
    { op: "link", from: "rc", to: "arc", relation: "contrasts" },
    { op: "link", from: "rc", to: "refcell", relation: "leads-to", label: "Rc<RefCell<T>>" },
    { op: "update", node: "smart-pointers", status: "learning" },
  ], c.actor, at);

  at = c.turn({
    user: "Finally, concurrency: what is the difference between Send and Sync?",
    assistant:
      "- **`Send`** — ownership can safely *move* to another thread.\n- **`Sync`** — `&T` can safely be *shared* between threads (i.e. `&T: Send`).\n\n`Rc` is neither; `Arc<T>` is both when `T: Send + Sync`; `RefCell` is `Send` but not `Sync`. That is why `Arc<Mutex<T>>` is the standard way to share mutable state across threads.",
  });
  applyOps(slug, [
    { op: "add", id: "send-sync", title: "Send & Sync", kind: "concept", parent: "concurrency", status: "learning", summary: "`Send`: ownership may cross threads. `Sync`: references may be shared across threads. Derived automatically; implementing by hand needs `unsafe`." },
    { op: "add", id: "mutex", title: "Mutex", kind: "mechanism", parent: "concurrency", status: "learning", summary: "Mutual exclusion with an RAII guard; `Arc<Mutex<T>>` shares mutable state between threads." },
    { op: "add", id: "channels", title: "Channels", kind: "mechanism", parent: "concurrency", summary: "Communicate by sending ownership instead of sharing memory: once sent, the sender can no longer touch the value." },
    { op: "add", id: "scoped", title: "Scoped threads", kind: "mechanism", parent: "concurrency" },
    { op: "add", id: "atomics", title: "Atomics", kind: "concept", parent: "concurrency" },
    { op: "link", from: "arc", to: "send-sync", relation: "depends-on" },
    { op: "link", from: "refcell", to: "mutex", relation: "contrasts", label: "one thread vs many" },
    { op: "link", from: "mutexguard", to: "mutex", relation: "leads-to" },
    { op: "touch", nodes: ["mutexguard", "refcell"] },
    { op: "update", node: "concurrency", status: "learning" },
  ], c.actor, at);
}

// ---------- ideation ----------
{
  const s = new Session(root, "codex", "01a1d3e7-5c2b-7f90-a8c4-9e6b1d2f4a73", day("2026-10-09", "14:00"));
  const slug = createMap({
    title: "A local-first notes sync tool",
    slug: "local-first-notes",
    purpose: "Shape a sync tool for heavy Markdown users: offline first, end-to-end encrypted, files stay plain",
    lens: {
      pillar: "The questions that decide whether the project works",
      kinds: [
        { id: "question", label: "Question" },
        { id: "option", label: "Option" },
        { id: "feature", label: "Feature" },
        { id: "risk", label: "Risk" },
        { id: "decision", label: "Decision" },
      ],
      statuses: [
        { id: "open", label: "Open", tone: "open" },
        { id: "exploring", label: "Exploring", tone: "active" },
        { id: "decided", label: "Decided", tone: "settled" },
        { id: "rejected", label: "Rejected", tone: "muted" },
      ],
      relations: [
        { id: "enables", label: "enables" },
        { id: "conflicts", label: "conflicts with" },
        { id: "alternative-to", label: "alternative to" },
        { id: "mitigates", label: "mitigates" },
      ],
    },
  }, s.actor, s.clock);
  let at = s.turn({ user: "Help me think through a local-first notes sync tool.", assistant: "Five pillars first: **who it is for**, **the core problem**, **why we win**, **hard constraints**, and **what success looks like**." });
  applyOps(slug, [
    { op: "add", id: "users", title: "Who it's for", kind: "question", status: "exploring", summary: "Heavy Markdown writers and developers who keep thousands of notes as plain files across several devices." },
    { op: "add", id: "problem", title: "Core problem", kind: "question", status: "exploring" },
    { op: "add", id: "value", title: "Why we win", kind: "question" },
    { op: "add", id: "constraints", title: "Hard constraints", kind: "question", status: "exploring" },
    { op: "add", id: "success", title: "What success is", kind: "question" },
  ], s.actor, at);
  at = s.turn({ user: "Sync engine: CRDTs or file-level three-way merge?", assistant: "Given *files are the truth*, I'd pick **three-way merge** with paragraph-level auto-merge; CRDTs need a side log that breaks that promise.", tools: ["web_search"] });
  applyOps(slug, [
    { op: "add", id: "engine", title: "Sync engine", kind: "question", parent: "constraints", status: "decided", summary: "Decided: files are the single source of truth; three-way merge with paragraph-level auto-merge." },
    { op: "add", id: "crdt", title: "CRDT (Automerge)", kind: "option", parent: "engine", status: "rejected", summary: "Best merging, but needs a side operation log that breaks “the files are everything”. Rejected." },
    { op: "add", id: "three-way", title: "Three-way merge", kind: "option", parent: "engine", status: "decided", summary: "Git-style base/ours/theirs merge at paragraph granularity; remaining conflicts go to the user." },
    { op: "add", id: "conflict-ui", title: "Conflict view", kind: "feature", parent: "three-way", status: "exploring" },
    { op: "link", from: "crdt", to: "three-way", relation: "alternative-to" },
    { op: "add", id: "e2ee", title: "End-to-end encryption", kind: "decision", parent: "value", status: "decided", summary: "The server only stores encrypted chunks; keys never leave the user's devices." },
    { op: "add", id: "byo", title: "Bring your own S3", kind: "feature", parent: "value", status: "exploring" },
    { op: "add", id: "key-loss", title: "Lost keys are lost data", kind: "risk", parent: "e2ee" },
    { op: "add", id: "teams", title: "Team collaboration", kind: "option", parent: "users", status: "rejected", summary: "Would drag the product toward real-time editing and permissions. Not in v1." },
    { op: "add", id: "lock-in", title: "Format lock-in", kind: "question", parent: "problem", status: "decided" },
    { op: "add", id: "retention", title: "40% 30-day retention", kind: "decision", parent: "success" },
    { op: "link", from: "e2ee", to: "byo", relation: "enables" },
  ], s.actor, at);
}

// ---------- decision: pillars only ----------
{
  const s = new Session(root, "claude-code", "9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d", day("2026-10-02", "20:00"));
  const slug = createMap({
    title: "Choosing a frontend framework",
    slug: "pick-a-framework",
    purpose: "Pick the framework for rewriting our design system",
    lens: {
      pillar: "The dimensions that decide this choice",
      kinds: [{ id: "criterion", label: "Criterion" }],
      statuses: [
        { id: "unknown", label: "Unknown", tone: "open" },
        { id: "weighing", label: "Weighing", tone: "active" },
        { id: "clear", label: "Clear", tone: "settled" },
      ],
      relations: [{ id: "supports", label: "supports" }],
    },
  }, s.actor, s.clock);
  const at = s.turn({ user: "Which dimensions should drive the choice?", assistant: "Team familiarity, ecosystem maturity, rendering performance, long-term maintenance risk and migration cost." });
  applyOps(slug, [
    { op: "add", title: "Team familiarity", kind: "criterion", status: "weighing" },
    { op: "add", title: "Ecosystem", kind: "criterion" },
    { op: "add", title: "Performance", kind: "criterion" },
    { op: "add", title: "Maintenance risk", kind: "criterion" },
    { op: "add", title: "Migration cost", kind: "criterion", status: "clear" },
  ], s.actor, at);
}

console.log(`english fixtures written to ${root}`);
