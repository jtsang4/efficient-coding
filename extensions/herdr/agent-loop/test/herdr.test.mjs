import assert from "node:assert/strict";
import test from "node:test";
import { HerdrClient, herdrFailureSummary, pluginPaneOpenArgs } from "../src/herdr.mjs";

test("plugin popup open carries workspace identity through env without forbidden workspace targeting", () => {
  const args = pluginPaneOpenArgs("launcher", {
    env: {
      AGENT_LOOP_WORKSPACE_ID: "w1",
      AGENT_LOOP_WORKSPACE_CWD: "/workspace/project",
    },
  });
  assert.deepEqual(args, [
    "plugin", "pane", "open",
    "--plugin", "efficient-coding.agent-loop",
    "--entrypoint", "launcher",
    "--env", "AGENT_LOOP_WORKSPACE_ID=w1",
    "--env", "AGENT_LOOP_WORKSPACE_CWD=/workspace/project",
    "--focus",
  ]);
  assert.equal(args.includes("--workspace"), false);
  assert.equal(args.includes("--placement"), false);
});

test("Herdr CLI JSON errors are included in the surfaced failure", () => {
  assert.equal(
    herdrFailureSummary('{"error":{"code":"invalid_params","message":"popup panes target the active pane"}}'),
    "invalid_params: popup panes target the active pane",
  );
  assert.equal(herdrFailureSummary("not json"), "");
});

test("Herdr CLI error messages can be suppressed when commands carry secrets", () => {
  const response = '{"error":{"code":"agent_start_failed","message":"invalid arg SECRET_TOKEN"}}';
  assert.equal(
    herdrFailureSummary(response, { includeMessage: false }),
    "agent_start_failed",
  );
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

test("agent prompt redacts prompt text from its displayed command", async () => {
  const client = new HerdrClient();
  let captured;
  client.json = async (args, options) => {
    captured = { args, options };
    return { result: { agent: { name: "lead" } } };
  };
  await client.promptAgent("lead", "SECRET_PROMPT");
  assert.equal(captured.args.includes("SECRET_PROMPT"), true);
  assert.equal(captured.options.displayCommand.includes("SECRET_PROMPT"), false);
  assert.equal(captured.options.errorDetail, "code");
});
