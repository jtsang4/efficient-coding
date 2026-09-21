import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadProfileConfig,
  parseArgvJson,
  resolveLaunch,
  validateProfileConfig,
} from "../src/profiles.mjs";

test("profile config loads role defaults and preserves argv tokens", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-loop-profiles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "profiles.json"), JSON.stringify({
    defaults: { implementer: "claude-dev" },
    profiles: {
      "claude-dev": {
        kind: "claude",
        args: ["--model", "model with spaces", "--setting=a=b", "引数"],
      },
    },
  }));

  const config = await loadProfileConfig(root);
  assert.deepEqual(resolveLaunch({ role: "implementer", profileConfig: config }), {
    profile: "claude-dev",
    kind: "claude",
    args: ["--model", "model with spaces", "--setting=a=b", "引数"],
  });
});

test("explicit kind skips role default and explicit argv replaces profile argv", () => {
  const config = validateProfileConfig({
    defaults: { verifier: "review" },
    profiles: { review: { kind: "codex", args: ["--model", "default-model"] } },
  });
  assert.deepEqual(resolveLaunch({ role: "verifier", kind: "pi", profileConfig: config }), {
    profile: null,
    kind: "pi",
    args: [],
  });
  assert.deepEqual(resolveLaunch({
    role: "verifier",
    profileName: "review",
    args: ["--model", "override-model"],
    profileConfig: config,
  }), {
    profile: "review",
    kind: "codex",
    args: ["--model", "override-model"],
  });
  assert.deepEqual(resolveLaunch({
    role: "verifier",
    profileName: "review",
    args: [],
    profileConfig: config,
  }).args, []);
});

test("profiles reject ambiguous, unsafe, and malformed definitions", () => {
  assert.throws(
    () => validateProfileConfig({
      defaults: { orchestrator: "unsafe" },
      profiles: { unsafe: { kind: "claude", args: ["--dangerously-skip-permissions"] } },
    }),
    /require explicit profile selection/,
  );
  for (const args of [
    ["--permission-mode", "bypassPermissions"],
    ["--permission-mode=bypassPermissions"],
    ["--dangerously-bypass-approvals-and-sandbox"],
  ]) {
    assert.throws(
      () => validateProfileConfig({
        defaults: { orchestrator: "unsafe" },
        profiles: { unsafe: { kind: "claude", args } },
      }),
      /require explicit profile selection/,
    );
  }
  assert.throws(
    () => resolveLaunch({
      role: "orchestrator",
      profileName: "safe",
      kind: "claude",
      profileConfig: { defaults: {}, profiles: { safe: { kind: "codex", args: [] } } },
    }),
    /either an Agent profile or an explicit kind/,
  );
  assert.throws(() => parseArgvJson('["ok", 1]'), /array of strings/);
  assert.throws(() => parseArgvJson('["bad\\u0000arg"]'), /without NUL bytes/);
});
