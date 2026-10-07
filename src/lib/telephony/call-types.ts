export const callStatusLabels = {
  RINGING: "Calling…",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  MISSED: "No answer",
  VOICEMAIL: "Voicemail",
  FAILED: "Failed",
} as const;

export type PhoneCallStatus = keyof typeof callStatusLabels;
export type CallRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: PhoneCallStatus;
  fromNumber: string;
  toNumber: string;
  duration: number | null;
  recordingUrl: string | null;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string };
};

export function isActiveCall(status: PhoneCallStatus) {
  return status === "RINGING" || status === "IN_PROGRESS";
}

export function normalizePhoneNumber(value: string) {
  if (!/^[+\d\s().-]+$/.test(value)) return null;
  const normalized = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function formatCallDuration(seconds: number | null) {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function mapTwilioStatus(status: string): PhoneCallStatus | null {
  if (["queued", "initiated", "ringing"].includes(status)) return "RINGING";
  if (["answered", "in-progress"].includes(status)) return "IN_PROGRESS";
  if (status === "completed") return "COMPLETED";
  if (["no-answer", "busy", "canceled"].includes(status)) return "MISSED";
  if (status === "failed") return "FAILED";
  return null;
}
