"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createProductSchema, type ProductRow, productCurrencies, productUnits } from "@/lib/validations/product";

type FormInput = z.input<typeof createProductSchema>;
type FormOutput = z.output<typeof createProductSchema>;
const values = (product: ProductRow | undefined, currency: string): FormInput => ({
  name: product?.name ?? "",
  sku: product?.sku ?? "",
  description: product?.description ?? "",
  unitPrice: product?.unitPrice ?? "",
  currency: product?.currency ?? currency,
  unit: (product?.unit ?? "unit") as FormOutput["unit"],
  taxRate: product?.taxRate ?? "0",
  category: product?.category ?? "",
  imageUrl: product?.imageUrl ?? "",
  isActive: product?.isActive ?? true,
});
export function ProductFormSheet({
  open,
  onOpenChange,
  product,
  workspaceId,
  defaultCurrency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  product?: ProductRow;
  workspaceId: string;
  defaultCurrency: string;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: values(product, defaultCurrency),
  });
  useEffect(() => {
    if (open) form.reset(values(product, defaultCurrency));
  }, [open, product, defaultCurrency, form.reset]);
  const currencies = [...new Set([...productCurrencies, defaultCurrency, ...(product ? [product.currency] : [])])];
  async function submit(input: FormOutput) {
    form.clearErrors();
    try {
      const response = await fetch(product ? `/api/products/${encodeURIComponent(product.id)}` : "/api/products", {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...(product ? { updatedAt: product.updatedAt } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        for (const [field, messages] of Object.entries(body.fieldErrors ?? {}))
          if (field in values(undefined, defaultCurrency) && Array.isArray(messages))
            form.setError(field as keyof FormInput, { type: "server", message: String(messages[0]) });
        throw new Error(body.error ?? "Unable to save product.");
      }
      await queryClient.invalidateQueries({ queryKey: ["products", workspaceId] });
      onSaved(product ? "Product updated." : "Product added.");
      onOpenChange(false);
    } catch (error) {
      form.setError("root", { message: error instanceof Error ? error.message : "Unable to save product." });
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!form.formState.isSubmitting) onOpenChange(value);
      }}
    >
      <SheetContent className="flex flex-col data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{product ? "Edit product" : "Add product"}</SheetTitle>
          <SheetDescription>
            Price is per unit, before tax. Blank SKU is allowed; supplied SKUs must be unique in this workspace.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="product-form"
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
            onSubmit={(event) => {
              void form.handleSubmit(submit)(event);
            }}
          >
            <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
              {(["name", "sku", "unitPrice", "taxRate", "category", "imageUrl"] as const).map((name) => {
                const numeric = name === "unitPrice" || name === "taxRate";
                const labels = {
                  name: "Name",
                  sku: "SKU",
                  unitPrice: "Unit Price",
                  taxRate: "Tax Rate (%)",
                  category: "Category",
                  imageUrl: "Image URL",
                };
                const error = form.formState.errors[name]?.message;
                let inputType = name === "imageUrl" ? "url" : "text";
                if (numeric) inputType = "number";
                const maximums = { taxRate: "100", unitPrice: "9999999999.99" };
                const lengths = { name: 160, sku: 80, unitPrice: 13, taxRate: 6, category: 120, imageUrl: 2048 };
                return (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={`product-${name}`}>{labels[name]}</Label>
                    <Input
                      id={`product-${name}`}
                      type={inputType}
                      step={numeric ? "0.01" : undefined}
                      min={numeric ? "0" : undefined}
                      max={numeric ? maximums[name as keyof typeof maximums] : undefined}
                      maxLength={lengths[name]}
                      required={name === "name" || name === "unitPrice"}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `product-${name}-error` : undefined}
                      {...form.register(name)}
                    />
                    {error && (
                      <p id={`product-${name}-error`} role="alert" className="text-destructive text-xs">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="space-y-1.5">
                <Label htmlFor="product-description">Description</Label>
                <Textarea
                  id="product-description"
                  rows={4}
                  maxLength={5000}
                  {...form.register("description")}
                  aria-invalid={Boolean(form.formState.errors.description)}
                />
                {form.formState.errors.description?.message && (
                  <p role="alert" className="text-destructive text-xs">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["currency", "unit"] as const).map((name) => (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={`product-${name}`}>{name === "currency" ? "Currency" : "Unit"}</Label>
                    <Controller
                      name={name}
                      control={form.control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (value) field.onChange(value);
                          }}
                        >
                          <SelectTrigger
                            id={`product-${name}`}
                            className="w-full"
                            aria-invalid={Boolean(form.formState.errors[name])}
                          >
                            <SelectValue>{field.value}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(name === "currency" ? currencies : productUnits).map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {form.formState.errors[name]?.message && (
                      <p role="alert" className="text-destructive text-xs">
                        {form.formState.errors[name]?.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="product-active">Active</Label>
                <Controller
                  name="isActive"
                  control={form.control}
                  render={({ field }) => (
                    <Switch id="product-active" checked={field.value ?? true} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
              {form.formState.errors.root?.message && (
                <p role="alert" className="text-destructive text-sm">
                  {form.formState.errors.root.message}
                </p>
              )}
            </fieldset>
          </form>
        </Form>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" disabled={form.formState.isSubmitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save product
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
