"use client";

import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, Copy, RefreshCw, Send, Webhook, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { webhookEvents } from "@/lib/webhooks/config";

type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  failCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Delivery = {
  id: string;
  event: string;
  payload: unknown;
  status: "PENDING" | "SUCCESS" | "FAILED" | "RETRYING";
  attempts: number;
  nextRetryAt: string | null;
  responseCode: number | null;
  responseBody: string | null;
  duration: number | null;
  error: string | null;
  createdAt: string;
};
type Draft = {
  name: string;
  url: string;
  events: string[];
  headers: string;
  replaceHeaders: boolean;
  original: Endpoint | null;
};
const emptyDraft = (): Draft => ({
  name: "",
  url: "",
  events: ["contact.created"],
  headers: "{}",
  replaceHeaders: false,
  original: null,
});
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}
const write = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
function DeliveryBadge({ status }: { status: Delivery["status"] }) {
  const Icon = status === "SUCCESS" ? CheckCircle2 : status === "FAILED" ? XCircle : RefreshCw;
  return (
    <Badge variant={status === "FAILED" ? "destructive" : "secondary"}>
      <Icon aria-hidden="true" className="mr-1 size-3" />
      {status}
    </Badge>
  );
}
function DeliveryHistory({ endpointId, workspaceId }: { endpointId: string; workspaceId: string }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const query = useQuery<{ deliveries: Delivery[]; total: number }>({
    queryKey: ["webhook-deliveries", workspaceId, endpointId, page],
    queryFn: () => request(`/api/webhooks-config/${endpointId}/deliveries?page=${page}`),
    refetchInterval: (query) =>
      query.state.data?.deliveries.some((item) => ["PENDING", "RETRYING"].includes(item.status)) ? 5000 : false,
  });
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Delivery history</h3>
        <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>
      {query.isPending && (
        <p role="status" className="text-sm">
          Loading deliveries…
        </p>
      )}
      {query.error && (
        <p role="alert" className="text-destructive text-sm">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="whitespace-nowrap">{new Date(delivery.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{delivery.event}</TableCell>
                  <TableCell>
                    <DeliveryBadge status={delivery.status} />
                  </TableCell>
                  <TableCell>{delivery.attempts}/4</TableCell>
                  <TableCell>{delivery.responseCode ?? "—"}</TableCell>
                  <TableCell>{delivery.duration == null ? "—" : `${delivery.duration} ms`}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(delivery)}>
                      View payload
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.data.deliveries.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No deliveries yet. Send a test to verify this endpoint.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm">Page {page}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 25 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery details</DialogTitle>
            <DialogDescription>Payload, response and retry information for this delivery.</DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <DeliveryBadge status={selected.status} />
              <p className="break-all text-muted-foreground text-xs">Delivery ID: {selected.id}</p>
              {selected.nextRetryAt && (
                <p className="text-sm">Next retry: {new Date(selected.nextRetryAt).toLocaleString()}</p>
              )}
              {selected.error && (
                <p role="alert" className="text-destructive text-sm">
                  {selected.error}
                </p>
              )}
              <h4 className="font-medium">Payload</h4>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
              <h4 className="font-medium">Response ({selected.responseCode ?? "no HTTP response"})</h4>
              <pre className="max-h-48 whitespace-pre-wrap break-words overflow-auto rounded-md bg-muted p-3 text-xs">
                {selected.responseBody ?? "No response body."}
              </pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function WebhookSettings({ workspaceId }: { workspaceId: string }) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Endpoint | null>(null);
  const [test, setTest] = useState<{ endpointId: string; deliveryId: string } | null>(null);
  const query = useQuery<{ webhooks: Endpoint[]; total: number }>({
    queryKey: ["webhooks-config", workspaceId, page],
    queryFn: () => request(`/api/webhooks-config?page=${page}`),
  });
  const testQuery = useQuery<{ deliveries: Delivery[] }>({
    queryKey: ["webhook-test", workspaceId, test?.deliveryId],
    enabled: Boolean(test),
    queryFn: () => request(`/api/webhooks-config/${test?.endpointId}/deliveries?deliveryId=${test?.deliveryId}`),
    refetchInterval: (query) =>
      !query.state.error &&
      (!query.state.data?.deliveries[0] || ["PENDING", "RETRYING"].includes(query.state.data.deliveries[0].status))
        ? 2000
        : false,
    retry: false,
  });
  const tested = testQuery.data?.deliveries[0];
  useEffect(() => {
    if (tested && ["SUCCESS", "FAILED"].includes(tested.status)) {
      void cache.invalidateQueries({ queryKey: ["webhooks-config", workspaceId] });
      void cache.invalidateQueries({ queryKey: ["webhook-deliveries", workspaceId] });
    }
  }, [tested, cache, workspaceId]);
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ["webhooks-config", workspaceId] });
  }
  function edit(endpoint?: Endpoint) {
    setDraft(
      endpoint
        ? {
            name: endpoint.name,
            url: endpoint.url,
            events: endpoint.events,
            original: endpoint,
            headers: "{}",
            replaceHeaders: false,
          }
        : emptyDraft(),
    );
    setError(null);
    setDialog(true);
  }
  async function save() {
    setError(null);
    setBusy("save");
    try {
      const body = {
        name: draft.name,
        url: draft.url,
        events: draft.events,
        ...(!draft.original || draft.replaceHeaders ? { headers: JSON.parse(draft.headers) } : {}),
        ...(draft.original ? { updatedAt: draft.original.updatedAt } : {}),
      };
      const result = await request(
        draft.original ? `/api/webhooks-config/${draft.original.id}` : "/api/webhooks-config",
        write(draft.original ? "PATCH" : "POST", body),
      );
      if (result.signingSecret) setSigningSecret(result.signingSecret);
      setDialog(false);
      setNotice(
        draft.original
          ? "Webhook updated. Existing deliveries retain their original configuration."
          : "Webhook created. Copy the signing secret below.",
      );
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save webhook.");
    } finally {
      setBusy(null);
    }
  }
  async function mutate(endpoint: Endpoint, action: "toggle" | "rotate" | "delete" | "test") {
    setBusy(endpoint.id);
    setError(null);
    setNotice("");
    try {
      if (action === "test") {
        const result = await request(
          `/api/webhooks-config/${endpoint.id}/test`,
          write("POST", { requestId: crypto.randomUUID() }),
        );
        setTest({ endpointId: endpoint.id, deliveryId: result.deliveryId });
        setExpanded(endpoint.id);
        setNotice(result.message);
        await cache.invalidateQueries({ queryKey: ["webhook-deliveries", workspaceId, endpoint.id] });
      } else if (action === "delete") {
        await request(`/api/webhooks-config/${endpoint.id}`, write("DELETE"));
        setToDelete(null);
        if (expanded === endpoint.id) setExpanded(null);
        if (test?.endpointId === endpoint.id) setTest(null);
        setNotice("Webhook deleted. Future deliveries are stopped; history is retained in the database.");
      } else {
        const result = await request(
          `/api/webhooks-config/${endpoint.id}`,
          write("PATCH", {
            updatedAt: endpoint.updatedAt,
            ...(action === "toggle" ? { isActive: !endpoint.isActive } : { rotateSecret: true }),
          }),
        );
        if (result.signingSecret) {
          setSigningSecret(result.signingSecret);
          setNotice("Signing secret rotated. Update the receiver; already queued deliveries retain the prior secret.");
        }
      }
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Webhook operation failed.");
    } finally {
      setBusy(null);
    }
  }
  async function copySecret() {
    try {
      if (signingSecret) await navigator.clipboard.writeText(signingSecret);
      setNotice("Signing secret copied.");
    } catch {
      setNotice("Clipboard unavailable. Select and copy the secret manually.");
    }
  }
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-2xl">
            <Webhook aria-hidden="true" className="size-6" />
            Webhooks
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">Send signed CRM events to your integrations.</p>
        </div>
        <Button onClick={() => edit()} disabled={Boolean(busy)}>
          + Create Webhook
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        HTTPS endpoints only · HMAC SHA-256 · Initial delivery + retries after 1, 5 and 30 minutes. The webhook worker
        must be running.
      </p>
      {(error || query.error) && (
        <p role="alert" className="text-destructive text-sm">
          {error ?? query.error?.message}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {signingSecret && (
        <Card>
          <CardHeader>
            <CardTitle>Save your signing secret</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Shown only after creation or rotation. It cannot be retrieved later.
            </p>
            <Input
              aria-label="Signing secret"
              readOnly
              value={signingSecret}
              onFocus={(event) => event.target.select()}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void copySecret()}>
                <Copy />
                Copy secret
              </Button>
              <Button variant="ghost" onClick={() => setSigningSecret(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {test && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4" />
              Test delivery result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {testQuery.error && (
              <p role="alert" className="text-destructive text-sm">
                {testQuery.error.message}
              </p>
            )}
            {tested ? (
              <>
                <DeliveryBadge status={tested.status} />
                <p className="text-sm">
                  HTTP {tested.responseCode ?? "—"} · {tested.attempts}/4 attempts ·{" "}
                  {tested.duration == null ? "—" : `${tested.duration} ms`}
                </p>
                {tested.error && <p className="text-destructive text-sm">{tested.error}</p>}
                {tested.nextRetryAt && (
                  <p className="text-muted-foreground text-sm">
                    Next retry: {new Date(tested.nextRetryAt).toLocaleString()}
                  </p>
                )}
                {tested.responseBody && (
                  <pre className="max-h-36 whitespace-pre-wrap break-words overflow-auto rounded-md bg-muted p-3 text-xs">
                    {tested.responseBody}
                  </pre>
                )}
                {tested.status === "PENDING" && (
                  <p className="text-muted-foreground text-sm">Queued — waiting for the webhook worker.</p>
                )}
              </>
            ) : (
              <p role="status" className="text-muted-foreground text-sm">
                Waiting for delivery status…
              </p>
            )}
            <Button size="sm" variant="ghost" onClick={() => setTest(null)}>
              Dismiss result
            </Button>
          </CardContent>
        </Card>
      )}
      {query.isPending && <p role="status">Loading webhooks…</p>}
      {query.data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Failures</TableHead>
                <TableHead>Last triggered</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.webhooks.map((endpoint) => (
                <EndpointRows
                  key={endpoint.id}
                  endpoint={endpoint}
                  expanded={expanded === endpoint.id}
                  workspaceId={workspaceId}
                  busy={Boolean(busy)}
                  toggleExpanded={() => setExpanded(expanded === endpoint.id ? null : endpoint.id)}
                  edit={() => edit(endpoint)}
                  mutate={(action) => void mutate(endpoint, action)}
                  remove={() => setToDelete(endpoint)}
                />
              ))}
            </TableBody>
          </Table>
          {query.data.webhooks.length === 0 && (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <Webhook aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="font-medium">No webhook endpoints yet</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Create an endpoint and select which CRM events it should receive.
              </p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm">Page {page}</span>
            <Button variant="outline" disabled={page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={dialog}
        onOpenChange={(value) => {
          if (!busy) setDialog(value);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft.original ? "Edit webhook" : "Create webhook"}</DialogTitle>
            <DialogDescription>
              A signing secret is generated automatically. Custom headers are encrypted and never returned by list APIs.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Name</Label>
              <Input
                id="webhook-name"
                required
                maxLength={160}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                type="url"
                required
                maxLength={2048}
                placeholder="https://your-service.com/crm-events"
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </div>
            <fieldset>
              <legend className="mb-2 font-medium text-sm">Events</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {webhookEvents.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.events.includes(name)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          events: event.target.checked
                            ? [...draft.events, name]
                            : draft.events.filter((item) => item !== name),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.original && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.replaceHeaders}
                  onChange={(event) => setDraft({ ...draft, replaceHeaders: event.target.checked })}
                />
                Replace saved custom headers (an empty object clears them)
              </label>
            )}
            {(!draft.original || draft.replaceHeaders) && (
              <div className="space-y-2">
                <Label htmlFor="webhook-headers">Custom headers (JSON object, optional)</Label>
                <textarea
                  id="webhook-headers"
                  className="w-full rounded-md border bg-background p-3 font-mono text-xs"
                  rows={3}
                  maxLength={16000}
                  value={draft.headers}
                  onChange={(event) => setDraft({ ...draft, headers: event.target.value })}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={Boolean(busy) || !draft.events.length}>
              {busy ? "Saving…" : "Save webhook"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(value) => {
          if (!busy && !value) setToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete webhook?</DialogTitle>
            <DialogDescription>
              Future deliveries and pending retries will stop. A request already in progress cannot be recalled.
              Historical deliveries remain stored for audit.
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="destructive"
            disabled={Boolean(busy)}
            onClick={() => {
              if (toDelete) void mutate(toDelete, "delete");
            }}
          >
            Delete webhook
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function EndpointRows({
  endpoint,
  expanded,
  workspaceId,
  busy,
  toggleExpanded,
  edit,
  mutate,
  remove,
}: {
  endpoint: Endpoint;
  expanded: boolean;
  workspaceId: string;
  busy: boolean;
  toggleExpanded: () => void;
  edit: () => void;
  mutate: (action: "toggle" | "rotate" | "test") => void;
  remove: () => void;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <>
      <TableRow>
        <TableCell>
          <Button size="sm" variant="ghost" onClick={toggleExpanded} aria-expanded={expanded}>
            <Icon />
            {endpoint.name}
          </Button>
          <p className="max-w-64 truncate text-muted-foreground text-xs" title={endpoint.url}>
            {endpoint.url}
          </p>
        </TableCell>
        <TableCell>
          <div className="flex max-w-64 flex-wrap gap-1">
            {endpoint.events.map((event) => (
              <Badge key={event} variant="outline">
                {event}
              </Badge>
            ))}
          </div>
        </TableCell>
        <TableCell>
          <Switch
            aria-label={`Activate ${endpoint.name}`}
            checked={endpoint.isActive}
            disabled={busy}
            onCheckedChange={() => mutate("toggle")}
          />
        </TableCell>
        <TableCell className={endpoint.failCount > 0 ? "font-medium text-destructive" : ""}>
          {endpoint.failCount}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {endpoint.lastTriggeredAt ? new Date(endpoint.lastTriggeredAt).toLocaleString() : "Never"}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => mutate("test")}>
              Test
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={edit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => mutate("rotate")}>
              Rotate secret
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
              Delete
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6}>
            <DeliveryHistory endpointId={endpoint.id} workspaceId={workspaceId} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
