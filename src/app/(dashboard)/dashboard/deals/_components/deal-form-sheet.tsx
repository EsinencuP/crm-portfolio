"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createDealSchema } from "@/lib/validations/deal";

import type { KanbanDeal } from "./deal-card";
import type { PipelineStage } from "./pipeline-column";

type InputValues = z.input<typeof createDealSchema>;
type OutputValues = z.output<typeof createDealSchema>;
type Option = { id: string; name: string };
type ContactOption = { id: string; firstName: string; lastName: string };
type ApiError = { error?: string; fieldErrors?: Record<string, string[]> };

async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load options.");
  return response.json() as Promise<T>;
}

function defaults(deal?: KanbanDeal, stageId?: string): InputValues {
  return {
    title: deal?.title ?? "",
    value: deal?.value ?? null,
    currency: deal?.currency ?? "USD",
    closeDate: deal?.closeDate?.slice(0, 10) ?? null,
    priority: deal?.priority ?? "MEDIUM",
    description: deal?.description ?? null,
    stageId: deal?.stageId ?? stageId ?? "",
    contactId: deal?.contact?.id ?? null,
    companyId: deal?.company?.id ?? null,
    ownerId: deal?.owner?.id ?? null,
  };
}

export function DealFormSheet({
  open,
  onOpenChange,
  deal,
  stages,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: KanbanDeal;
  stages: PipelineStage[];
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [companySearch, setCompanySearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const form = useForm<InputValues, unknown, OutputValues>({
    resolver: zodResolver(createDealSchema),
    defaultValues: defaults(deal, stages[0]?.id),
  });
  useEffect(() => {
    if (open) form.reset(defaults(deal, stages[0]?.id));
  }, [open, deal, stages, form.reset]);

  const companiesQuery = useQuery({
    queryKey: ["deal-companies", companySearch],
    queryFn: ({ signal }) =>
      load<{ companies: Option[] }>(`/api/companies?limit=100&search=${encodeURIComponent(companySearch)}`, signal),
    enabled: open,
  });
  const contactsQuery = useQuery({
    queryKey: ["deal-contacts", contactSearch],
    queryFn: ({ signal }) =>
      load<{ contacts: ContactOption[] }>(
        `/api/contacts?limit=100&search=${encodeURIComponent(contactSearch)}`,
        signal,
      ),
    enabled: open,
  });
  const membersQuery = useQuery({
    queryKey: ["deal-team-members"],
    queryFn: ({ signal }) => load<{ members: Option[] }>("/api/team-members", signal),
    enabled: open,
  });
  const companies = [...(companiesQuery.data?.companies ?? [])];
  const contacts = [...(contactsQuery.data?.contacts ?? [])];
  const members = [...(membersQuery.data?.members ?? [])];
  if (deal?.company && !companies.some((company) => company.id === deal.company?.id)) companies.push(deal.company);
  if (deal?.contact && !contacts.some((contact) => contact.id === deal.contact?.id)) contacts.push(deal.contact);
  if (deal?.owner && !members.some((member) => member.id === deal.owner?.id)) members.push(deal.owner);

  async function submit(values: OutputValues) {
    form.clearErrors("root");
    try {
      const response = await fetch(deal ? `/api/deals/${encodeURIComponent(deal.id)}` : "/api/deals", {
        method: deal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body: ApiError = await response.json().catch(() => ({}));
        for (const [field, messages] of Object.entries(body.fieldErrors ?? {})) {
          if (messages?.[0] && field in values) form.setError(field as keyof InputValues, { message: messages[0] });
        }
        throw new Error(body.error ?? "Unable to save deal.");
      }
      toast.success(deal ? "Deal updated" : "Deal created");
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
      router.refresh();
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save deal.";
      form.setError("root", { message });
      toast.error(message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{deal ? "Edit Deal" : "New Deal"}</SheetTitle>
          <SheetDescription>
            {deal ? "Update deal details and relationships." : "Add a deal to your pipeline."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form id="deal-form" onSubmit={form.handleSubmit(submit)} className="space-y-4 px-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">Title *</Label>
              <Input id="deal-title" {...form.register("title")} aria-invalid={!!form.formState.errors.title} />
              <p className="text-destructive text-xs">{form.formState.errors.title?.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="deal-value">Value</Label>
                <Input
                  id="deal-value"
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register("value", { setValueAs: (value) => (value === "" ? null : value) })}
                />
                <p className="text-destructive text-xs">{form.formState.errors.value?.message}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal-currency">Currency</Label>
                <Input id="deal-currency" maxLength={3} {...form.register("currency")} />
                <p className="text-destructive text-xs">{form.formState.errors.currency?.message}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="deal-close-date">Close date</Label>
                <Input
                  id="deal-close-date"
                  type="date"
                  {...form.register("closeDate", { setValueAs: (value) => (value === "" ? null : value) })}
                />
                <p className="text-destructive text-xs">{form.formState.errors.closeDate?.message}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Stage *</Label>
              <Controller
                control={form.control}
                name="stageId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Stage">
                      <SelectValue placeholder="Select stage">
                        {stages.find((stage) => stage.id === field.value)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-destructive text-xs">{form.formState.errors.stageId?.message}</p>
              {stages.length === 0 && (
                <p className="text-muted-foreground text-xs">Create a pipeline stage before adding deals.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input
                aria-label="Search companies"
                placeholder="Search companies…"
                value={companySearch}
                onChange={(event) => setCompanySearch(event.target.value)}
              />
              <Controller
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  >
                    <SelectTrigger aria-label="Company">
                      <SelectValue>
                        {companies.find((company) => company.id === field.value)?.name ?? "No company"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No company</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input
                aria-label="Search contacts"
                placeholder="Search contacts…"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
              />
              <Controller
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  >
                    <SelectTrigger aria-label="Contact">
                      <SelectValue>
                        {contacts.find((contact) => contact.id === field.value)
                          ? `${contacts.find((contact) => contact.id === field.value)?.firstName} ${contacts.find((contact) => contact.id === field.value)?.lastName}`
                          : "No contact"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No contact</SelectItem>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.firstName} {contact.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Controller
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  >
                    <SelectTrigger aria-label="Owner">
                      <SelectValue>
                        {members.find((member) => member.id === field.value)?.name ?? "Unassigned"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-description">Description</Label>
              <Textarea
                id="deal-description"
                rows={4}
                {...form.register("description", { setValueAs: (value) => (value === "" ? null : value) })}
              />
              <p className="text-destructive text-xs">{form.formState.errors.description?.message}</p>
            </div>
            {form.formState.errors.root?.message && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}
          </form>
        </Form>
        <SheetFooter className="mt-auto">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="deal-form" disabled={form.formState.isSubmitting || stages.length === 0}>
            {form.formState.isSubmitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}Save Deal
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DealEditButton({ deal, stages }: { deal: KanbanDeal; stages: PipelineStage[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit deal
      </Button>
      <DealFormSheet open={open} onOpenChange={setOpen} deal={deal} stages={stages} />
    </>
  );
}
