"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type FormConfig, formConfigSchema } from "@/lib/forms/config";

import { formsRequest } from "../../_components/forms-list";
import { EmbedCodeDialog } from "./embed-code-dialog";
import { FormBuilder } from "./form-builder";
import { FormSubmissions } from "./form-submissions";

type Option = { id: string; name: string };
export function FormEditor({
  workspaceId,
  formId,
  initialConfig,
  initialVersion,
}: {
  workspaceId: string;
  formId: string;
  initialConfig: FormConfig;
  initialVersion: string;
}) {
  const router = useRouter();
  const cache = useQueryClient();
  const [config, setConfig] = useState(initialConfig);
  const [saved, setSaved] = useState(initialConfig);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const options = useQuery<{ users: Option[]; tags: Option[]; stages: Option[] }>({
    queryKey: ["form-options", workspaceId],
    queryFn: () => formsRequest("/api/forms/options"),
  });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change<K extends keyof FormConfig>(key: K, value: FormConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setStatus("");
  }
  async function save() {
    const parsed = formConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      const result = await formsRequest(`/api/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, updatedAt: version }),
      });
      setVersion(result.form.updatedAt);
      setSaved(parsed.data);
      setConfig(parsed.data);
      setStatus("Form saved.");
      await cache.invalidateQueries({ queryKey: ["forms"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await formsRequest(`/api/forms/${formId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedAt: version }),
      });
      await cache.invalidateQueries({ queryKey: ["forms"] });
      router.push("/dashboard/forms");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to delete.");
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/forms" className="text-muted-foreground text-sm underline">
            All forms
          </Link>
          <h1 className="mt-2 font-semibold text-2xl">{config.name}</h1>
          <p className="text-muted-foreground text-sm">{dirty ? "Unsaved changes" : "All changes saved"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link href={`/forms/${saved.slug}`} target="_blank" rel="noopener noreferrer" />}
          >
            Open public form
          </Button>
          <EmbedCodeDialog slug={saved.slug} />
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "Saving…" : "Save form"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-sm">
        {status}
      </p>
      <fieldset disabled={busy} className="min-w-0">
        <Tabs defaultValue="builder">
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="builder" className="pt-4">
            <FormBuilder config={config} onChange={(fields) => change("fields", fields)} />
          </TabsContent>
          <TabsContent value="submissions" className="pt-4">
            <FormSubmissions formId={formId} />
          </TabsContent>
          <TabsContent value="settings" className="max-w-3xl space-y-5 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm" htmlFor="settings-name">
                Name
                <Input
                  id="settings-name"
                  value={config.name}
                  maxLength={160}
                  onChange={(event) => change("name", event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm" htmlFor="settings-slug">
                Public slug
                <Input
                  id="settings-slug"
                  value={config.slug}
                  maxLength={100}
                  onChange={(event) => change("slug", event.target.value)}
                />
              </label>
            </div>
            <label htmlFor="settings-description" className="block space-y-1 text-sm">
              Description
              <textarea
                id="settings-description"
                className="block w-full rounded-md border bg-background p-2"
                maxLength={2000}
                value={config.description ?? ""}
                onChange={(event) => change("description", event.target.value || null)}
              />
            </label>
            <label htmlFor="settings-thanks" className="block space-y-1 text-sm">
              Thank-you message
              <Input
                id="settings-thanks"
                value={config.thankyouMessage}
                maxLength={2000}
                onChange={(event) => change("thankyouMessage", event.target.value)}
              />
            </label>
            <label htmlFor="settings-redirect" className="block space-y-1 text-sm">
              Redirect URL (optional, HTTP/HTTPS)
              <Input
                id="settings-redirect"
                value={config.redirectUrl ?? ""}
                maxLength={2048}
                onChange={(event) => change("redirectUrl", event.target.value || null)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label htmlFor="settings-theme" className="space-y-1 text-sm">
                Theme
                <select
                  id="settings-theme"
                  className="block w-full rounded-md border bg-background p-2"
                  value={config.style.theme}
                  onChange={(event) =>
                    change("style", { ...config.style, theme: event.target.value as "light" | "dark" })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label htmlFor="settings-layout" className="space-y-1 text-sm">
                Layout
                <select
                  id="settings-layout"
                  className="block w-full rounded-md border bg-background p-2"
                  value={config.style.layout}
                  onChange={(event) =>
                    change("style", { ...config.style, layout: event.target.value as "stacked" | "two-column" })
                  }
                >
                  <option value="stacked">Stacked</option>
                  <option value="two-column">Two columns</option>
                </select>
              </label>
              <label htmlFor="settings-color" className="space-y-1 text-sm">
                Primary color
                <input
                  id="settings-color"
                  type="color"
                  className="block h-10 w-full"
                  value={config.style.primaryColor}
                  onChange={(event) => change("style", { ...config.style, primaryColor: event.target.value })}
                />
              </label>
            </div>
            {options.error && (
              <p role="alert" className="text-destructive text-sm">
                {options.error.message}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="settings-owner" className="space-y-1 text-sm">
                Lead owner
                <select
                  id="settings-owner"
                  disabled={!options.data}
                  className="block w-full rounded-md border bg-background p-2"
                  value={config.assignToId ?? ""}
                  onChange={(event) => change("assignToId", event.target.value || null)}
                >
                  <option value="">Form creator / workspace administrator</option>
                  {options.data?.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="settings-stage" className="space-y-1 text-sm">
                Create deal in stage
                <select
                  id="settings-stage"
                  disabled={!options.data}
                  className="block w-full rounded-md border bg-background p-2"
                  value={config.pipelineStageId ?? ""}
                  onChange={(event) => change("pipelineStageId", event.target.value || null)}
                >
                  <option value="">Do not create a deal</option>
                  {options.data?.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm">Apply tags</legend>
              <div className="flex flex-wrap gap-3">
                {options.data?.tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.tagIds.includes(tag.id)}
                      onChange={(event) =>
                        change(
                          "tagIds",
                          event.target.checked
                            ? [...config.tagIds, tag.id]
                            : config.tagIds.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
              {options.data?.tags.length === 0 && (
                <p className="text-muted-foreground text-xs">No tags in this workspace.</p>
              )}
            </fieldset>
            <p className="text-muted-foreground text-xs">
              Existing contacts keep their data and owner. Tags and deals are applied only when the lead owner can edit
              the matched contact.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.isActive}
                onChange={(event) => change("isActive", event.target.checked)}
              />
              Public form is active
            </label>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete form
            </Button>
          </TabsContent>
        </Tabs>
      </fieldset>
      <Dialog
        open={deleteOpen}
        onOpenChange={(value) => {
          if (!busy) setDeleteOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this form?</DialogTitle>
            <DialogDescription>
              This permanently deletes the form and its submission history. Contacts and deals will remain in the CRM.
            </DialogDescription>
          </DialogHeader>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
