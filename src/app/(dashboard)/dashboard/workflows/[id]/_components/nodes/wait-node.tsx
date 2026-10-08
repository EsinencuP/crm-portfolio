"use client";

import { useState } from "react";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { EditorSelect, useNodeEditor, type WorkflowNode } from "../node-editor-context";

export function WaitNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const editor = useNodeEditor();
  const [unit, setUnit] = useState(
    Number(data.config.duration) % 86400 === 0 ? 86400 : Number(data.config.duration) % 3600 === 0 ? 3600 : 60,
  );
  const duration = Number(data.config.duration);
  return (
    <div
      className={`w-72 rounded-xl border-2 border-orange-600 bg-orange-50 p-4 text-orange-950 shadow-sm dark:bg-orange-950 dark:text-orange-100 ${selected ? "ring-2 ring-ring ring-offset-2" : ""}`}
    >
      <Handle type="target" position={Position.Top} aria-label="Wait input" className="!size-3" />
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <Clock className="size-4" aria-hidden="true" />
        Wait
      </div>
      <fieldset disabled={editor.disabled} className="nodrag nopan space-y-2">
        <Label className="text-xs" htmlFor={`${id}-duration`}>
          Duration
        </Label>
        <Input
          id={`${id}-duration`}
          type="number"
          min={1 / unit}
          step="any"
          max={2592000 / unit}
          value={duration / unit}
          onChange={(event) => editor.update(id, { duration: Math.round(Number(event.target.value) * unit) })}
        />
        <EditorSelect
          label="Unit"
          value={String(unit)}
          options={[
            { value: "60", label: "Minutes" },
            { value: "3600", label: "Hours" },
            { value: "86400", label: "Days" },
          ]}
          onChange={(value) => {
            const next = Number(value);
            setUnit(next);
            editor.update(id, { duration: Math.round((duration / unit) * next) });
          }}
        />
        <p className="text-xs">Maximum wait: 30 days.</p>
      </fieldset>
      <Handle type="source" id="out" position={Position.Bottom} aria-label="Wait output" className="!size-3" />
    </div>
  );
}
