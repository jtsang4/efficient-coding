import assert from "node:assert/strict";
import test from "node:test";
import { cwdFromContext, selectedTextFromContext } from "../src/action.mjs";

test("selectedTextFromContext finds nested selection", () => {
  assert.equal(selectedTextFromContext({ pane: { selected_text: " Build it " } }), "Build it");
  assert.equal(selectedTextFromContext({}), "");
});

test("cwdFromContext resolves the focused pane cwd instead of plugin cwd", () => {
  const context = {
    workspace_id: "w1",
    workspace_cwd: "/workspace/project",
    focused_pane_id: "w1:p1",
    focused_pane_cwd: "/workspace/project/src",
  };
  assert.equal(cwdFromContext(context), "/workspace/project");
});
