"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Zap } from "lucide-react";

import type { WorkflowNode } from "../node-editor-context";

export function TriggerNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <div
      className={`w-72 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-4 text-emerald-950 shadow-sm dark:bg-emerald-950 dark:text-emerald-100 ${selected ? "ring-2 ring-ring ring-offset-2" : ""}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Zap className="size-4" aria-hidden="true" />
        Trigger
      </div>
      <p className="mt-2 text-sm">{data.label}</p>
      <Handle type="source" id="out" position={Position.Bottom} aria-label="Trigger output" className="!size-3" />
    </div>
  );
}
