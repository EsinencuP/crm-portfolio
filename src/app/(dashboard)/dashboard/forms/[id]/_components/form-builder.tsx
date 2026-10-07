"use client";

import { useState } from "react";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";

import { PublicForm } from "@/components/forms/public-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FormField, fieldTypes, type PublicFormConfig } from "@/lib/forms/config";

type EditorField = FormField & { id: string };
function FieldCard({
  field,
  index,
  total,
  change,
  remove,
  reorder,
}: {
  field: EditorField;
  index: number;
  total: number;
  change: (value: EditorField) => void;
  remove: () => void;
  reorder: (offset: number) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: field.id, index, type: "form-field", accept: "form-field" });
  const prefix = `editor-${field.id}`;
  return (
    <div ref={ref} className="space-y-3 rounded-lg border bg-card p-4" style={{ opacity: isDragging ? 0.5 : 1 }}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          ref={handleRef}
          aria-label={`Drag ${field.label}`}
          className="cursor-grab rounded p-1 focus-visible:outline-2"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 font-medium text-sm">Field {index + 1}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Move field up"
          disabled={index === 0}
          onClick={() => reorder(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Move field down"
          disabled={index === total - 1}
          onClick={() => reorder(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${field.label}`}
          disabled={total === 1}
          onClick={remove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${prefix}-label`} className="space-y-1 text-sm">
          Label
          <Input
            id={`${prefix}-label`}
            value={field.label}
            maxLength={160}
            onChange={(event) => change({ ...field, label: event.target.value })}
          />
        </label>
        <label htmlFor={`${prefix}-name`} className="space-y-1 text-sm">
          Data key
          <Input
            id={`${prefix}-name`}
            value={field.name}
            maxLength={64}
            onChange={(event) => change({ ...field, name: event.target.value })}
          />
        </label>
        <label htmlFor={`${prefix}-type`} className="space-y-1 text-sm">
          Type
          <select
            id={`${prefix}-type`}
            className="block w-full rounded-md border bg-background p-2"
            value={field.type}
            onChange={(event) =>
              change({
                ...field,
                type: event.target.value as FormField["type"],
                options: event.target.value === "select" ? (field.options ?? ["Option 1"]) : undefined,
              })
            }
          >
            {fieldTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${prefix}-placeholder`} className="space-y-1 text-sm">
          Placeholder
          <Input
            id={`${prefix}-placeholder`}
            value={field.placeholder}
            maxLength={200}
            onChange={(event) => change({ ...field, placeholder: event.target.value })}
          />
        </label>
      </div>
      {field.type === "select" && (
        <label htmlFor={`${prefix}-options`} className="block space-y-1 text-sm">
          Options (one per line)
          <textarea
            id={`${prefix}-options`}
            rows={3}
            className="block w-full rounded-md border bg-background p-2"
            value={field.options?.join("\n") ?? ""}
            onChange={(event) => change({ ...field, options: event.target.value.split("\n") })}
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => change({ ...field, required: event.target.checked })}
        />
        Required
      </label>
    </div>
  );
}
export function FormBuilder({
  config,
  onChange,
}: {
  config: PublicFormConfig;
  onChange: (fields: FormField[]) => void;
}) {
  const [fields, setFields] = useState<EditorField[]>(() =>
    config.fields.map((field, index) => ({ ...field, id: `field-${index}` })),
  );
  function update(next: EditorField[]) {
    setFields(next);
    onChange(next.map(({ id: _id, ...field }) => field));
  }
  function add(type: FormField["type"]) {
    const id = crypto.randomUUID();
    let name = `field${fields.length + 1}`;
    while (fields.some((field) => field.name === name)) name += "x";
    update([
      ...fields,
      {
        id,
        name,
        type,
        label: `New ${type} field`,
        required: false,
        placeholder: "",
        ...(type === "select" ? { options: ["Option 1", "Option 2"] } : {}),
      },
    ]);
  }
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {fieldTypes.map((type) => (
            <Button key={type} variant="outline" size="sm" disabled={fields.length >= 30} onClick={() => add(type)}>
              + {type}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          CRM keys: firstName, lastName, email, phone, message. Other keys are stored as custom data. Drag fields or use
          the arrow buttons.
        </p>
        <DragDropProvider
          onDragEnd={(event) => {
            if (!event.canceled) update(move(fields, event));
          }}
        >
          {fields.map((field, index) => (
            <FieldCard
              key={field.id}
              field={field}
              index={index}
              total={fields.length}
              change={(value) => update(fields.map((item) => (item.id === field.id ? value : item)))}
              remove={() => update(fields.filter((item) => item.id !== field.id))}
              reorder={(offset) => {
                const next = [...fields];
                [next[index], next[index + offset]] = [next[index + offset], next[index]];
                update(next);
              }}
            />
          ))}
        </DragDropProvider>
      </div>
      <div className="space-y-2 lg:sticky lg:top-6">
        <h2 className="font-medium">Live preview</h2>
        <PublicForm config={config} preview />
      </div>
    </div>
  );
}
