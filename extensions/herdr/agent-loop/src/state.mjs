import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export const STATE_SCHEMA_VERSION = 1;

export function createRunId(now = new Date(), random = Math.random) {
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(5, "0").slice(0, 5);
  return `${timestamp}-${suffix}`;
}

export function shortRunId(runId) {
  return runId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase();
}

export class StateStore {
  constructor(rootDir) {
    if (!rootDir) throw new Error("State directory is required");
    this.rootDir = path.resolve(rootDir);
    this.runsDir = path.join(this.rootDir, "runs");
  }

  async init() {
    await mkdir(this.runsDir, { recursive: true });
  }

  runDir(runId) {
    return path.join(this.runsDir, runId);
  }

  runFile(runId) {
    return path.join(this.runDir(runId), "run.json");
  }

  inboxDir(runId) {
    return path.join(this.runDir(runId), "inbox");
  }

  resultsDir(runId) {
    return path.join(this.runDir(runId), "results");
  }

  async createRun(run) {
    await this.init();
    await mkdir(this.inboxDir(run.run_id), { recursive: true });
    await mkdir(this.resultsDir(run.run_id), { recursive: true });
    const now = new Date().toISOString();
    const value = {
      schema_version: STATE_SCHEMA_VERSION,
      status: "starting",
      agents: [],
      created_at: now,
      updated_at: now,
      ...run,
    };
    await this.writeRun(value);
    return value;
  }

  async readRun(runId) {
    return readJson(this.runFile(runId));
  }

  async writeRun(run) {
    run.updated_at = new Date().toISOString();
    await atomicWriteJson(this.runFile(run.run_id), run);
  }

  async updateRun(runId, updater) {
    return this.withRunLock(runId, async () => {
      const run = await this.readRun(runId);
      const updated = (await updater(run)) ?? run;
      await this.writeRun(updated);
      return updated;
    });
  }

  async listRuns({ activeOnly = false, sessionKey = null } = {}) {
    await this.init();
    const entries = await readdir(this.runsDir, { withFileTypes: true });
    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const run = await this.readRun(entry.name);
        const sessionMatches = !sessionKey || run.session_key === sessionKey;
        if (sessionMatches && (!activeOnly || ["starting", "active", "paused", "blocked"].includes(run.status))) {
          runs.push(run);
        }
      } catch {
        // A partial or externally removed run must not break unrelated event delivery.
      }
    }
    return runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async findActiveByWorkspace(workspaceId, sessionKey = null) {
    const runs = await this.listRuns({ activeOnly: true, sessionKey });
    return runs.find((run) => run.workspace_id === workspaceId) ?? null;
  }

  async findByPane(paneId, sessionKey = null) {
    const runs = await this.listRuns({ activeOnly: true, sessionKey });
    for (const run of runs) {
      if (run.orchestrator?.pane_id === paneId) {
        return { run, member: run.orchestrator };
      }
      const member = run.agents?.find((agent) => agent.pane_id === paneId);
      if (member) return { run, member };
    }
    return null;
  }

  async enqueue(runId, event) {
    const eventId = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const item = {
      id: eventId,
      created_at: new Date().toISOString(),
      delivered_at: null,
      acknowledged_at: null,
      ...event,
    };
    await atomicWriteJson(path.join(this.inboxDir(runId), `${eventId}.json`), item);
    return item;
  }

  async listInbox(runId, { undeliveredOnly = false, unacknowledgedOnly = false } = {}) {
    await mkdir(this.inboxDir(runId), { recursive: true });
    const names = (await readdir(this.inboxDir(runId))).filter((name) => name.endsWith(".json")).sort();
    const items = [];
    for (const name of names) {
      const item = await readJson(path.join(this.inboxDir(runId), name));
      if (undeliveredOnly && item.delivered_at) continue;
      if (unacknowledgedOnly && item.acknowledged_at) continue;
      items.push(item);
    }
    return items;
  }

  async markInbox(runId, ids, field) {
    const timestamp = new Date().toISOString();
    for (const id of ids) {
      const filename = path.join(this.inboxDir(runId), `${id}.json`);
      const item = await readJson(filename);
      item[field] = timestamp;
      await atomicWriteJson(filename, item);
    }
  }

  async writeResult(runId, agentName, result) {
    const safeName = agentName.replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = `${Date.now()}-${safeName}.json`;
    const value = {
      created_at: new Date().toISOString(),
      agent: agentName,
      ...result,
    };
    const target = path.join(this.resultsDir(runId), filename);
    await atomicWriteJson(target, value);
    return target;
  }

  async withRunLock(runId, callback, options = {}) {
    return withDirectoryLock(path.join(this.runDir(runId), ".run-lock"), callback, options);
  }

  async withDeliveryLock(runId, callback, options = {}) {
    return withDirectoryLock(path.join(this.runDir(runId), ".delivery-lock"), callback, options);
  }

  async withWorkspaceLock(workspaceId, callback, { sessionKey = "default", ...options } = {}) {
    const safeId = createHash("sha256").update(`${sessionKey}\0${workspaceId}`).digest("hex").slice(0, 24);
    return withDirectoryLock(path.join(this.rootDir, ".workspace-locks", safeId), callback, options);
  }
}

export async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

export async function atomicWriteJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

export async function withDirectoryLock(lockDir, callback, { timeoutMs = 5_000, staleMs = 30_000 } = {}) {
  const started = Date.now();
  await mkdir(path.dirname(lockDir), { recursive: true });
  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(path.join(lockDir, "owner"), `${process.pid}\n`, "utf8");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const info = await stat(lockDir);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() - started >= timeoutMs) {
        throw new Error(`Timed out waiting for lock: ${lockDir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await callback();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
