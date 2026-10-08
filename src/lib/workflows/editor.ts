import { stepSchema, type WorkflowStepInput } from "./config";
import { compileWorkflowGraph, type WorkflowCanvasDocument } from "./graph";

export type StepKind = WorkflowStepInput["type"];
export const stepLabels: Record<StepKind, string> = {
  CONDITION: "Condition",
  SEND_EMAIL: "Send Email",
  CREATE_TASK: "Create Task",
  UPDATE_FIELD: "Update Field",
  MOVE_STAGE: "Move Stage",
  SEND_NOTIFICATION: "Send Notification",
  CALL_WEBHOOK: "Call Webhook",
  WAIT: "Wait",
  ASSIGN_OWNER: "Assign Owner",
  ADD_TAG: "Add Tag",
};
export const triggerLabel = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
export type EditableStep = { nodeId: string; type: StepKind; config: Record<string, unknown> };
export type EditorWorkflow = {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  isActive: boolean;
  updatedAt: string;
  canvas: WorkflowCanvasDocument | null;
  steps: {
    type: StepKind;
    config: Record<string, unknown>;
    nodeId?: string | null;
    nextPosition?: number | null;
    elsePosition?: number | null;
  }[];
};
export type EditorOptions = {
  users: { id: string; name: string | null }[];
  stages: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  accounts: { id: string; email: string }[];
};
export const emptyEditorOptions: EditorOptions = { users: [], stages: [], tags: [], accounts: [] };
export function defaultStepConfig(type: StepKind): Record<string, unknown> {
  switch (type) {
    case "CONDITION":
      return { conditions: [{ field: "source", operator: "equals", value: "WEBSITE" }] };
    case "SEND_EMAIL":
      return { accountId: "", subject: "", bodyHtml: "", trackingEnabled: false };
    case "CREATE_TASK":
      return { title: "Follow up {{firstName}}", description: "", dueInMinutes: 1440 };
    case "UPDATE_FIELD":
      return { field: "status", value: "ACTIVE" };
    case "MOVE_STAGE":
      return { stageId: "" };
    case "ASSIGN_OWNER":
      return { userId: "" };
    case "ADD_TAG":
      return { tagId: "" };
    case "SEND_NOTIFICATION":
      return { title: "CRM update", body: "" };
    case "CALL_WEBHOOK":
      return { url: "", method: "POST", headers: {} };
    case "WAIT":
      return { duration: 60 };
  }
}
export function loadEditorDocument(workflow: EditorWorkflow) {
  const steps: EditableStep[] = workflow.steps.map((step, index) => ({
    nodeId: step.nodeId ?? `step-${index}`,
    type: step.type,
    config: step.config,
  }));
  if (workflow.canvas) return { canvas: workflow.canvas, steps };
  const canvas: WorkflowCanvasDocument = {
    nodes: [
      { id: "trigger", type: "trigger", position: { x: 360, y: 40 } },
      ...steps.map((step, index) => ({
        id: step.nodeId,
        type: "step" as const,
        position: { x: 360, y: 240 + index * 360 },
      })),
    ],
    edges: steps.map((step, index) => ({
      source: index ? steps[index - 1].nodeId : "trigger",
      target: step.nodeId,
      sourceHandle: index && steps[index - 1].type === "CONDITION" ? ("yes" as const) : ("out" as const),
    })),
  };
  return { canvas, steps };
}
export function serializeEditorDocument(canvas: WorkflowCanvasDocument, steps: EditableStep[]) {
  return compileWorkflowGraph(canvas, steps).map((step) => stepSchema.parse(step));
}
export async function workflowRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Workflow request failed.");
  return data;
}
export const workflowWrite = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
