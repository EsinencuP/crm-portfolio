"use client";

import { useEffect, useId, useState } from "react";

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
import { createContactSchema } from "@/lib/validations/contact";

import type { ContactRow, ContactSource, ContactStatus } from "./contacts-columns";

type ContactFormInput = z.input<typeof createContactSchema>;
type ContactFormOutput = z.output<typeof createContactSchema>;
type CompanyOption = { id: string; name: string };
type MemberOption = { id: string; name: string; email: string };
type ApiError = { error?: string; fieldErrors?: Record<string, string[]> };

const sourceOptions: { value: ContactSource; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "LINKEDIN", label: "LinkedIn" },
];
const statusOptions: { value: ContactStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];
const textFields = {
  email: { label: "Email", type: "email", autoComplete: "email" },
  phone: { label: "Phone", type: "tel", autoComplete: "tel" },
  jobTitle: { label: "Job Title", type: "text", autoComplete: "organization-title" },
  linkedinUrl: { label: "LinkedIn URL", type: "url", autoComplete: "url" },
} as const;

async function getOptions<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Unable to load options.");
  return response.json() as Promise<T>;
}

function initialValues(contact?: ContactRow): ContactFormInput {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    jobTitle: contact?.jobTitle ?? null,
    companyId: contact?.companyId ?? null,
    source: contact?.source ?? "MANUAL",
    status: contact?.status ?? "ACTIVE",
    ownerId: contact?.ownerId ?? null,
    linkedinUrl: contact?.linkedinUrl ?? null,
    notes_text: contact?.notes_text ?? null,
  };
}

function CompanyCombobox({
  value,
  onChange,
  initialCompany,
  enabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  initialCompany?: CompanyOption | null;
  enabled: boolean;
}) {
  const listId = useId();
  const [input, setInput] = useState(initialCompany?.name ?? "");
  const [selected, setSelected] = useState<CompanyOption | null>(initialCompany ?? null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    setInput(initialCompany?.name ?? "");
    setSelected(initialCompany ?? null);
    setSearch("");
    setExpanded(false);
    setActiveIndex(0);
  }, [enabled, initialCompany]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  const query = useQuery({
    queryKey: ["contact-company-options", search],
    queryFn: ({ signal }) =>
      getOptions<{ companies: CompanyOption[] }>(`/api/companies?search=${encodeURIComponent(search)}`, signal),
    enabled,
  });
  const companies = query.data?.companies ?? [];

  function choose(company: CompanyOption) {
    setSelected(company);
    setInput(company.name);
    setExpanded(false);
    onChange(company.id);
  }

  return (
    <div className="relative">
      <Input
        id="contact-company"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && companies[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Search companies…"
        value={input}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          const next = event.target.value;
          setInput(next);
          setExpanded(true);
          setActiveIndex(0);
          if (next !== selected?.name) {
            setSelected(null);
            onChange(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setExpanded(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setExpanded(true);
            setActiveIndex((current) =>
              event.key === "ArrowDown"
                ? Math.min(current + 1, Math.max(companies.length - 1, 0))
                : Math.max(current - 1, 0),
            );
          }
          if (event.key === "Enter" && expanded && companies[activeIndex]) {
            event.preventDefault();
            choose(companies[activeIndex]);
          }
        }}
      />
      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label="Companies"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-44 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {query.isLoading && <p className="px-2 py-1.5 text-muted-foreground text-sm">Loading…</p>}
          {query.isError && <p className="px-2 py-1.5 text-destructive text-sm">Unable to search companies.</p>}
          {!query.isLoading && !query.isError && companies.length === 0 && (
            <p className="px-2 py-1.5 text-muted-foreground text-sm">No companies found</p>
          )}
          {companies.map((company, index) => (
            <button
              key={company.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={company.id === value}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none aria-selected:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(company)}
            >
              {company.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactFormSheet({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactRow;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ContactFormInput, unknown, ContactFormOutput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: initialValues(contact),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(initialValues(contact));
  }, [open, contact, form.reset]);
  const membersQuery = useQuery({
    queryKey: ["contact-team-members"],
    queryFn: ({ signal }) => getOptions<{ members: MemberOption[] }>("/api/team-members", signal),
    enabled: open,
  });

  const members = membersQuery.data?.members ?? [];
  const availableSources =
    contact && !sourceOptions.some((option) => option.value === contact.source)
      ? [...sourceOptions, { value: contact.source, label: contact.source === "IMPORT" ? "Import" : "API" }]
      : sourceOptions;
  const availableStatuses =
    contact?.status === "ARCHIVED"
      ? [...statusOptions, { value: "ARCHIVED" as const, label: "Archived" }]
      : statusOptions;

  async function submit(values: ContactFormOutput) {
    form.clearErrors("root");
    try {
      const response = await fetch(contact ? `/api/contacts/${encodeURIComponent(contact.id)}` : "/api/contacts", {
        method: contact ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: ApiError = await response.json();
      if (!response.ok) {
        for (const [name, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (name in initialValues()) {
            form.setError(name as keyof ContactFormInput, { type: "server", message: messages[0] });
          }
        }
        form.setError("root", { message: result.error ?? "Unable to save contact." });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact saved successfully");
      onSaved?.();
      onOpenChange(false);
    } catch {
      form.setError("root", { message: "Unable to connect. Please try again." });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-full sm:w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{contact ? "Edit Contact" : "New Contact"}</SheetTitle>
          <SheetDescription>Keep your CRM contact details up to date.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="contact-form"
            onSubmit={form.handleSubmit(submit)}
            className="flex-1 space-y-4 overflow-y-auto px-4 pb-4"
          >
            <div className="grid grid-cols-2 gap-3">
              {(["firstName", "lastName"] as const).map((name) => (
                <div key={name} className="space-y-1.5">
                  <Label htmlFor={`contact-${name}`}>{name === "firstName" ? "First Name" : "Last Name"} *</Label>
                  <Input
                    id={`contact-${name}`}
                    autoComplete={name === "firstName" ? "given-name" : "family-name"}
                    aria-invalid={!!form.formState.errors[name]}
                    aria-describedby={form.formState.errors[name] ? `contact-${name}-error` : undefined}
                    {...form.register(name)}
                  />
                  {form.formState.errors[name]?.message && (
                    <p id={`contact-${name}-error`} role="alert" className="text-destructive text-xs">
                      {form.formState.errors[name].message}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {(["email", "phone", "jobTitle", "linkedinUrl"] as const).map((name) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`contact-${name}`}>{textFields[name].label}</Label>
                <Controller
                  name={name}
                  control={form.control}
                  render={({ field }) => (
                    <Input
                      id={`contact-${name}`}
                      type={textFields[name].type}
                      autoComplete={textFields[name].autoComplete}
                      placeholder={name === "linkedinUrl" ? "https://www.linkedin.com/in/..." : undefined}
                      aria-invalid={!!form.formState.errors[name]}
                      aria-describedby={form.formState.errors[name] ? `contact-${name}-error` : undefined}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value || null)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {form.formState.errors[name]?.message && (
                  <p id={`contact-${name}-error`} role="alert" className="text-destructive text-xs">
                    {form.formState.errors[name].message}
                  </p>
                )}
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="contact-company">Company</Label>
              <Controller
                name="companyId"
                control={form.control}
                render={({ field }) => (
                  <CompanyCombobox
                    value={field.value ?? null}
                    onChange={field.onChange}
                    initialCompany={contact?.company}
                    enabled={open}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(["source", "status"] as const).map((name) => (
                <div key={name} className="space-y-1.5">
                  <Label htmlFor={`contact-${name}`}>{name === "source" ? "Source" : "Status"}</Label>
                  <Controller
                    name={name}
                    control={form.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                        <SelectTrigger id={`contact-${name}`} className="w-full">
                          <SelectValue>
                            {(name === "source" ? availableSources : availableStatuses).find(
                              (option) => option.value === field.value,
                            )?.label ?? field.value}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(name === "source" ? availableSources : availableStatuses).map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-owner">Owner</Label>
              <Controller
                name="ownerId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "unassigned"}
                    onValueChange={(value) => field.onChange(value === "unassigned" ? null : value)}
                  >
                    <SelectTrigger id="contact-owner" className="w-full">
                      <SelectValue>
                        {members.find((member) => member.id === field.value)?.name ??
                          contact?.owner?.name ??
                          "Unassigned"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name} · {member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {membersQuery.isError && (
                <p role="alert" className="text-destructive text-xs">
                  Unable to load team members.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-notes">Notes</Label>
              <Controller
                name="notes_text"
                control={form.control}
                render={({ field }) => (
                  <Textarea
                    id="contact-notes"
                    rows={4}
                    aria-invalid={!!form.formState.errors.notes_text}
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              {form.formState.errors.notes_text?.message && (
                <p role="alert" className="text-destructive text-xs">
                  {form.formState.errors.notes_text.message}
                </p>
              )}
            </div>

            {form.formState.errors.root?.message && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}
          </form>
        </Form>

        <SheetFooter className="flex-row justify-end border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={form.formState.isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="contact-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
