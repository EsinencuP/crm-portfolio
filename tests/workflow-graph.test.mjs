import { compileWorkflowGraph, validateWorkflowGraph } from "../src/lib/workflows/graph.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const canvas = {
  nodes: ["trigger", "condition", "yes-action", "no-action"].map((id) => ({
    id,
    type: id === "trigger" ? "trigger" : "step",
    position: { x: 0, y: 0 },
  })),
  edges: [
    { source: "trigger", target: "condition", sourceHandle: "out" },
    { source: "condition", target: "yes-action", sourceHandle: "yes" },
    { source: "condition", target: "no-action", sourceHandle: "no" },
  ],
};
const steps = [
  { nodeId: "condition", type: "CONDITION" },
  { nodeId: "yes-action", type: "CREATE_TASK" },
  { nodeId: "no-action", type: "CREATE_TASK" },
];
test("workflow graph: yes/no routing and terminal actions match canvas", () => {
  const compiled = compileWorkflowGraph(canvas, steps);
  assert.equal(compiled[0].nextPosition, 1);
  assert.equal(compiled[0].elsePosition, 2);
  assert.equal(compiled[1].nextPosition, -1);
  assert.doesNotThrow(() => validateWorkflowGraph(compiled, canvas));
  assert.throws(
    () => validateWorkflowGraph([{ ...compiled[0], nextPosition: 2 }, ...compiled.slice(1)], canvas),
    /routing/,
  );
  assert.throws(() => validateWorkflowGraph(compiled), /canvas/);
});
test("workflow graph: loops, disconnected steps and duplicate outputs are rejected", () => {
  assert.throws(
    () =>
      compileWorkflowGraph(
        { ...canvas, edges: [...canvas.edges, { source: "yes-action", target: "condition", sourceHandle: "out" }] },
        steps,
      ),
    /loops/,
  );
  assert.throws(() => compileWorkflowGraph({ ...canvas, edges: canvas.edges.slice(0, 2) }, steps), /connected/);
  assert.throws(
    () => compileWorkflowGraph({ ...canvas, edges: [...canvas.edges, canvas.edges[1]] }, steps),
    /one connection/,
  );
});
