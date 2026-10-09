// Shared between the CLI and the server: where the running viewer records itself.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dataHome } from "./store";

export const DEFAULT_PORT = 4785;
export const APP_ID = "diffusion-map";

export type ServerInfo = { pid: number; port: number; startedAt: string; idleMs: number };

export const serverInfoPath = () => join(dataHome(), "server.json");

export function readServerInfo(): ServerInfo | null {
  try {
    return existsSync(serverInfoPath()) ? JSON.parse(readFileSync(serverInfoPath(), "utf8")) : null;
  } catch {
    return null;
  }
}

export async function healthCheck(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    return res.ok && (await res.json()).app === APP_ID;
  } catch {
    return false;
  }
}

export function parseDuration(text: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text.trim());
  if (!m) throw new Error(`invalid duration: ${text} (examples: 45s, 30m, 2h)`);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[(m[2] ?? "m") as "ms" | "s" | "m" | "h"];
  return Math.round(Number(m[1]) * unit);
}
