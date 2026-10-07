"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Play } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { type CallRow, callStatusLabels, formatCallDuration, isActiveCall } from "@/lib/telephony/call-types";

type CallPage = { calls: CallRow[]; total: number; page: number; totalPages: number };

export function CallLog({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const query = useQuery<CallPage>({
    queryKey: ["calls", contactId, page],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/calls?contactId=${encodeURIComponent(contactId)}&page=${page}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load calls.");
      return result;
    },
    refetchInterval: (state) =>
      state.state.data?.calls.some(
        (call) =>
          isActiveCall(call.status) ||
          (call.status === "COMPLETED" && !call.recordingUrl && Date.now() - Date.parse(call.createdAt) < 600_000),
      )
        ? 5_000
        : false,
  });
  const summary = query.data?.calls.map((call) => `${call.id}:${call.status}:${call.duration}:${call.notes}`).join("|");
  useEffect(() => {
    if (summary === undefined) return;
    if (previous.current !== null && previous.current !== summary) router.refresh();
    previous.current = summary;
  }, [summary, router]);

  async function saveNotes(callId: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/calls/${encodeURIComponent(callId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save notes.");
      setEditing(null);
      toast.success("Call notes saved");
      await queryClient.invalidateQueries({ queryKey: ["calls", contactId] });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && (
          <p role="status" className="text-muted-foreground text-sm">
            Loading calls…
          </p>
        )}
        {query.isError && (
          <div role="alert" className="space-y-2 text-destructive text-sm">
            <p>{query.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {query.data?.total === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No calls yet. Use the Call button next to this contact’s phone number.
          </p>
        )}
        {Boolean(query.data?.calls.length) && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Notes & recording</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="align-top">
                      <time dateTime={call.createdAt} className="whitespace-nowrap">
                        {new Date(call.createdAt).toLocaleString()}
                      </time>
                      <p className="text-muted-foreground text-xs">{call.user.name}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="inline-flex items-center gap-1">
                        {call.direction === "OUTBOUND" ? (
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        ) : (
                          <ArrowDownLeft className="size-4" aria-hidden="true" />
                        )}
                        {call.direction === "OUTBOUND" ? "Outbound" : "Inbound"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={call.status === "FAILED" ? "destructive" : "outline"}>
                        {callStatusLabels[call.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">{formatCallDuration(call.duration)}</TableCell>
                    <TableCell className="min-w-56 space-y-2 align-top">
                      {editing === call.id ? (
                        <div className="space-y-2">
                          <Textarea
                            aria-label="Call notes"
                            value={notes}
                            maxLength={10_000}
                            disabled={saving}
                            onChange={(event) => setNotes(event.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" disabled={saving} onClick={() => void saveNotes(call.id)}>
                              {saving ? "Saving…" : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="max-w-sm whitespace-pre-wrap break-words text-sm">{call.notes ?? "No notes"}</p>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(call.id);
                                setNotes(call.notes ?? "");
                              }}
                            >
                              {call.notes ? "Edit notes" : "Add notes"}
                            </Button>
                          )}
                        </>
                      )}
                      {call.recordingUrl && (
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPlaying(playing === call.id ? null : call.id)}
                          >
                            <Play className="size-3.5" /> {playing === call.id ? "Hide recording" : "Play recording"}
                          </Button>
                          {playing === call.id && (
                            // biome-ignore lint/a11y/useMediaCaption: Captions are unavailable for Twilio audio recordings; transcription is a separate feature.
                            <audio
                              controls
                              preload="none"
                              aria-label={`Call recording from ${new Date(call.createdAt).toLocaleString()}`}
                              src={`/api/calls/${encodeURIComponent(call.id)}/recording`}
                              className="mt-2 max-w-full"
                              onError={() => toast.error("Recording unavailable. Try again later.")}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {query.data && query.data.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page} of {query.data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= query.data.totalPages || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
