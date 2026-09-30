"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createCompanySchema } from "@/lib/validations/company";

import type { CompanyRow } from "./companies-columns";

type InputValues = z.input<typeof createCompanySchema>;
type OutputValues = z.output<typeof createCompanySchema>;
type ApiError = { error?: string; fieldErrors?: Record<string, string[]> };
const fields = [
  { name: "domain", label: "Domain", type: "text", placeholder: "example.com" },
  { name: "industry", label: "Industry", type: "text", placeholder: "Technology" },
  { name: "size", label: "Size", type: "text", placeholder: "11–50 employees" },
  { name: "website", label: "Website", type: "url", placeholder: "https://example.com" },
  { name: "logoUrl", label: "Logo URL", type: "url", placeholder: "https://example.com/logo.png" },
  { name: "phone", label: "Phone", type: "tel", placeholder: "+1 555 0100" },
  { name: "address", label: "Address", type: "text", placeholder: "Street, city, country" },
] as const;

function initialValues(company?: CompanyRow): InputValues {
  return {
    name: company?.name ?? "",
    domain: company?.domain ?? null,
    industry: company?.industry ?? null,
    size: company?.size ?? null,
    logoUrl: company?.logoUrl ?? null,
    website: company?.website ?? null,
    address: company?.address ?? null,
    description: company?.description ?? null,
    phone: company?.phone ?? null,
  };
}

export function CompanyFormSheet({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyRow;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<InputValues, unknown, OutputValues>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: initialValues(company),
  });
  useEffect(() => {
    if (open) form.reset(initialValues(company));
  }, [open, company, form.reset]);

  async function submit(values: OutputValues) {
    form.clearErrors("root");
    try {
      const response = await fetch(company ? `/api/companies/${encodeURIComponent(company.id)}` : "/api/companies", {
        method: company ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: ApiError = await response.json();
      if (!response.ok) {
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (field in initialValues()) form.setError(field as keyof InputValues, { message: messages[0] });
        }
        form.setError("root", { message: result.error ?? "Unable to save company." });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success(company ? "Company updated" : "Company created");
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
          <SheetTitle>{company ? "Edit Company" : "New Company"}</SheetTitle>
          <SheetDescription>Manage the company profile and contact information.</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="company-form"
            onSubmit={form.handleSubmit(submit)}
            className="flex-1 space-y-4 overflow-y-auto px-4 pb-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Name *</Label>
              <Input
                id="company-name"
                autoComplete="organization"
                aria-invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              {form.formState.errors.name?.message && (
                <p role="alert" className="text-destructive text-xs">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            {fields.map(({ name, label, type, placeholder }) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`company-${name}`}>{label}</Label>
                <Controller
                  name={name}
                  control={form.control}
                  render={({ field }) => (
                    <Input
                      id={`company-${name}`}
                      type={type}
                      placeholder={placeholder}
                      aria-invalid={!!form.formState.errors[name]}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value || null)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {form.formState.errors[name]?.message && (
                  <p role="alert" className="text-destructive text-xs">
                    {form.formState.errors[name]?.message}
                  </p>
                )}
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="company-description">Description</Label>
              <Controller
                name="description"
                control={form.control}
                render={({ field }) => (
                  <Textarea
                    id="company-description"
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.target.value || null)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    aria-invalid={!!form.formState.errors.description}
                  />
                )}
              />
              {form.formState.errors.description?.message && (
                <p role="alert" className="text-destructive text-xs">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>
            {form.formState.errors.root?.message && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}
          </form>
        </Form>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : "Save Company"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
