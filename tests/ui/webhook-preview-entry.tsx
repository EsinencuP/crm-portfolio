import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { WebhookSettings } from "@/app/(dashboard)/dashboard/settings/webhooks/webhook-settings";

// This isolated preview never mounts CRM auth, Prisma, Redis or a delivery transport.
const now = new Date().toISOString();
let endpoints = [
  {
    id: "fixture-1",
    name: "Example CRM receiver",
    url: "https://receiver.example.test/events",
    events: ["contact.created", "deal.won"],
    isActive: true,
    failCount: 0,
    lastTriggeredAt: now,
    createdAt: now,
    updatedAt: now,
  },
];
const deliveries = [
  {
    id: "delivery-fixture",
    event: "contact.created",
    payload: { event: "contact.created", data: { firstName: "Example" } },
    status: "SUCCESS",
    attempts: 1,
    nextRetryAt: null,
    responseCode: 200,
    responseBody: '{"accepted":true}',
    duration: 143,
    error: null,
    createdAt: now,
  },
];
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (!url.pathname.startsWith("/api/webhooks-config")) throw new Error("Preview blocks non-fixture requests.");
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const id = url.pathname.split("/")[3];
  const endpoint = endpoints.find((item) => item.id === id);
  let result: unknown;
  if (url.pathname.endsWith("/deliveries")) {
    const rows = url.searchParams.has("deliveryId")
      ? deliveries.filter((item) => item.id === url.searchParams.get("deliveryId"))
      : deliveries;
    result = { deliveries: rows, total: rows.length };
  } else if (url.pathname.endsWith("/test")) {
    const delivery = {
      ...deliveries[0],
      id: crypto.randomUUID(),
      event: "webhook.test",
      status: "PENDING",
      responseCode: 0,
    };
    deliveries.unshift(delivery);
    setTimeout(() => {
      delivery.status = "SUCCESS";
      delivery.responseCode = 200;
    }, 300);
    result = { deliveryId: delivery.id, queued: true };
  } else if (init?.method === "DELETE") {
    endpoints = endpoints.filter((item) => item.id !== id);
    return new Response(null, { status: 204 });
  } else if (init?.method === "PATCH" && endpoint) {
    Object.assign(endpoint, body, { updatedAt: new Date().toISOString() });
    result = {
      webhook: endpoint,
      ...(body.rotateSecret ? { signingSecret: "fixture-only-not-a-real-signing-secret" } : {}),
    };
  } else if (init?.method === "POST") {
    const created = { ...endpoints[0], ...body, id: crypto.randomUUID(), failCount: 0, createdAt: now, updatedAt: now };
    endpoints.push(created);
    result = { webhook: created, signingSecret: "fixture-only-not-a-real-signing-secret" };
  } else result = { webhooks: endpoints, total: endpoints.length, page: 1 };
  return Response.json(result);
};
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root.");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <p role="status" className="rounded-md border bg-muted p-3 text-sm">
        UI test fixtures — no live CRM/provider connections
      </p>
      <WebhookSettings workspaceId="fixture-workspace" />
    </main>
  </QueryClientProvider>,
);
