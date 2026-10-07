"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EmbedCodeDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Clipboard unavailable. Select and copy the code manually.");
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setCode(
            `<iframe src="${window.location.origin}/forms/${encodeURIComponent(slug)}" title="Lead capture form" width="100%" height="600" style="border:0"></iframe>`,
          );
          setStatus("");
          setOpen(true);
        }}
      >
        Embed
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Embed form</DialogTitle>
            <DialogDescription>
              Paste this code into your website. The form must be active and your CRM publicly accessible over HTTPS.
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="Iframe embed code"
            readOnly
            value={code}
            rows={4}
            className="w-full rounded-md border bg-muted p-3 font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <Button onClick={() => void copy()}>Copy to clipboard</Button>
          <p role="status" className="text-sm">
            {status}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
