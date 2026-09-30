"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Invitation = { email: string; role: string; existingUser: boolean };

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["invitation", token],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/users/invitation?token=${encodeURIComponent(token)}`, {
        signal,
        cache: "no-store",
      });
      const body: Invitation & { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load invitation.");
      return body;
    },
    retry: false,
  });

  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.data) return;
    if (!query.data.existingUser && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/users/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(query.data.existingUser ? {} : { name, password }) }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to accept invitation.");
      if (query.data.existingUser) {
        router.replace("/dashboard");
        return;
      }
      const result = await signIn("credentials", { email: query.data.email, password, redirect: false });
      if (result?.error) {
        router.replace("/login");
        return;
      }
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to accept invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Join CRM Portfolio</CardTitle>
        <CardDescription>Accept your team invitation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && <p className="text-muted-foreground text-sm">Loading invitation…</p>}
        {query.isError && (
          <p role="alert" className="text-destructive text-sm">
            {query.error.message}
          </p>
        )}
        {query.data && (
          <>
            <p className="text-sm">
              Invited as <strong>{query.data.role}</strong> with <strong>{query.data.email}</strong>.
            </p>
            {query.data.existingUser && (
              <p className="text-muted-foreground text-sm">
                Sign in with this email address, then return to this invitation link to accept the role.
              </p>
            )}
            <form onSubmit={accept} method="post" className="space-y-4">
              {!query.data.existingUser && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-name">Name</Label>
                    <Input
                      id="invite-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Password</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-confirm-password">Confirm password</Label>
                    <Input
                      id="invite-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Accepting…" : "Accept invitation"}
              </Button>
            </form>
            {query.data.existingUser && (
              <Link className="text-sm underline" href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}>
                Sign in
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
