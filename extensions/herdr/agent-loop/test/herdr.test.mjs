import assert from "node:assert/strict";
import test from "node:test";
import { pluginPaneOpenArgs } from "../src/herdr.mjs";

test("plugin pane open forwards workspace cwd without overriding manifest popup placement", () => {
  const args = pluginPaneOpenArgs("launcher", {
    workspaceId: "w1",
    env: { AGENT_LOOP_WORKSPACE_CWD: "/workspace/project" },
  });
  assert.deepEqual(args, [
    "plugin", "pane", "open",
    "--plugin", "efficient-coding.agent-loop",
    "--entrypoint", "launcher",
    "--workspace", "w1",
    "--env", "AGENT_LOOP_WORKSPACE_CWD=/workspace/project",
    "--focus",
  ]);
  assert.equal(args.includes("--placement"), false);
});
