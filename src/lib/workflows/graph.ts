import { z } from "zod";

const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const canvasSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: nodeId,
            type: z.enum(["trigger", "step"]),
            position: z
              .object({
                x: z.number().finite().min(-100000).max(100000),
                y: z.number().finite().min(-100000).max(100000),
              })
              .strict(),
          })
          .strict(),
      )
      .min(2)
      .max(51),
    edges: z
      .array(z.object({ source: nodeId, target: nodeId, sourceHandle: z.enum(["out", "yes", "no"]) }).strict())
      .min(1)
      .max(100),
    viewport: z
      .object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(0.1).max(4) })
      .strict()
      .optional(),
  })
  .strict();
export type WorkflowCanvasDocument = z.infer<typeof canvasSchema>;
export type GraphStep = {
  type: string;
  nodeId?: string | null;
  nextPosition?: number | null;
  elsePosition?: number | null;
};
export function compileWorkflowGraph<T extends GraphStep>(rawCanvas: unknown, rawSteps: T[]): T[] {
  const canvas = canvasSchema.parse(rawCanvas);
  const ids = new Set(canvas.nodes.map((node) => node.id));
  if (ids.size !== canvas.nodes.length) throw new Error("Every node needs a unique ID.");
  const roots = canvas.nodes.filter((node) => node.type === "trigger");
  if (roots.length !== 1) throw new Error("The canvas must contain exactly one trigger.");
  const root = roots[0].id;
  const stepMap = new Map(rawSteps.map((step) => [step.nodeId, step]));
  if (
    stepMap.size !== rawSteps.length ||
    rawSteps.some((step) => !step.nodeId || !ids.has(step.nodeId) || step.nodeId === root) ||
    canvas.nodes.length !== rawSteps.length + 1
  )
    throw new Error("Canvas nodes and executable steps must match.");
  const outgoing = new Map<string, Map<string, string>>();
  const incoming = new Map(canvas.nodes.map((node) => [node.id, 0]));
  for (const edge of canvas.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.target === root || edge.source === edge.target)
      throw new Error("Invalid workflow connection.");
    const handles = outgoing.get(edge.source) ?? new Map<string, string>();
    const condition = stepMap.get(edge.source)?.type === "CONDITION";
    if (!(condition ? ["yes", "no"] : ["out"]).includes(edge.sourceHandle) || handles.has(edge.sourceHandle))
      throw new Error("Each output may have only one connection.");
    handles.set(edge.sourceHandle, edge.target);
    outgoing.set(edge.source, handles);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  if (outgoing.get(root)?.size !== 1) throw new Error("Connect the trigger to the first step.");
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const next of outgoing.get(id)?.values() ?? []) visit(next);
  };
  visit(root);
  if (visited.size !== ids.size) throw new Error("Every step must be connected to the trigger.");
  const queue = [root];
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    order.push(current);
    for (const next of outgoing.get(current)?.values() ?? []) {
      const remaining = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (order.length !== ids.size) throw new Error("Workflow loops are not supported.");
  const positions = new Map(order.slice(1).map((id, position) => [id, position]));
  return order.slice(1).map((id) => {
    const step = stepMap.get(id);
    if (!step) throw new Error("Missing workflow step.");
    const connections = outgoing.get(id);
    const position = (handle: string) => {
      const next = connections?.get(handle);
      return next ? (positions.get(next) ?? -1) : -1;
    };
    return {
      ...step,
      nextPosition: position(step.type === "CONDITION" ? "yes" : "out"),
      ...(step.type === "CONDITION" ? { elsePosition: position("no") } : { elsePosition: undefined }),
    };
  });
}
export function validateWorkflowGraph(steps: GraphStep[], canvas?: WorkflowCanvasDocument | null) {
  if (!canvas) {
    if (steps.some((step) => step.nodeId != null || step.nextPosition != null || step.elsePosition != null))
      throw new Error("Graph routing requires a matching canvas.");
    return;
  }
  const compiled = compileWorkflowGraph(canvas, steps);
  if (
    compiled.some(
      (step, index) =>
        step.nodeId !== steps[index].nodeId ||
        step.nextPosition !== steps[index].nextPosition ||
        (step.elsePosition ?? null) !== (steps[index].elsePosition ?? null),
    )
  )
    throw new Error("Step routing does not match the canvas connections.");
}
