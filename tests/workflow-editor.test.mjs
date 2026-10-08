import { workflowSchema } from "../src/lib/workflows/config.ts";
import { defaultStepConfig, loadEditorDocument, serializeEditorDocument } from "../src/lib/workflows/editor.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const legacy = {
  id: "legacy",
  name: "Legacy",
  description: null,
  trigger: "CONTACT_CREATED",
  triggerConfig: { conditions: [] },
  isActive: false,
  updatedAt: new Date().toISOString(),
  canvas: null,
  steps: [
    { type: "CONDITION", config: { conditions: [{ field: "source", operator: "equals", value: "WEBSITE" }] } },
    { type: "WAIT", config: { duration: 3600 } },
  ],
};
test("workflow editor: legacy sequence becomes a canvas without altering configs or adding No branch actions", () => {
  const document = loadEditorDocument(legacy);
  const steps = serializeEditorDocument(document.canvas, document.steps);
  assert.equal(steps[0].nextPosition, 1);
  assert.equal(steps[0].elsePosition, -1);
  assert.deepEqual(steps[1].config, { duration: 3600 });
  assert.doesNotThrow(() =>
    workflowSchema.parse({ name: legacy.name, trigger: legacy.trigger, steps, canvas: document.canvas }),
  );
});
test("workflow editor: positions, viewport, action configs and branching survive save/load", () => {
  const document = loadEditorDocument(legacy);
  document.canvas.nodes[1].position = { x: 920, y: -42 };
  document.canvas.viewport = { x: 20, y: 40, zoom: 0.7 };
  const saved = { ...legacy, canvas: document.canvas, steps: serializeEditorDocument(document.canvas, document.steps) };
  const reloaded = loadEditorDocument(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reloaded.canvas, document.canvas);
  assert.deepEqual(serializeEditorDocument(reloaded.canvas, reloaded.steps), saved.steps);
});
test("workflow editor: incomplete configs, invalid headers and disconnected nodes block saving", () => {
  const document = loadEditorDocument(legacy);
  document.steps[1] = { ...document.steps[1], type: "SEND_EMAIL", config: defaultStepConfig("SEND_EMAIL") };
  assert.throws(() => serializeEditorDocument(document.canvas, document.steps));
  document.steps[1] = {
    ...document.steps[1],
    type: "CALL_WEBHOOK",
    config: { url: "https://hooks.example.com", method: "POST", headers: null },
  };
  assert.throws(() => serializeEditorDocument(document.canvas, document.steps));
  assert.throws(
    () => serializeEditorDocument({ ...document.canvas, edges: document.canvas.edges.slice(0, 1) }, document.steps),
    /connected/,
  );
});
