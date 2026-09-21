import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { StateStore } from "../src/state.mjs";
import { parseArgs } from "../src/team.mjs";

const execFileAsync = promisify(execFile);
const teamScript = path.resolve("src/team.mjs");

test("team parser preserves repeated native Agent arguments", () => {
  assert.deepEqual(parseArgs([
    "spawn",
    "--role", "implementer",
    "--arg=--model",
    "--arg=model with spaces",
    "--arg=--setting=a=b",
    "--arg=引数",
  ]), {
    _: ["spawn"],
    role: "implementer",
    arg: ["--model", "model with spaces", "--setting=a=b", "引数"],
  });
});

test("team control works after custom pane environment is lost", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-team-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "recovery-run",
    workspace_id: "w1",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [],
  });

  const { stdout } = await execFileAsync(process.execPath, [
    teamScript,
    "list",
    "--run", "recovery-run",
    "--state-dir", root,
    "--plugin-root", "/plugin",
  ], {
    env: {
      PATH: process.env.PATH,
      HERDR_PANE_ID: "w1:p1",
    },
  });
  assert.equal(JSON.parse(stdout).orchestrator.agent_name, "orchestrator-1");
});

test("team complete CLI refuses a run without verifier evidence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-team-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "gate-run",
    workspace_id: "w1",
    cwd: "/project",
    status: "active",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [],
  });

  await assert.rejects(
    execFileAsync(process.execPath, [teamScript, "complete", "--summary", "claimed complete"], {
      env: {
        ...process.env,
        AGENT_LOOP_STATE_DIR: root,
        AGENT_LOOP_RUN_ID: "gate-run",
        HERDR_PANE_ID: "w1:p1",
      },
    }),
    (error) => {
      assert.match(error.stderr, /no verifier has been created/);
      return true;
    },
  );
  assert.equal((await store.readRun("gate-run")).status, "active");
});

test("team complete CLI cannot revive a failed run", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-team-failed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStore(root);
  await store.createRun({
    run_id: "failed-run",
    workspace_id: "w1",
    cwd: "/project",
    status: "failed",
    orchestrator: { agent_name: "orchestrator-1", role: "orchestrator", pane_id: "w1:p1" },
    agents: [{
      agent_name: "verifier-1",
      role: "verifier",
      pane_id: "w1:p2",
      status: "idle",
      latest_result_status: "pass",
      latest_result_at: "2026-09-22T10:00:00.000Z",
      latest_result_data: { verdict: "PASS", unresolved_issues: [], required_checks_skipped: [] },
    }],
  });

  await assert.rejects(
    execFileAsync(process.execPath, [teamScript, "complete", "--summary", "claimed complete"], {
      env: {
        ...process.env,
        AGENT_LOOP_STATE_DIR: root,
        AGENT_LOOP_RUN_ID: "failed-run",
        HERDR_PANE_ID: "w1:p1",
      },
    }),
    (error) => {
      assert.match(error.stderr, /Cannot complete run failed-run while it is failed/);
      return true;
    },
  );
  assert.equal((await store.readRun("failed-run")).status, "failed");
});
