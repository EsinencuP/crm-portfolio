"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Phone } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { type CallRow, callStatusLabels, isActiveCall } from "@/lib/telephony/call-types";

export function ClickToCall({
  phoneNumber,
  contactId,
  contactName,
}: {
  phoneNumber: string;
  contactId: string;
  contactName: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef<string | null>(null);
  const call = useQuery<CallRow>({
    queryKey: ["phone-call", callId],
    enabled: Boolean(callId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/calls/${encodeURIComponent(callId ?? "")}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load call status.");
      return result;
    },
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      return !query.state.data || isActiveCall(query.state.data.status) ? 3_000 : false;
    },
  });
  const active = Boolean(callId && !call.isError && (!call.data || isActiveCall(call.data.status)));

  useEffect(() => {
    if (call.data && !isActiveCall(call.data.status) && finished.current !== call.data.id) {
      finished.current = call.data.id;
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      router.refresh();
    }
  }, [call.data, queryClient, router]);

  async function startCall() {
    if (pending || active) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, phoneNumber }),
      });
      const result: { id?: string; callId?: string; error?: string } = await response.json();
      if (!response.ok) {
        if (result.callId) setCallId(result.callId);
        throw new Error(result.error ?? "Could not start call.");
      }
      setCallId(result.id ?? null);
      setOpen(false);
      toast.success("Calling… Answer the operator phone to connect with the contact.");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not start call.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || active}
        aria-label={`Call ${contactName} at ${phoneNumber}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {pending || active ? <LoaderCircle className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
        {active ? "Calling…" : "Call"}
      </Button>
      {call.data && (
        <p role="status" className="text-muted-foreground text-xs">
          {callStatusLabels[call.data.status]}
        </p>
      )}
      {call.isError && (
        <p role="alert" className="text-destructive text-xs">
          Status unavailable. Check the Calls tab.
        </p>
      )}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call {contactName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Call {contactName} at {phoneNumber}? Your operator phone rings first. Answer it to connect. This
              conversation will be recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending || active} onClick={() => void startCall()}>
              {pending ? "Calling…" : "Call"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
