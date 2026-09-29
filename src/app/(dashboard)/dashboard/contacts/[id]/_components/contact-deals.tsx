"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ContactDeal = {
  id: string;
  title: string;
  value: string | null;
  currency: string;
  closeDate: string | null;
  stage: { name: string; color: string };
};

export function ContactDeals({ contactId, deals }: { contactId: string; deals: ContactDeal[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<{ id: string; title: string; company: { name: string } | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/contacts/${encodeURIComponent(contactId)}/deals?search=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load deals");
          return response.json();
        })
        .then((result: { deals: typeof options }) => setOptions(result.deals))
        .catch((error) => {
          if (error.name !== "AbortError") toast.error("Could not load deals");
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [contactId, open, search]);

  async function linkDeal(dealId: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contactId)}/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not link deal");
      toast.success("Deal linked");
      setOpen(false);
      setSearch("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not link deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Deals</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" /> Link Deal
          </Button>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
              No deals linked to this contact.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Close date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">
                    {deal.title}
                      </TableCell>
                      <TableCell>
                        {deal.value === null
                          ? "—"
                          : new Intl.NumberFormat("en-US", { style: "currency", currency: deal.currency }).format(
                              Number(deal.value),
                            )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" style={{ borderColor: deal.stage.color, color: deal.stage.color }}>
                          {deal.stage.name}
                        </Badge>
                      </TableCell>
                      <TableCell>{deal.closeDate ? format(new Date(deal.closeDate), "MMM d, yyyy") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a deal</DialogTitle>
            <DialogDescription>Choose an unlinked deal to associate with this contact.</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Search deals"
            placeholder="Search deals..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {loading && <p className="p-2 text-muted-foreground text-sm">Loading...</p>}
            {!loading &&
              options.map((deal) => (
                <Button
                  key={deal.id}
                  variant="ghost"
                  className="h-auto w-full justify-start text-left"
                  disabled={saving}
                  onClick={() => void linkDeal(deal.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{deal.title}</span>
                    {deal.company && <span className="block text-muted-foreground text-xs">{deal.company.name}</span>}
                  </span>
                </Button>
              ))}
            {!loading && options.length === 0 && (
              <p className="p-2 text-muted-foreground text-sm">No unlinked deals found.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
