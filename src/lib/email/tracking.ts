import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function trackingSecret() {
  const secret = process.env.EMAIL_TRACKING_SECRET;
  if (!secret || secret.length < 32) throw new Error("EMAIL_TRACKING_SECRET must contain at least 32 characters");
  return secret;
}

export function assertTrackingReady() {
  trackingOrigin();
  trackingSecret();
}

export function trackingOrigin() {
  const raw = process.env.EMAIL_TRACKING_BASE_URL ?? process.env.EMAIL_OAUTH_BASE_URL ?? process.env.NEXTAUTH_URL;
  if (!raw) throw new Error("EMAIL_TRACKING_BASE_URL is not configured");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))
    throw new Error("Email tracking requires HTTPS");
  return url.origin;
}

export function safeDestination(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function signClick(trackingId: string, url: string) {
  return createHmac("sha256", trackingSecret()).update(`crm-email-click\0${trackingId}\0${url}`).digest("base64url");
}

export function verifyClick(trackingId: string, url: string, signature: string) {
  if (!/^[a-f0-9-]{36}$/i.test(trackingId) || !safeDestination(url) || !/^[A-Za-z0-9_-]{43}$/.test(signature))
    return false;
  const actual = Buffer.from(signature, "base64url");
  const expected = Buffer.from(signClick(trackingId, url), "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function trackedClickUrl(trackingId: string, destination: string) {
  const url = new URL(`/api/track/click/${trackingId}`, trackingOrigin());
  url.searchParams.set("url", destination);
  url.searchParams.set("sig", signClick(trackingId, destination));
  return url.toString();
}
