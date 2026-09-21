import assert from "node:assert/strict";
import test from "node:test";
import { normalizePluginEvent } from "../src/events.mjs";

test("normalizes agent status hook payload", () => {
  const event = normalizePluginEvent(
    "pane.agent_status_changed",
    JSON.stringify({
      event: "pane.agent_status_changed",
      data: { pane_id: "w1:p2", workspace_id: "w1", agent_status: "idle" },
    }),
  );
  assert.equal(event.pane_id, "w1:p2");
  assert.equal(event.status, "idle");
});

test("maps pane exit to exited status", () => {
  const event = normalizePluginEvent("pane.exited", { pane_id: "w1:p3" });
  assert.equal(event.pane_id, "w1:p3");
  assert.equal(event.status, "exited");
});
