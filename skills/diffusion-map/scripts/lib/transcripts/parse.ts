// Normalize Claude Code and Codex transcripts into the same readable conversation shape:
// user and agent text up front, tool activity collapsed into one summary row per run.
import type { AgentKind } from "../model";

export type ConversationItem =
  | { kind: "message"; key: string; role: "user" | "assistant"; text: string; at: string }
  | { kind: "tools"; key: string; at: string; tools: Record<string, number> };

class Builder {
  items: ConversationItem[] = [];
  private seen = new Set<string>();

  text(role: "user" | "assistant", text: string, at: string, key: string) {
    const clean = text.trim();
    if (!clean || this.seen.has(key)) return;
    this.seen.add(key);
    const last = this.items.at(-1);
    // One assistant reply is often split across several transcript entries; read it as one message.
    if (role === "assistant" && last?.kind === "message" && last.role === "assistant") {
      last.text += `\n\n${clean}`;
      return;
    }
    this.items.push({ kind: "message", key, role, text: clean, at });
  }

  tool(name: string, at: string, key: string) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const last = this.items.at(-1);
    if (last?.kind === "tools") {
      last.tools[name] = (last.tools[name] ?? 0) + 1;
      return;
    }
    this.items.push({ kind: "tools", key, at, tools: { [name]: 1 } });
  }
}

function parseLines(raw: string, each: (obj: any, lineNo: number) => void) {
  raw.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try {
      each(JSON.parse(line), i);
    } catch {}
  });
}

// ---------- Claude Code ----------

function cleanClaudeUserText(text: string): string {
  let out = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  const command = out.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (command) {
    const args = out.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
    return [command[1]!.trim(), args].filter(Boolean).join(" ");
  }
  out = out.replace(/<(local-command-stdout|local-command-stderr|local-command-caveat|command-message)>[\s\S]*?<\/\1>/g, "");
  return out.trim();
}

export function parseClaudeCode(raw: string): ConversationItem[] {
  const b = new Builder();
  parseLines(raw, (e) => {
    if (e.isSidechain || e.isMeta) return;
    const at: string = e.timestamp ?? "";
    const key: string = e.forkedFrom?.messageUuid ?? e.uuid ?? `${at}`;
    const content = e.message?.content;
    if (e.type === "user") {
      if (typeof content === "string") return b.text("user", cleanClaudeUserText(content), at, key);
      if (!Array.isArray(content)) return;
      const parts = content.flatMap((c: any) =>
        c.type === "text" ? [cleanClaudeUserText(c.text ?? "")] : c.type === "image" ? ["[图片]"] : [],
      );
      b.text("user", parts.filter(Boolean).join("\n\n"), at, key);
      return;
    }
    if (e.type === "assistant" && Array.isArray(content)) {
      content.forEach((c: any, i: number) => {
        if (c.type === "text") b.text("assistant", c.text ?? "", at, `${key}:${i}`);
        else if (c.type === "tool_use") b.tool(c.name ?? "tool", at, `${key}:${i}`);
      });
    }
  });
  return b.items;
}

// ---------- Codex ----------

// Codex injects environment, AGENTS.md, skill bodies, etc. as user messages wrapped in a single tag.
const INJECTED = /^\s*<([A-Za-z_][\w:-]*)\b[^>]*>[\s\S]*<\/\1>\s*$/;
const AGENTS_MD = /^\s*# AGENTS\.md instructions/;

export function parseCodex(raw: string): ConversationItem[] {
  const b = new Builder();
  parseLines(raw, (e, lineNo) => {
    // Current rollouts wrap items as {type: "response_item", payload}; older ones store items bare.
    const item = e.type === "response_item" ? e.payload : e.payload ? null : e;
    if (!item?.type) return;
    const at: string = e.timestamp ?? "";
    const key: string = item.id ?? item.call_id ?? `line${lineNo}`;
    if (item.type === "message") {
      const blocks: any[] = Array.isArray(item.content) ? item.content : [];
      if (item.role === "user") {
        const parts = blocks.flatMap((c) => {
          if (c.type === "input_image") return ["[图片]"];
          if (c.type !== "input_text" || typeof c.text !== "string") return [];
          if (/^\s*<image\b/.test(c.text)) return [];
          if (INJECTED.test(c.text) || AGENTS_MD.test(c.text)) return [];
          return [c.text];
        });
        b.text("user", parts.join("\n\n"), at, key);
      } else if (item.role === "assistant") {
        b.text("assistant", blocks.map((c) => (c.type === "output_text" ? c.text ?? "" : "")).join(""), at, key);
      }
      return;
    }
    if (item.type.endsWith("_call")) b.tool(item.name ?? item.type.replace(/_call$/, ""), at, key);
  });
  return b.items;
}

export function parseTranscript(agent: AgentKind, raw: string): ConversationItem[] {
  return agent === "claude-code" ? parseClaudeCode(raw) : parseCodex(raw);
}

/**
 * Map link timestamps to the turns they belong to: a node linked at time T was discussed in the
 * turn opened by the last user message at or before T, up to the next user message.
 */
export function relevantRanges(items: ConversationItem[], linkTimes: string[]): Array<[number, number]> {
  const userIdx = items.flatMap((it, i) => (it.kind === "message" && it.role === "user" ? [i] : []));
  if (userIdx.length === 0) return items.length ? [[0, items.length - 1]] : [];
  const ranges = new Map<number, [number, number]>();
  for (const t of linkTimes) {
    let start = userIdx[0]!;
    for (const i of userIdx) if (items[i]!.at && items[i]!.at <= t) start = i;
    const next = userIdx.find((i) => i > start);
    ranges.set(start, [start, (next ?? items.length) - 1]);
  }
  return [...ranges.values()].sort((a, b) => a[0] - b[0]);
}
