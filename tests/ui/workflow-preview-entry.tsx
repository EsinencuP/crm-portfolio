import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { WorkflowsList } from "@/app/(dashboard)/dashboard/workflows/_components/workflows-list";
import { WorkflowCanvas } from "@/app/(dashboard)/dashboard/workflows/[id]/_components/workflow-canvas";
import { workflowSchema } from "@/lib/workflows/config";
import type { EditorWorkflow } from "@/lib/workflows/editor";

const now = new Date().toISOString();
const workflows: EditorWorkflow[] = [
  {
    id: "fixture-workflow",
    name: "Example lead follow-up",
    description: null,
    trigger: "CONTACT_CREATED",
    triggerConfig: { conditions: [] },
    isActive: false,
    updatedAt: now,
    canvas: null,
    steps: [
      { type: "WAIT", config: { duration: 60 } },
      { type: "SEND_NOTIFICATION", config: { title: "New lead {{firstName}}", body: "Example fixture" } },
    ],
  },
];
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (!url.pathname.startsWith("/api/workflows")) throw new Error("Preview blocks non-fixture requests.");
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const id = url.pathname.split("/")[3];
  const workflow = workflows.find((item) => item.id === id);
  if (url.pathname.endsWith("/options"))
    return Response.json({
      users: [{ id: "fixture-user", name: "Example teammate" }],
      stages: [{ id: "fixture-stage", name: "Qualified" }],
      tags: [{ id: "fixture-tag", name: "Website" }],
      accounts: [{ id: "fixture-account", email: "sender@example.test" }],
    });
  if (url.pathname.endsWith("/runs"))
    return Response.json({
      runs: [
        {
          id: "fixture-run",
          startedAt: now,
          completedAt: now,
          entityType: "Contact",
          entityId: "fixture-contact",
          status: "COMPLETED",
          logs: [
            { step: 0, action: "WAIT", result: { duration: 60 } },
            { step: 1, action: "SEND_NOTIFICATION", result: { notificationId: "fixture-notification" } },
          ],
          error: null,
        },
      ],
      total: 1,
    });
  if (workflow && ["PUT", "PATCH"].includes(init?.method ?? "")) {
    if (body.updatedAt !== workflow.updatedAt)
      return Response.json({ error: "Workflow changed. Reload before saving." }, { status: 409 });
    const { updatedAt: _version, ...changes } = body;
    const parsed = workflowSchema.safeParse({
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      triggerConfig: workflow.triggerConfig,
      isActive: workflow.isActive,
      canvas: workflow.canvas,
      steps: workflow.steps,
      ...changes,
    });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    Object.assign(workflow, parsed.data, { updatedAt: new Date().toISOString() });
    return Response.json({ workflow });
  }
  if (init?.method === "POST") {
    const parsed = workflowSchema.parse(body);
    const created = { ...parsed, canvas: parsed.canvas ?? null, id: crypto.randomUUID(), updatedAt: now };
    workflows.push(created);
    return Response.json({ workflow: created }, { status: 201 });
  }
  if (workflow) return Response.json({ workflow });
  return Response.json({
    workflows: workflows.map((item) => ({ ...item, runCount: 1, lastRunAt: now })),
    total: workflows.length,
  });
};
function Preview() {
  const [selected, setSelected] = useState<string | null>(null);
  const workflow = workflows.find((item) => item.id === selected);
  return (
    <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <p role="status" className="rounded-md border bg-muted p-3 text-sm">
        UI test fixtures — no live CRM, worker, email or webhook connections
      </p>
      {workflow ? (
        <WorkflowCanvas
          key={selected}
          workspaceId="fixture-workspace"
          initialWorkflow={structuredClone(workflow)}
          onBack={() => setSelected(null)}
        />
      ) : (
        <WorkflowsList workspaceId="fixture-workspace" onOpen={setSelected} />
      )}
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root.");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Preview />
  </QueryClientProvider>,
);
