import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseClaudeCode, parseCodex, relevantRanges } from "./transcripts/parse";
import { syncTranscript } from "./transcripts/sync";
import { detectActor } from "./session";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "dm-tx-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lines = (...objs: unknown[]) => objs.map((o) => JSON.stringify(o)).join("\n") + "\n";

describe("incremental snapshot", () => {
  test("first sync copies, later syncs append only complete new lines", () => {
    const src = join(dir, "src.jsonl");
    const snapDir = join(dir, "snap");
    writeFileSync(src, lines({ a: 1 }, { a: 2 }));
    expect(syncTranscript(snapDir, "codex", "x", src).mode).toBe("full");
    expect(syncTranscript(snapDir, "codex", "x", src).mode).toBe("unchanged");

    appendFileSync(src, lines({ a: 3 }) + '{"a":4');
    expect(syncTranscript(snapDir, "codex", "x", src).mode).toBe("append");
    const snap = join(snapDir, "codex-x.jsonl");
    expect(readFileSync(snap, "utf8")).toBe(lines({ a: 1 }, { a: 2 }, { a: 3 }));

    appendFileSync(src, "}\n");
    syncTranscript(snapDir, "codex", "x", src);
    expect(readFileSync(snap, "utf8")).toBe(lines({ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }));
  });

  test("truncated or rewritten sources are copied again in full", () => {
    const src = join(dir, "src.jsonl");
    const snapDir = join(dir, "snap");
    writeFileSync(src, lines({ a: 1 }, { a: 2 }));
    syncTranscript(snapDir, "claude-code", "y", src);
    writeFileSync(src, lines({ b: 1 }));
    expect(syncTranscript(snapDir, "claude-code", "y", src).mode).toBe("full");
    writeFileSync(src, lines({ c: 1 }, { c: 2 }, { c: 3 }));
    expect(syncTranscript(snapDir, "claude-code", "y", src).mode).toBe("full");
    expect(readFileSync(join(snapDir, "claude-code-y.jsonl"), "utf8")).toBe(lines({ c: 1 }, { c: 2 }, { c: 3 }));
  });

  test("a vanished source falls back to the snapshot", () => {
    const src = join(dir, "src.jsonl");
    const snapDir = join(dir, "snap");
    writeFileSync(src, lines({ a: 1 }));
    syncTranscript(snapDir, "codex", "z", src);
    rmSync(src);
    const r = syncTranscript(snapDir, "codex", "z", null);
    expect(r).toEqual({ snapshot: join(snapDir, "codex-z.jsonl"), source: null, mode: "missing" });
  });
});

describe("claude code parser", () => {
  test("keeps text, collapses tools, drops meta and reminders", () => {
    const raw = lines(
      { type: "user", uuid: "u1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: [{ type: "text", text: "<system-reminder>ctx</system-reminder>What is borrowing?" }] } },
      { type: "user", uuid: "m1", isMeta: true, timestamp: "2026-01-01T00:00:01Z", message: { role: "user", content: "meta" } },
      { type: "assistant", uuid: "a1", timestamp: "2026-01-01T00:00:02Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }] } },
      { type: "assistant", uuid: "a2", timestamp: "2026-01-01T00:00:03Z", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }] } },
      { type: "user", uuid: "r1", timestamp: "2026-01-01T00:00:04Z", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
      { type: "assistant", uuid: "a3", timestamp: "2026-01-01T00:00:05Z", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }, { type: "tool_use", name: "Read" }] } },
      { type: "assistant", uuid: "a4", timestamp: "2026-01-01T00:00:06Z", message: { role: "assistant", content: [{ type: "text", text: "Borrowing lends access." }] } },
      { type: "assistant", uuid: "a5", timestamp: "2026-01-01T00:00:07Z", message: { role: "assistant", content: [{ type: "text", text: "More." }] } },
      { type: "user", uuid: "u2", isSidechain: true, timestamp: "2026-01-01T00:00:08Z", message: { role: "user", content: "subagent" } },
      { type: "user", uuid: "u3", timestamp: "2026-01-01T00:00:09Z", message: { role: "user", content: "<command-name>/clear</command-name><command-args></command-args>" } },
    );
    expect(parseClaudeCode(raw)).toEqual([
      { kind: "message", key: "u1", role: "user", text: "What is borrowing?", at: "2026-01-01T00:00:00Z" },
      { kind: "tools", key: "a2:0", at: "2026-01-01T00:00:03Z", tools: { Bash: 2, Read: 1 } },
      { kind: "message", key: "a4:0", role: "assistant", text: "Borrowing lends access.\n\nMore.", at: "2026-01-01T00:00:06Z" },
      { kind: "message", key: "u3", role: "user", text: "/clear", at: "2026-01-01T00:00:09Z" },
    ]);
  });

  test("forked copies dedupe on the original uuid", () => {
    const msg = { role: "user", content: "hi" };
    const raw = lines(
      { type: "user", uuid: "orig", timestamp: "t1", message: msg },
      { type: "user", uuid: "copy", forkedFrom: { messageUuid: "orig", sessionId: "old" }, timestamp: "t1", message: msg },
    );
    expect(parseClaudeCode(raw)).toHaveLength(1);
  });
});

describe("codex parser", () => {
  test("drops injected context and developer messages, collapses calls", () => {
    const item = (payload: unknown, timestamp: string) => ({ type: "response_item", timestamp, payload });
    const raw = lines(
      { type: "session_meta", timestamp: "t0", payload: { id: "x" } },
      item({ type: "message", role: "developer", content: [{ type: "input_text", text: "rules" }] }, "t1"),
      item({ type: "message", role: "user", id: "u0", content: [{ type: "input_text", text: "# AGENTS.md instructions for /x\n..." }, { type: "input_text", text: "<environment_context>\n<cwd>/x</cwd>\n</environment_context>" }] }, "t2"),
      item({ type: "message", role: "user", id: "u1", content: [{ type: "input_text", text: "Explain CRDTs" }] }, "t3"),
      item({ type: "reasoning", id: "r1", summary: [] }, "t4"),
      item({ type: "function_call", id: "f1", name: "exec_command" }, "t5"),
      item({ type: "function_call_output", call_id: "f1", output: "" }, "t6"),
      item({ type: "custom_tool_call", id: "c1", name: "apply_patch" }, "t7"),
      item({ type: "message", role: "assistant", id: "a1", phase: "final_answer", content: [{ type: "output_text", text: "CRDTs merge." }] }, "t8"),
    );
    expect(parseCodex(raw)).toEqual([
      { kind: "message", key: "u1", role: "user", text: "Explain CRDTs", at: "t3" },
      { kind: "tools", key: "f1", at: "t5", tools: { exec_command: 1, apply_patch: 1 } },
      { kind: "message", key: "a1", role: "assistant", text: "CRDTs merge.", at: "t8" },
    ]);
  });
});

describe("relevant ranges", () => {
  test("each link time maps to the turn that contains it", () => {
    const items = [
      { kind: "message", key: "1", role: "user", text: "q1", at: "2026-01-01T00:00:00Z" },
      { kind: "message", key: "2", role: "assistant", text: "a1", at: "2026-01-01T00:00:05Z" },
      { kind: "message", key: "3", role: "user", text: "q2", at: "2026-01-01T00:01:00Z" },
      { kind: "tools", key: "4", at: "2026-01-01T00:01:02Z", tools: {} },
      { kind: "message", key: "5", role: "assistant", text: "a2", at: "2026-01-01T00:01:09Z" },
      { kind: "message", key: "6", role: "user", text: "q3", at: "2026-01-01T00:02:00Z" },
    ] as const;
    expect(relevantRanges([...items], ["2026-01-01T00:01:03Z", "2026-01-01T00:01:04Z"])).toEqual([[2, 4]]);
    expect(relevantRanges([...items], ["2026-01-01T00:00:03Z", "2026-01-01T00:03:00Z"])).toEqual([[0, 1], [5, 5]]);
  });
});

describe("session detection", () => {
  test("claude code, codex, explicit override, none", () => {
    expect(detectActor({}, { CLAUDE_CODE_SESSION_ID: "c1" }).agent).toBe("claude-code");
    expect(detectActor({}, { CODEX_THREAD_ID: "x1" })).toMatchObject({ agent: "codex", sessionId: "x1" });
    expect(detectActor({ agent: "codex", session: "y" }, { CLAUDE_CODE_SESSION_ID: "c1" }).sessionId).toBe("y");
    expect(detectActor({}, {}).agent).toBeNull();
  });

  test("an agent nested inside the other is resolved by the nearest ancestor", () => {
    const env = { CLAUDE_CODE_SESSION_ID: "c1", CODEX_THREAD_ID: "x1" };
    expect(detectActor({}, env, () => "codex")).toMatchObject({ agent: "codex", sessionId: "x1" });
    expect(detectActor({}, env, () => "claude-code")).toMatchObject({ agent: "claude-code", sessionId: "c1" });
    expect(detectActor({}, { ...env, CODEX_SANDBOX: "seatbelt" }, () => null).agent).toBe("codex");
    expect(detectActor({}, env, () => null).agent).toBe("claude-code");
  });
});
