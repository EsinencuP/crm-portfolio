"use client";

import { useState } from "react";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Play } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stepLabels } from "@/lib/workflows/editor";

import { EditorSelect, useNodeEditor, type WorkflowNode } from "../node-editor-context";

const updateFields = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobTitle",
  "city",
  "country",
  "notes_text",
  "status",
  "source",
  "title",
  "description",
  "value",
  "currency",
  "priority",
  "completed",
  "dueDate",
];
export function ActionNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const { options, disabled, update } = useNodeEditor();
  const config = data.config;
  const [headerText, setHeaderText] = useState(JSON.stringify(config.headers ?? {}, null, 2));
  const [headerError, setHeaderError] = useState("");
  const patch = (key: string, value: unknown) => update(id, { ...config, [key]: value });
  const users = [
    { value: "__creator", label: "Workflow creator" },
    ...options.users.map((user) => ({ value: user.id, label: user.name ?? user.id })),
  ];
  const text = (key: string, label: string, multiline = false) => (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={`${id}-${key}`}>
        {label}
      </Label>
      {multiline ? (
        <textarea
          id={`${id}-${key}`}
          className="nowheel w-full rounded-md border bg-background p-2 text-foreground text-xs"
          rows={4}
          value={String(config[key] ?? "")}
          onChange={(event) => patch(key, event.target.value)}
        />
      ) : (
        <Input
          id={`${id}-${key}`}
          value={String(config[key] ?? "")}
          onChange={(event) => patch(key, event.target.value)}
        />
      )}
    </div>
  );
  return (
    <div
      className={`w-80 rounded-xl border-2 border-blue-600 bg-blue-50 p-4 text-blue-950 shadow-sm dark:bg-blue-950 dark:text-blue-100 ${selected ? "ring-2 ring-ring ring-offset-2" : ""}`}
    >
      <Handle type="target" position={Position.Top} aria-label="Action input" className="!size-3" />
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <Play className="size-4" aria-hidden="true" />
        {data.kind ? stepLabels[data.kind] : "Action"}
      </div>
      <fieldset disabled={disabled} className="nodrag nopan space-y-3">
        {data.kind === "SEND_EMAIL" && (
          <>
            <EditorSelect
              label="Sending account"
              value={String(config.accountId ?? "")}
              options={options.accounts.map((account) => ({ value: account.id, label: account.email }))}
              onChange={(value) => patch("accountId", value)}
            />
            {!options.accounts.length && (
              <p className="text-xs">Connect an email account for the workflow creator first.</p>
            )}
            {text("subject", "Subject")}
            {text("bodyHtml", "Email body (HTML)", true)}
            <label className="flex gap-2 text-xs">
              <input
                type="checkbox"
                checked={Boolean(config.trackingEnabled)}
                onChange={(event) => patch("trackingEnabled", event.target.checked)}
              />
              Track opens/clicks
            </label>
          </>
        )}
        {data.kind === "CREATE_TASK" && (
          <>
            {text("title", "Task title")}
            {text("description", "Description", true)}
            <EditorSelect
              label="Assignee"
              value={String(config.userId ?? "__creator")}
              options={users}
              onChange={(value) => patch("userId", value === "__creator" ? undefined : value)}
            />
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`${id}-due`}>
                Due in minutes
              </Label>
              <Input
                id={`${id}-due`}
                type="number"
                min={0}
                value={Number(config.dueInMinutes ?? 1440)}
                onChange={(event) => patch("dueInMinutes", Number(event.target.value))}
              />
            </div>
          </>
        )}
        {data.kind === "UPDATE_FIELD" && (
          <>
            <EditorSelect
              label="Field"
              value={String(config.field)}
              options={updateFields.map((value) => ({ value, label: value }))}
              onChange={(value) =>
                update(id, { field: value, value: value === "completed" ? false : value === "value" ? 0 : "" })
              }
            />
            <Label className="text-xs" htmlFor={`${id}-new-value`}>
              New value
            </Label>
            <Input
              id={`${id}-new-value`}
              value={String(config.value ?? "")}
              onChange={(event) =>
                patch(
                  "value",
                  config.field === "value"
                    ? Number(event.target.value)
                    : config.field === "completed"
                      ? event.target.value === "true"
                      : event.target.value,
                )
              }
            />
            <p className="text-xs">Fields must match the triggering entity. Boolean: true/false; dates: ISO format.</p>
          </>
        )}
        {data.kind === "MOVE_STAGE" && (
          <EditorSelect
            label="Stage"
            value={String(config.stageId ?? "")}
            options={options.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
            onChange={(value) => patch("stageId", value)}
          />
        )}
        {data.kind === "ASSIGN_OWNER" && (
          <EditorSelect
            label="Owner"
            value={String(config.userId ?? "")}
            options={users.filter((user) => user.value !== "__creator")}
            onChange={(value) => patch("userId", value)}
          />
        )}
        {data.kind === "ADD_TAG" && (
          <EditorSelect
            label="Tag"
            value={String(config.tagId ?? "")}
            options={options.tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            onChange={(value) => patch("tagId", value)}
          />
        )}
        {data.kind === "SEND_NOTIFICATION" && (
          <>
            {text("title", "Notification title")}
            {text("body", "Body", true)}
            <EditorSelect
              label="Recipient"
              value={String(config.userId ?? "__creator")}
              options={users}
              onChange={(value) => patch("userId", value === "__creator" ? undefined : value)}
            />
          </>
        )}
        {data.kind === "CALL_WEBHOOK" && (
          <>
            {text("url", "HTTPS URL")}
            <EditorSelect
              label="Method"
              value={String(config.method ?? "POST")}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ value, label: value }))}
              onChange={(value) => patch("method", value)}
            />
            <Label className="text-xs" htmlFor={`${id}-headers`}>
              Headers (JSON)
            </Label>
            <textarea
              id={`${id}-headers`}
              className="nowheel w-full rounded-md border bg-background p-2 font-mono text-foreground text-xs"
              rows={3}
              value={headerText}
              onChange={(event) => {
                setHeaderText(event.target.value);
                try {
                  const headers: unknown = JSON.parse(event.target.value);
                  if (!headers || typeof headers !== "object" || Array.isArray(headers))
                    throw new Error("Use a JSON object.");
                  patch("headers", headers);
                  setHeaderError("");
                } catch {
                  patch("headers", null);
                  setHeaderError("Enter a valid JSON object before saving.");
                }
              }}
            />
            {headerError && (
              <p role="alert" className="text-destructive text-xs">
                {headerError}
              </p>
            )}
            <p className="text-xs">
              Host must be allowed by WORKFLOW_WEBHOOK_ALLOWED_HOSTS. Headers are visible to workflow editors; do not
              store private credentials here.
            </p>
          </>
        )}
      </fieldset>
      <Handle type="source" id="out" position={Position.Bottom} aria-label="Action output" className="!size-3" />
    </div>
  );
}
