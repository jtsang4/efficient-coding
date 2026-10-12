// Shared between the CLI and the server: where the running viewer records itself.
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { dataHome } from "./store";

export const DEFAULT_PORT = 4785;
// All interfaces by default, so other devices on the network can open the viewer too.
export const DEFAULT_HOST = "0.0.0.0";
export const APP_ID = "diffusion-map";

export type ServerInfo = { pid: number; port: number; host: string; startedAt: string; idleMs: number };

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

/** Addresses to print for a viewer: this machine first, then every LAN address when it listens on all interfaces. */
export function viewerUrls(host: string, port: number, path = "/"): string[] {
  const urls = [`http://127.0.0.1:${port}${path}`];
  const wildcard = host === "0.0.0.0" || host === "::";
  if (!wildcard && host !== "127.0.0.1" && host !== "localhost") return [`http://${host}:${port}${path}`];
  if (wildcard)
    for (const list of Object.values(networkInterfaces()))
      for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) urls.push(`http://${a.address}:${port}${path}`);
  return urls;
}

export function parseDuration(text: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text.trim());
  if (!m) throw new Error(`invalid duration: ${text} (examples: 45s, 30m, 2h)`);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[(m[2] ?? "m") as "ms" | "s" | "m" | "h"];
  return Math.round(Number(m[1]) * unit);
}
