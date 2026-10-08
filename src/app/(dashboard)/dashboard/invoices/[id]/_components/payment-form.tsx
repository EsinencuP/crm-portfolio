"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invoiceBalance } from "@/lib/invoices/money";
import { formatDocumentMoney } from "@/lib/quotations/totals";
import { type PaymentRow, paymentMethods, recordPaymentSchema } from "@/lib/validations/invoice";
import type { DocumentRow } from "@/lib/validations/quotation";

import { documentRequest } from "../../../quotations/_components/document-ui";

export function PaymentForm({
  invoice,
  onClose,
  onSaved,
  onRefresh,
}: {
  invoice: DocumentRow;
  onClose: () => void;
  onSaved: (result: { invoice: DocumentRow; payment: PaymentRow }) => void;
  onRefresh: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID()),
    [amount, setAmount] = useState(invoiceBalance(invoice)),
    [method, setMethod] = useState<(typeof paymentMethods)[number]>("BANK_TRANSFER"),
    [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10)),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const input = recordPaymentSchema.parse({
        amount,
        method,
        paidAt,
        reference,
        notes,
        requestId,
        updatedAt: invoice.updatedAt,
      });
      const result = await documentRequest<{ invoice: DocumentRow; payment: PaymentRow }>(
        `/api/invoices/${invoice.id}/payments`,
        "POST",
        input,
      );
      onSaved(result);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to record payment.");
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Record money already received for {invoice.number}. This does not charge a card or transfer funds. Balance:{" "}
            {formatDocumentMoney(invoiceBalance(invoice), invoice.currency)}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Amount ({invoice.currency})</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0.01"
                  max={invoiceBalance(invoice)}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  min="2000-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Method</Label>
              <Select
                value={method}
                onValueChange={(value) => {
                  if (value) setMethod(value as typeof method);
                }}
              >
                <SelectTrigger id="payment-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-reference">Reference</Label>
              <Input
                id="payment-reference"
                maxLength={200}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Transaction ID / check number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-notes">Notes</Label>
              <Textarea
                id="payment-notes"
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error} If the response was interrupted, check history before closing; retrying this form uses the same
              request ID.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
