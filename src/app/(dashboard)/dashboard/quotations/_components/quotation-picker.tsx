"use client";
import { useDeferredValue, useId, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import type { ProductList } from "@/lib/validations/product";
export type QuotationOption = {
  id: string;
  label: string;
  email?: string | null;
  companyId?: string | null;
  unitPrice?: string;
  taxRate?: string;
  currency?: string;
  sku?: string | null;
};
export function QuotationPicker({
  workspaceId,
  type,
  label,
  value,
  onChange,
  currency,
  companyId,
  disabled = false,
}: {
  workspaceId: string;
  type: "contact" | "company" | "product";
  label: string;
  value: QuotationOption | null;
  onChange: (value: QuotationOption | null) => void;
  currency?: string;
  companyId?: string | null;
  disabled?: boolean;
}) {
  const fieldId = useId();
  const [search, setSearch] = useState(value?.label ?? "");
  const deferred = useDeferredValue(search);
  const query = useQuery<QuotationOption[]>({
    queryKey: ["quotation-options", workspaceId, type, deferred, currency, companyId],
    enabled: !disabled,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ search: deferred.slice(0, 100), limit: "25" });
      let path = "/api/products";
      if (type === "product") params.set("isActive", "true");
      else {
        path = "/api/quotations/options";
        params.set("type", type);
        if (companyId) params.set("companyId", companyId);
      }
      const response = await fetch(`${path}?${params}`, { signal, cache: "no-store" }),
        body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      if (type !== "product") return body.options;
      return (body as ProductList).products
        .filter((product) => product.currency === currency)
        .map((product) => ({
          id: product.id,
          label: product.sku ? `${product.name} (${product.sku})` : product.name,
          unitPrice: product.unitPrice,
          taxRate: product.taxRate,
          currency: product.currency,
          sku: product.sku,
        }));
    },
  });
  const items = [...(value ? [value] : []), ...(query.data ?? []).filter((item) => item.id !== value?.id)];
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Combobox
        items={items}
        value={value}
        onValueChange={onChange}
        onInputValueChange={setSearch}
        inputValue={search}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={null}
        disabled={disabled}
      >
        <ComboboxInput
          id={fieldId}
          aria-label={label}
          className="w-full"
          placeholder={type === "product" ? "Search product name / SKU…" : "Search client…"}
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>{query.isPending ? "Loading…" : "No matching results"}</ComboboxEmpty>
          <ComboboxList>
            {(item: QuotationOption) => (
              <ComboboxItem key={item.id} value={item}>
                <span className="min-w-0 truncate">
                  {item.label}
                  {item.email ? ` · ${item.email}` : ""}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {query.error && (
        <p role="alert" className="text-destructive text-xs">
          {query.error.message}
        </p>
      )}
    </div>
  );
}
