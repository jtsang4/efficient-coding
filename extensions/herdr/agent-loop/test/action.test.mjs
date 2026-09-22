import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import test from "node:test";
import { cwdFromContext, selectedTextFromContext } from "../src/action.mjs";
import { createLinePrompter, isBlockTerminator } from "../src/launcher.mjs";

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

test("launcher accepts an explicit readable terminator and the legacy dot", () => {
  assert.equal(isBlockTerminator("/done"), true);
  assert.equal(isBlockTerminator(" /DONE "), true);
  assert.equal(isBlockTerminator("."), true);
  assert.equal(isBlockTerminator("finish this sentence."), false);
});

test("launcher preserves lines pasted before the next prompt is rendered", async () => {
  const rl = createInterface({ input: Readable.from(["first line\nsecond line\n/done\n"]) });
  const rendered = [];
  const askLine = createLinePrompter(rl, { write: (value) => rendered.push(value) });
  assert.equal(await askLine("任务 > "), "first line");
  assert.equal(await askLine("继续 > "), "second line");
  assert.equal(await askLine("继续 > "), "/done");
  assert.deepEqual(rendered, ["任务 > ", "继续 > ", "继续 > "]);
  rl.close();
});
