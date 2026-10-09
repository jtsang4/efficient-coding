// Shared pieces for building synthetic maps and transcripts (no real conversations).
import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Actor, AgentKind } from "../../scripts/lib/model";

/** Point every data location at `root` and return the store API bound to it. */
export async function useHome(root: string) {
  rmSync(root, { recursive: true, force: true });
  process.env.DIFFUSION_HOME = join(root, "diffusion");
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  return import("../../scripts/lib/store");
}

export type Turn = { user: string; assistant: string; tools?: string[] };

export class Session {
  private path: string;
  private n = 0;
  constructor(
    readonly root: string,
    readonly agent: AgentKind,
    readonly id: string,
    public clock: Date,
  ) {
    if (agent === "claude-code") {
      const dir = join(root, "claude", "projects", "-Users-demo-notes");
      mkdirSync(dir, { recursive: true });
      this.path = join(dir, `${id}.jsonl`);
    } else {
      const d = clock.toISOString().slice(0, 10).split("-");
      const dir = join(root, "codex", "sessions", d[0]!, d[1]!, d[2]!);
      mkdirSync(dir, { recursive: true });
      this.path = join(dir, `rollout-${clock.toISOString().slice(0, 19).replaceAll(":", "-")}-${id}.jsonl`);
      this.line({ type: "session_meta", timestamp: clock.toISOString(), payload: { id, cwd: "/Users/demo/notes" } });
      this.line(this.codexItem({ type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>\n<cwd>/Users/demo/notes</cwd>\n</environment_context>" }] }));
    }
  }
  get actor(): Actor {
    return { agent: this.agent, sessionId: this.id, cwd: "/Users/demo/notes" };
  }
  private line(obj: unknown) {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
  private tick(seconds: number) {
    this.clock = new Date(this.clock.getTime() + seconds * 1000);
    return this.clock.toISOString();
  }
  private codexItem(payload: Record<string, unknown>) {
    return { type: "response_item", timestamp: this.clock.toISOString(), payload: { id: `i${++this.n}`, ...payload } };
  }
  /** Writes one turn and returns the moment the agent updated the map during it. */
  turn(t: Turn): Date {
    const k = ++this.n;
    if (this.agent === "claude-code") {
      this.line({ type: "user", uuid: `u${k}`, timestamp: this.tick(5), message: { role: "user", content: t.user } });
      for (const tool of t.tools ?? []) this.line({ type: "assistant", uuid: `t${k}${tool}`, timestamp: this.tick(4), message: { role: "assistant", content: [{ type: "tool_use", name: tool }] } });
    } else {
      this.tick(5);
      this.line(this.codexItem({ type: "message", role: "user", content: [{ type: "input_text", text: t.user }] }));
      for (const tool of t.tools ?? []) {
        this.tick(4);
        this.line(this.codexItem({ type: "function_call", name: tool }));
      }
    }
    const linkAt = new Date(this.tick(20));
    if (this.agent === "claude-code") this.line({ type: "assistant", uuid: `a${k}`, timestamp: this.tick(6), message: { role: "assistant", content: [{ type: "text", text: t.assistant }] } });
    else {
      this.tick(6);
      this.line(this.codexItem({ type: "message", role: "assistant", content: [{ type: "output_text", text: t.assistant }] }));
    }
    this.tick(90);
    return linkAt;
  }
}

export const day = (d: string, hm: string) => new Date(`${d}T${hm}:00+08:00`);

