import assert from "node:assert/strict";
import test from "node:test";
import { HerdrClient, pluginPaneOpenArgs } from "../src/herdr.mjs";

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

test("agent start passes native argv only after Herdr's separator", async () => {
  const client = new HerdrClient();
  let captured;
  client.json = async (args, options) => {
    captured = { args, options };
    return { result: { agent: { name: "lead" } } };
  };
  await client.startAgent({
    name: "lead",
    kind: "claude",
    paneId: "w1:p2",
    args: ["--dangerously-skip-permissions", "--model", "name with spaces"],
  });
  assert.deepEqual(captured.args, [
    "agent", "start", "lead", "--kind", "claude", "--pane", "w1:p2", "--",
    "--dangerously-skip-permissions", "--model", "name with spaces",
  ]);
  assert.equal(captured.options.displayCommand.includes("dangerously"), false);
});

test("agent start redacts native argv when Herdr returns invalid JSON", async () => {
  const client = new HerdrClient();
  client.run = async () => ({ stdout: "not json", stderr: "" });
  await assert.rejects(
    client.startAgent({
      name: "lead",
      kind: "claude",
      paneId: "w1:p2",
      args: ["--secret-token", "VERY_SECRET"],
    }),
    (error) => {
      assert.equal(error.message.includes("VERY_SECRET"), false);
      assert.match(error.message, /<2 redacted agent args>/);
      return true;
    },
  );
});
