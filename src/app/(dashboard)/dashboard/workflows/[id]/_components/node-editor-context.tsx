"use client";

import { createContext, useContext, useId } from "react";

import type { Node } from "@xyflow/react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type EditorOptions, emptyEditorOptions, type StepKind } from "@/lib/workflows/editor";

export type WorkflowNode = Node<
  { kind?: StepKind; config: Record<string, unknown>; label: string },
  "trigger" | "condition" | "action" | "wait"
>;
export const NodeEditorContext = createContext<{
  options: EditorOptions;
  disabled: boolean;
  update: (id: string, config: Record<string, unknown>) => void;
}>({
  options: emptyEditorOptions,
  disabled: false,
  update: () => {
    throw new Error("Missing node editor context.");
  },
});
export const useNodeEditor = () => useContext(NodeEditorContext);
export function EditorSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="nodrag nopan space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select
        value={value || null}
        disabled={disabled}
        items={options}
        onValueChange={(value) => {
          if (value != null) onChange(String(value));
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
