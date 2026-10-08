"use client";
import { useDeferredValue, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type ContractRow, contractFields } from "@/lib/validations/contract";
import { productCurrencies } from "@/lib/validations/product";

import { documentRequest } from "../../quotations/_components/document-ui";
import { type QuotationOption, QuotationPicker } from "../../quotations/_components/quotation-picker";
import { ContractContentEditor } from "./contract-content";

export function ContractFormSheet({
  open,
  onOpenChange,
  initial,
  workspaceId,
  defaultCurrency = "USD",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: ContractRow;
  workspaceId: string;
  defaultCurrency?: string;
  onSaved: (row: ContractRow) => void;
}) {
  // Callers mount this sheet only while open, giving each create operation one stable retry key.
  const router = useRouter();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(initial?.title ?? ""),
    [value, setValue] = useState(initial?.value ?? ""),
    [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [startDate, setStartDate] = useState(initial?.startDate?.slice(0, 10) ?? ""),
    [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 10) ?? "");
  const [content, setContent] = useState(initial?.content ?? ""),
    [documentUrl, setDocumentUrl] = useState(initial?.documentUrl ?? "");
  const [contact, setContact] = useState<QuotationOption | null>(
    initial?.contactId
      ? {
          id: initial.contactId,
          label: `${initial.contact?.firstName ?? ""} ${initial.contact?.lastName ?? ""}`.trim(),
        }
      : null,
  );
  const [company, setCompany] = useState<QuotationOption | null>(
    initial?.companyId ? { id: initial.companyId, label: initial.company?.name ?? "Linked company" } : null,
  );
  const [deal, setDeal] = useState<QuotationOption | null>(
    initial?.dealId ? { id: initial.dealId, label: initial.deal?.title ?? "Linked deal" } : null,
  );
  const [search, setSearch] = useState(""),
    deferred = useDeferredValue(search);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const deals = useQuery<{ deals: { id: string; title: string }[] }>({
    queryKey: ["contract-deals", workspaceId, deferred, contact?.id, company?.id],
    enabled: open,
    queryFn: () => {
      const params = new URLSearchParams({ search: deferred.slice(0, 100), limit: "25" });
      if (contact) params.set("contactId", contact.id);
      if (company) params.set("companyId", company.id);
      return documentRequest(`/api/deals?${params}`);
    },
  });
  const dealOptions = [
    ...(deal ? [deal] : []),
    ...(deals.data?.deals ?? []).filter((d) => d.id !== deal?.id).map((d) => ({ id: d.id, label: d.title })),
  ];
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = contractFields.safeParse({
      title,
      value: value || null,
      currency,
      startDate: startDate || null,
      endDate: endDate || null,
      content,
      documentUrl,
      contactId: contact?.id ?? null,
      companyId: company?.id ?? null,
      dealId: deal?.id ?? null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check contract details.");
      return;
    }
    setBusy(true);
    try {
      const saved = await documentRequest<ContractRow>(
        initial ? `/api/contracts/${initial.id}` : "/api/contracts",
        initial ? "PATCH" : "POST",
        { ...parsed.data, ...(initial ? { updatedAt: initial.updatedAt } : { requestId }) },
      );
      onSaved(saved);
      onOpenChange(false);
      if (!initial) router.push(`/dashboard/contracts/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <SheetContent className="flex flex-col data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{initial ? "Edit contract" : "Create contract"}</SheetTitle>
          <SheetDescription>Save a draft. Content is locked after marking it sent.</SheetDescription>
        </SheetHeader>
        <form id="contract-form" onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contract-title">Title</Label>
              <Input
                id="contract-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <QuotationPicker
              workspaceId={workspaceId}
              type="company"
              label="Company (optional)"
              value={company}
              disabled={busy}
              onChange={(v) => {
                setCompany(v);
                setContact(null);
                setDeal(null);
              }}
            />
            <QuotationPicker
              key={company?.id ?? "any-company"}
              workspaceId={workspaceId}
              type="contact"
              label="Contact (optional)"
              value={contact}
              companyId={company?.id}
              disabled={busy}
              onChange={(v) => {
                setContact(v);
                setDeal(null);
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="contract-deal">Deal (optional)</Label>
              <Combobox
                items={dealOptions}
                value={deal}
                onValueChange={setDeal}
                onInputValueChange={setSearch}
                itemToStringLabel={(v) => v.label}
                itemToStringValue={(v) => v.id}
                isItemEqualToValue={(a, b) => a.id === b.id}
                filter={null}
                disabled={busy}
              >
                <ComboboxInput id="contract-deal" placeholder="Search deal…" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>{deals.isPending ? "Loading…" : "No matching deals"}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: QuotationOption) => (
                      <ComboboxItem key={item.id} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {deals.error && (
                <p role="alert" className="text-destructive text-sm">
                  {deals.error.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contract-start">Start date</Label>
                <Input
                  id="contract-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-end">End date</Label>
                <Input id="contract-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-value">Value (optional)</Label>
                <Input
                  id="contract-value"
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => {
                    if (v) setCurrency(v);
                  }}
                >
                  <SelectTrigger id="contract-currency" className="w-full">
                    <SelectValue>{currency}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...productCurrencies, currency])].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-url">Document URL (HTTPS, optional)</Label>
              <Input
                id="contract-url"
                type="url"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                maxLength={2048}
              />
            </div>
            <ContractContentEditor value={content} onChange={setContent} disabled={busy} />
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="contract-form" disabled={busy}>
            {busy ? "Saving…" : "Save contract"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
