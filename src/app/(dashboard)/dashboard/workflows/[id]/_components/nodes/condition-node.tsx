"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { GitFork } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { conditionFields } from "@/lib/workflows/config";

import { EditorSelect, useNodeEditor, type WorkflowNode } from "../node-editor-context";

export function ConditionNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const editor = useNodeEditor();
  const conditions = (data.config.conditions ?? []) as { field: string; operator: string; value: unknown }[];
  const change = (index: number, key: string, value: unknown) =>
    editor.update(id, {
      ...data.config,
      conditions: conditions.map((condition, position) =>
        position === index ? { ...condition, [key]: value } : condition,
      ),
    });
  return (
    <div
      className={`relative w-[480px] px-28 py-40 text-amber-950 dark:text-amber-100 ${selected ? "drop-shadow-lg" : ""}`}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full fill-amber-50 stroke-amber-600 dark:fill-amber-950"
        viewBox="0 0 480 600"
        preserveAspectRatio="none"
      >
        <polygon points="240,2 478,300 240,598 2,300" strokeWidth={selected ? 4 : 2} />
      </svg>
      <Handle type="target" position={Position.Top} aria-label="Condition input" className="!size-3" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <span className="flex size-7 rotate-45 items-center justify-center rounded-sm border-2 border-amber-700 bg-amber-200">
            <GitFork className="size-4 -rotate-45" aria-hidden="true" />
          </span>
          Condition · all match
        </div>
        <fieldset disabled={editor.disabled} className="nodrag nopan space-y-3">
          {conditions.length === 0 && <p className="text-xs">No conditions: Yes branch always runs.</p>}
          {conditions.map((condition, index) => (
            <div key={`${id}-condition-${index}`} className="space-y-2">
              <EditorSelect
                label={`Field ${index + 1}`}
                value={condition.field}
                options={conditionFields.map((value) => ({ value, label: value }))}
                onChange={(value) => change(index, "field", value)}
              />
              <EditorSelect
                label={`Operator ${index + 1}`}
                value={condition.operator}
                options={["equals", "not_equals", "contains", "gt", "lt"].map((value) => ({ value, label: value }))}
                onChange={(value) => change(index, "operator", value)}
              />
              <EditorSelect
                label={`Value type ${index + 1}`}
                value={condition.value === null ? "null" : typeof condition.value}
                options={["string", "number", "boolean", "null"].map((value) => ({ value, label: value }))}
                onChange={(value) =>
                  change(
                    index,
                    "value",
                    value === "null" ? null : value === "boolean" ? false : value === "number" ? 0 : "",
                  )
                }
              />
              <Label htmlFor={`${id}-value-${index}`} className="text-xs">
                Value {index + 1}
              </Label>
              <Input
                id={`${id}-value-${index}`}
                value={condition.value === null ? "null" : String(condition.value)}
                disabled={condition.value === null}
                onChange={(event) =>
                  change(
                    index,
                    "value",
                    typeof condition.value === "number"
                      ? Number(event.target.value)
                      : typeof condition.value === "boolean"
                        ? event.target.value === "true"
                        : event.target.value,
                  )
                }
              />
            </div>
          ))}
        </fieldset>
      </div>
      <span className="absolute bottom-10 left-16 text-xs font-semibold">Yes</span>
      <span className="absolute right-16 bottom-10 text-xs font-semibold">No</span>
      <Handle
        type="source"
        id="yes"
        position={Position.Left}
        style={{ top: "65%", left: "15%" }}
        aria-label="Condition Yes output"
        className="!size-3"
      />
      <Handle
        type="source"
        id="no"
        position={Position.Right}
        style={{ top: "65%", right: "15%" }}
        aria-label="Condition No output"
        className="!size-3"
      />
    </div>
  );
}
