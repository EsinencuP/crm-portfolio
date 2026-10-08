"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowLeft, GitBranch, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { entities } from "@/lib/workflows/config";
import {
  defaultStepConfig,
  type EditorOptions,
  type EditorWorkflow,
  emptyEditorOptions,
  loadEditorDocument,
  type StepKind,
  serializeEditorDocument,
  stepLabels,
  triggerLabel,
  workflowRequest,
  workflowWrite,
} from "@/lib/workflows/editor";
import type { WorkflowCanvasDocument } from "@/lib/workflows/graph";

import { EditorSelect, NodeEditorContext, type WorkflowNode } from "./node-editor-context";
import { ActionNode } from "./nodes/action-node";
import { ConditionNode } from "./nodes/condition-node";
import { TriggerNode } from "./nodes/trigger-node";
import { WaitNode } from "./nodes/wait-node";
import { WorkflowRunLog } from "./workflow-run-log";
import "@xyflow/react/dist/style.css";

const nodeTypes = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode, wait: WaitNode };
function displayNodes(workflow: EditorWorkflow): WorkflowNode[] {
  const { canvas, steps } = loadEditorDocument(workflow);
  return canvas.nodes.map((node) => {
    const step = steps.find((step) => step.nodeId === node.id);
    if (!step)
      return {
        ...node,
        type: "trigger",
        deletable: false,
        data: { label: triggerLabel(workflow.trigger), config: {} },
      };
    let type: WorkflowNode["type"] = "action";
    if (step.type === "CONDITION") type = "condition";
    if (step.type === "WAIT") type = "wait";
    return { ...node, type, data: { kind: step.type, label: stepLabels[step.type], config: step.config } };
  });
}
function displayEdges(workflow: EditorWorkflow): Edge[] {
  return loadEditorDocument(workflow).canvas.edges.map((edge, index) => ({
    ...edge,
    id: `edge-${index}`,
    label: edge.sourceHandle === "out" ? undefined : edge.sourceHandle === "yes" ? "Yes" : "No",
    type: "smoothstep",
  }));
}
export function WorkflowCanvas({
  initialWorkflow,
  workspaceId,
  onBack,
}: {
  initialWorkflow: EditorWorkflow;
  workspaceId: string;
  onBack?: () => void;
}) {
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => displayNodes(initialWorkflow));
  const [edges, setEdges] = useState<Edge[]>(() => displayEdges(initialWorkflow));
  const [instance, setInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showRuns, setShowRuns] = useState(false);
  const [confirm, setConfirm] = useState<"reload" | "back" | null>(null);
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [output, setOutput] = useState("out");
  const [manualEntity, setManualEntity] = useState<string>("Contact");
  const [manualId, setManualId] = useState("");
  const query = useQuery<EditorOptions>({
    queryKey: ["workflow-options", workspaceId, workflow.id],
    queryFn: () => workflowRequest(`/api/workflows/${workflow.id}/options`),
  });
  const options = query.data ?? emptyEditorOptions;
  const markDirty = () => {
    setDirty(true);
    setNotice("");
  };
  const update = useCallback((id: string, config: Record<string, unknown>) => {
    setNodes((nodes) => nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, config } } : node)));
    setDirty(true);
    setNotice("");
  }, []);
  const editorContext = useMemo(() => ({ options, disabled: saving, update }), [options, saving, update]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const validConnection = (connection: Connection | Edge) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    const from = nodes.find((node) => node.id === connection.source);
    const to = nodes.find((node) => node.id === connection.target);
    if (!from || !to || to.type === "trigger" || !connection.sourceHandle) return false;
    if (!(from.type === "condition" ? ["yes", "no"] : ["out"]).includes(connection.sourceHandle)) return false;
    if (edges.some((edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle))
      return false;
    const visited = new Set<string>();
    const reachesSource = (id: string): boolean => {
      if (id === connection.source) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return edges.filter((edge) => edge.source === id).some((edge) => reachesSource(edge.target));
    };
    return !reachesSource(connection.target);
  };
  const connect = (connection: Connection) => {
    if (!validConnection(connection)) {
      setError("Invalid connection: no loops, trigger inputs or duplicate outputs.");
      return;
    }
    setEdges((edges) =>
      addEdge(
        {
          ...connection,
          id: crypto.randomUUID(),
          type: "smoothstep",
          label: connection.sourceHandle === "out" ? undefined : triggerLabel(connection.sourceHandle ?? ""),
        },
        edges,
      ),
    );
    markDirty();
    setError("");
  };
  const addNode = (kind: StepKind, position?: { x: number; y: number }) => {
    if (nodes.length >= 51) {
      setError("Maximum 50 steps per workflow.");
      return;
    }
    const bounds = document.getElementById(`workflow-canvas-${workflow.id}`)?.getBoundingClientRect();
    const center =
      bounds && instance
        ? instance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
        : { x: 360, y: nodes.length * 260 };
    let type: WorkflowNode["type"] = "action";
    if (kind === "CONDITION") type = "condition";
    if (kind === "WAIT") type = "wait";
    let placement = position ?? { x: center.x + 30, y: center.y + 30 };
    if (!position) {
      const width = kind === "CONDITION" ? 480 : 320;
      const height = kind === "CONDITION" ? 650 : 380;
      for (let attempt = 0; attempt < 50; attempt++) {
        const overlaps = nodes.some(
          (node) =>
            placement.x < node.position.x + (node.measured?.width ?? 320) + 30 &&
            placement.x + width + 30 > node.position.x &&
            placement.y < node.position.y + (node.measured?.height ?? 380) + 30 &&
            placement.y + height + 30 > node.position.y,
        );
        if (!overlaps) break;
        placement = { x: placement.x + 380, y: placement.y };
      }
    }
    setNodes((nodes) => [
      ...nodes.map((node) => ({ ...node, selected: false })),
      {
        id: crypto.randomUUID(),
        type,
        selected: true,
        position: placement,
        data: { kind, config: defaultStepConfig(kind), label: stepLabels[kind] },
      },
    ]);
    markDirty();
    setShowRuns(false);
  };
  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const canvas: WorkflowCanvasDocument = {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type === "trigger" ? "trigger" : "step",
          position: node.position,
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle as "out" | "yes" | "no",
        })),
        ...(instance ? { viewport: instance.getViewport() } : {}),
      };
      const steps = serializeEditorDocument(
        canvas,
        nodes
          .filter((node) => node.data.kind)
          .map((node) => ({ nodeId: node.id, type: node.data.kind as StepKind, config: node.data.config })),
      );
      const { workflow: saved }: { workflow: EditorWorkflow } = await workflowRequest(
        `/api/workflows/${workflow.id}`,
        workflowWrite("PUT", {
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          triggerConfig: workflow.triggerConfig,
          isActive: workflow.isActive,
          steps,
          canvas,
          updatedAt: workflow.updatedAt,
        }),
      );
      setWorkflow(saved);
      setDirty(false);
      setNotice("Workflow saved. Positions, settings and branch connections are persisted.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save workflow.");
    } finally {
      setSaving(false);
    }
  };
  const navigateBack = () => {
    if (onBack) onBack();
    else window.location.assign("/dashboard/workflows");
  };
  const reload = async () => {
    setSaving(true);
    setError("");
    try {
      const { workflow: latest } = await workflowRequest(`/api/workflows/${workflow.id}`);
      setWorkflow(latest);
      setNodes(displayNodes(latest));
      setEdges(displayEdges(latest));
      setRevision((value) => value + 1);
      setDirty(false);
      setNotice("Loaded saved workflow.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reload workflow.");
    } finally {
      setSaving(false);
    }
  };
  const selected = nodes.filter((node) => node.selected && node.type !== "trigger");
  return (
    <NodeEditorContext.Provider value={editorContext}>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              aria-label="Back to workflows"
              disabled={saving}
              onClick={() => {
                if (dirty) setConfirm("back");
                else navigateBack();
              }}
            >
              <ArrowLeft />
            </Button>
            <div>
              <h1 className="flex items-center gap-2 font-semibold text-xl">
                <GitBranch className="size-5" />
                Workflow builder
              </h1>
              <p className="text-muted-foreground text-sm">
                {triggerLabel(workflow.trigger)} · {nodes.length - 1} steps
              </p>
            </div>
            <Badge variant={dirty ? "outline" : "secondary"}>{dirty ? "Unsaved changes" : "Saved"}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                if (dirty) setConfirm("reload");
                else void reload();
              }}
            >
              Reload saved
            </Button>
            <Button variant="outline" aria-pressed={showRuns} onClick={() => setShowRuns(!showRuns)}>
              {showRuns ? "Canvas" : "Run history"}
            </Button>
            <Button disabled={saving || !dirty} onClick={() => void save()}>
              <Save />
              {saving ? "Saving…" : "Save workflow"}
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
          <div className="min-w-40 flex-1 space-y-1">
            <Label htmlFor="editor-workflow-name">Name</Label>
            <Input
              id="editor-workflow-name"
              disabled={saving}
              maxLength={160}
              value={workflow.name}
              onChange={(event) => {
                setWorkflow({ ...workflow, name: event.target.value });
                markDirty();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-workflow-active">Active</Label>
            <Switch
              id="editor-workflow-active"
              checked={workflow.isActive}
              disabled={saving}
              onCheckedChange={(value) => {
                setWorkflow({ ...workflow, isActive: value });
                markDirty();
              }}
            />
          </div>
          <p className="max-w-sm text-muted-foreground text-xs">
            Activation takes effect after Save. Workflows execute with the creator’s permissions; the standalone worker
            must be running.
          </p>
        </div>
        {workflow.trigger === "SCHEDULED" && (
          <div className="flex flex-wrap gap-3 rounded-lg border p-4">
            <EditorSelect
              label="Scheduled entity"
              value={String(workflow.triggerConfig.entityType ?? "Contact")}
              options={entities.map((value) => ({ value, label: value }))}
              onChange={(value) => {
                setWorkflow({ ...workflow, triggerConfig: { ...workflow.triggerConfig, entityType: value } });
                markDirty();
              }}
            />
            <div>
              <Label htmlFor="editor-schedule-entity">Entity ID</Label>
              <Input
                id="editor-schedule-entity"
                value={String(workflow.triggerConfig.entityId ?? "")}
                onChange={(event) => {
                  setWorkflow({
                    ...workflow,
                    triggerConfig: { ...workflow.triggerConfig, entityId: event.target.value },
                  });
                  markDirty();
                }}
              />
            </div>
            <div>
              <Label htmlFor="editor-schedule-interval">Interval (minutes)</Label>
              <Input
                id="editor-schedule-interval"
                type="number"
                min={1}
                max={43200}
                value={Number(workflow.triggerConfig.intervalMinutes ?? 60)}
                onChange={(event) => {
                  setWorkflow({
                    ...workflow,
                    triggerConfig: { ...workflow.triggerConfig, intervalMinutes: Number(event.target.value) },
                  });
                  markDirty();
                }}
              />
            </div>
          </div>
        )}
        {query.error && (
          <p role="alert" className="text-destructive text-sm">
            Could not load workspace options: {query.error.message}{" "}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive text-sm">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg border p-3 text-sm">
            {notice}
          </p>
        )}
        {showRuns ? (
          <WorkflowRunLog workflowId={workflow.id} workspaceId={workspaceId} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside aria-label="Workflow node palette" className="space-y-4 rounded-xl border bg-muted/20 p-3">
              <div>
                <h2 className="font-semibold text-sm">Add a step</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Drag onto the canvas or click to add. Connect every step before saving.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {(Object.keys(stepLabels) as StepKind[]).map((kind) => (
                  <Button
                    key={kind}
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={saving}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/workflow-step", kind);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => addNode(kind)}
                  >
                    + {stepLabels[kind]}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={saving || (!selected.length && !edges.some((edge) => edge.selected))}
                onClick={() => {
                  const ids = new Set(selected.map((node) => node.id));
                  setNodes((nodes) => nodes.filter((node) => !ids.has(node.id)));
                  setEdges((edges) =>
                    edges.filter((edge) => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target)),
                  );
                  markDirty();
                }}
              >
                <Trash2 />
                Delete selection
              </Button>
              <p className="text-muted-foreground text-xs">
                Select a node/edge and press Delete. The trigger cannot be deleted. Missing outputs end the selected
                branch.
              </p>
            </aside>
            <div
              role="application"
              aria-label="Workflow canvas drop area"
              id={`workflow-canvas-${workflow.id}`}
              className="h-[620px] min-w-0 overflow-hidden rounded-xl border bg-background"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const kind = event.dataTransfer.getData("application/workflow-step") as StepKind;
                if (!saving && Object.hasOwn(stepLabels, kind) && instance)
                  addNode(kind, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
              }}
            >
              <ReactFlow<WorkflowNode, Edge>
                key={revision}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={setInstance}
                onNodesChange={(changes) => {
                  setNodes((nodes) => applyNodeChanges(changes, nodes));
                  if (changes.some((change) => ["position", "remove", "add"].includes(change.type))) markDirty();
                }}
                onEdgesChange={(changes) => {
                  setEdges((edges) => applyEdgeChanges(changes, edges));
                  if (changes.some((change) => change.type !== "select")) markDirty();
                }}
                onConnect={connect}
                isValidConnection={validConnection}
                nodesDraggable={!saving}
                nodesConnectable={!saving}
                edgesReconnectable={false}
                deleteKeyCode={saving ? null : ["Backspace", "Delete"]}
                defaultViewport={workflow.canvas?.viewport}
                fitView={!workflow.canvas?.viewport}
                fitViewOptions={{ maxZoom: 0.85, padding: 0.2 }}
                minZoom={0.1}
                maxZoom={2}
                colorMode="system"
                aria-label="Visual workflow editor"
              >
                <Background />
                <Controls />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) =>
                    node.type === "trigger"
                      ? "#059669"
                      : node.type === "condition"
                        ? "#d97706"
                        : node.type === "wait"
                          ? "#ea580c"
                          : "#2563eb"
                  }
                />
              </ReactFlow>
            </div>
            <fieldset disabled={saving} className="flex flex-wrap items-end gap-3 rounded-lg border p-3 lg:col-span-2">
              <legend className="px-1 text-xs">Connect steps (keyboard / touch alternative)</legend>
              <EditorSelect
                label="From node"
                value={source}
                options={nodes.map((node) => ({
                  value: node.id,
                  label: `${node.data.label} · ${node.id.slice(0, 8)}`,
                }))}
                onChange={(value) => {
                  setSource(value);
                  setOutput(nodes.find((node) => node.id === value)?.type === "condition" ? "yes" : "out");
                }}
              />
              <EditorSelect
                label="Output"
                value={output}
                options={(nodes.find((node) => node.id === source)?.type === "condition" ? ["yes", "no"] : ["out"]).map(
                  (value) => ({ value, label: triggerLabel(value) }),
                )}
                onChange={setOutput}
              />
              <EditorSelect
                label="To node"
                value={target}
                options={nodes
                  .filter((node) => node.type !== "trigger" && node.id !== source)
                  .map((node) => ({ value: node.id, label: `${node.data.label} · ${node.id.slice(0, 8)}` }))}
                onChange={setTarget}
              />
              <Button
                variant="outline"
                disabled={!source || !target}
                onClick={() => connect({ source, target, sourceHandle: output, targetHandle: null })}
              >
                Connect nodes
              </Button>
            </fieldset>
          </div>
        )}
        {workflow.trigger === "MANUAL" && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              setError("");
              void workflowRequest(
                `/api/workflows/${workflow.id}/runs`,
                workflowWrite("POST", { entityType: manualEntity, entityId: manualId, requestId: crypto.randomUUID() }),
              )
                .then(({ runIds }) => {
                  setNotice(
                    runIds.length
                      ? "Run queued. Open Run history to follow its progress."
                      : "No run started: trigger conditions or creator record permissions did not match.",
                  );
                  setShowRuns(true);
                })
                .catch((error: Error) => setError(error.message))
                .finally(() => setSaving(false));
            }}
          >
            <EditorSelect
              label="Manual run entity"
              value={manualEntity}
              options={entities.map((value) => ({ value, label: value }))}
              onChange={setManualEntity}
            />
            <div className="space-y-1">
              <Label htmlFor="manual-entity-id">Entity ID</Label>
              <Input
                id="manual-entity-id"
                required
                maxLength={128}
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={dirty || saving || !workflow.isActive}>
              Run saved workflow
            </Button>
          </form>
        )}
        <Dialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
              <DialogDescription>Your current graph changes have not been saved.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Keep editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const action = confirm;
                  setConfirm(null);
                  if (action === "back") navigateBack();
                  else void reload();
                }}
              >
                Discard changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </NodeEditorContext.Provider>
  );
}
