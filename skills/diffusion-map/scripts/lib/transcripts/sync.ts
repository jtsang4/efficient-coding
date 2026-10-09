// Keep a private copy of each linked transcript, appending only the bytes added since the last sync.
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AgentKind } from "../model";
import { locateTranscript } from "../session";

type SyncMeta = { source: string; offset: number; headLen: number; headHash: string; syncedAt: string };

const HEAD = 4096;

export const snapshotPath = (dir: string, agent: AgentKind, id: string) => join(dir, `${agent}-${id}.jsonl`);
const metaPath = (dir: string, agent: AgentKind, id: string) => join(dir, `${agent}-${id}.sync.json`);

function readRange(path: string, start: number, length: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(length);
    const read = readSync(fd, buf, 0, length, start);
    return buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

const hash = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");

/** Only complete lines are copied, so a line the agent is still writing is picked up next time. */
function completeLength(buf: Buffer): number {
  const lastNewline = buf.lastIndexOf(0x0a);
  return lastNewline < 0 ? 0 : lastNewline + 1;
}

export type SyncResult = { snapshot: string | null; source: string | null; mode: "append" | "full" | "unchanged" | "missing" };

export function syncTranscript(dir: string, agent: AgentKind, id: string, source = locateTranscript(agent, id)): SyncResult {
  const snap = snapshotPath(dir, agent, id);
  const metaFile = metaPath(dir, agent, id);
  if (!source || !existsSync(source)) return { snapshot: existsSync(snap) ? snap : null, source: null, mode: "missing" };

  mkdirSync(dir, { recursive: true });
  const size = statSync(source).size;
  const meta: SyncMeta | null = existsSync(metaFile) && existsSync(snap) ? JSON.parse(readFileSync(metaFile, "utf8")) : null;
  const write = (m: Omit<SyncMeta, "syncedAt">) => writeFileSync(metaFile, JSON.stringify({ ...m, syncedAt: new Date().toISOString() }));

  const sameFile =
    meta &&
    meta.source === source &&
    size >= meta.offset &&
    size >= meta.headLen &&
    hash(readRange(source, 0, meta.headLen)) === meta.headHash;

  if (sameFile) {
    if (size === meta.offset) return { snapshot: snap, source, mode: "unchanged" };
    const tail = readRange(source, meta.offset, size - meta.offset);
    const len = completeLength(tail);
    if (len === 0) return { snapshot: snap, source, mode: "unchanged" };
    appendFileSync(snap, tail.subarray(0, len));
    write({ ...meta, offset: meta.offset + len });
    return { snapshot: snap, source, mode: "append" };
  }

  // First sync, or the source was truncated/replaced: copy it whole, trimmed to complete lines.
  copyFileSync(source, snap);
  const all = readFileSync(snap);
  const len = completeLength(all);
  if (len !== all.length) writeFileSync(snap, all.subarray(0, len));
  const headLen = Math.min(HEAD, len);
  write({ source, offset: len, headLen, headHash: hash(all.subarray(0, headLen)) });
  return { snapshot: snap, source, mode: "full" };
}
