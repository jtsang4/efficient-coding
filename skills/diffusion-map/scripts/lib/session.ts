// Which agent session is running this command, and where its transcript lives on disk.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Actor, AgentKind } from "./model";

export const AGENTS: AgentKind[] = ["claude-code", "codex"];

export function detectActor(override: { agent?: string; session?: string } = {}, env = process.env, nearest = nearestAgentAncestor): Actor {
  const cwd = process.cwd();
  if (override.agent || override.session) {
    if (!override.agent || !override.session) throw new Error("--agent and --session must be given together");
    if (!AGENTS.includes(override.agent as AgentKind)) throw new Error(`--agent must be one of ${AGENTS.join(", ")}`);
    return { agent: override.agent as AgentKind, sessionId: override.session, cwd };
  }
  const claude = env.CLAUDE_CODE_SESSION_ID;
  const codex = env.CODEX_THREAD_ID;
  // One agent launched inside the other inherits both variables; the closer process wins.
  // Codex's sandbox hides the process tree, but its sandboxed commands carry CODEX_SANDBOX.
  if (claude && codex) {
    const inner = nearest() ?? (env.CODEX_SANDBOX ? "codex" : null);
    return inner === "codex" ? { agent: "codex", sessionId: codex, cwd } : { agent: "claude-code", sessionId: claude, cwd };
  }
  if (claude) return { agent: "claude-code", sessionId: claude, cwd };
  if (codex) return { agent: "codex", sessionId: codex, cwd };
  return { agent: null, sessionId: null, cwd };
}

/** Walk up the process tree to the first ancestor that is Claude Code or Codex. */
export function nearestAgentAncestor(): AgentKind | null {
  try {
    const out = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid=,command="]).stdout.toString();
    const procs = new Map<number, { ppid: number; command: string }>();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (m) procs.set(Number(m[1]), { ppid: Number(m[2]), command: m[3]! });
    }
    for (let pid = process.ppid, hops = 0; pid > 1 && hops < 64; hops++) {
      const p = procs.get(pid);
      if (!p) break;
      const exe = p.command.split(/\s+/)[0]!.split("/").pop()!.toLowerCase();
      if (exe === "codex" || /\/codex(\s|$)/.test(p.command.split(/\s+/)[0]!)) return "codex";
      if (exe === "claude" || /claude-code|@anthropic-ai\/claude/.test(p.command)) return "claude-code";
      pid = p.ppid;
    }
  } catch {}
  return null;
}

const claudeHome = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");

const safeList = (dir: string) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/** Locate the agent's own transcript file for a session, or null if it no longer exists. */
export function locateTranscript(agent: AgentKind, sessionId: string): string | null {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) return null;
  if (agent === "claude-code") {
    const projects = join(claudeHome(), "projects");
    for (const project of safeList(projects)) {
      const candidate = join(projects, project, `${sessionId}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
  const suffix = `-${sessionId}.jsonl`;
  const archived = join(codexHome(), "archived_sessions");
  // Newest days first: a live session is almost always recent.
  const sessions = join(codexHome(), "sessions");
  for (const y of safeList(sessions).sort().reverse())
    for (const m of safeList(join(sessions, y)).sort().reverse())
      for (const d of safeList(join(sessions, y, m)).sort().reverse()) {
        const hit = safeList(join(sessions, y, m, d)).find((f) => f.endsWith(suffix));
        if (hit) return join(sessions, y, m, d, hit);
      }
  const hit = safeList(archived).find((f) => f.endsWith(suffix));
  return hit ? join(archived, hit) : null;
}
