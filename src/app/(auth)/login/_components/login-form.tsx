"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { Controller, useForm } from "react-hook-form";
import { siGoogle } from "simple-icons";
import { z } from "zod";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { registrationSchema } from "@/lib/validations/registration";

const formSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "Please enter a valid email address." })),
  password: registrationSchema.shape.password,
});

type LoginValues = z.infer<typeof formSchema>;
type LoginFormProps = {
  callbackUrl?: string;
  initialError?: string;
};

function getAuthErrorMessage(error?: string) {
  if (!error) return null;
  switch (error) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "OAuthAccountNotLinked":
      return "This email uses another sign-in method. Please sign in with your email and password.";
    case "AccessDenied":
      return "Access was denied. Please try another account.";
    case "Configuration":
    case "OAuthSignin":
    case "OAuthSignInError":
      return "Google sign-in is currently unavailable. Please use your email and password.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

export function LoginForm({ callbackUrl = "/dashboard", initialError }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<"credentials" | "google" | null>(null);
  const [authError, setAuthError] = useState(getAuthErrorMessage(initialError));
  const form = useForm<LoginValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });
  const isBusy = pendingProvider !== null || form.formState.isSubmitting;

  async function handleCredentialsSignIn(values: LoginValues) {
    setAuthError(null);
    setPendingProvider("credentials");
    let navigating = false;

    try {
      const result = await signIn("credentials", { ...values, redirect: false, redirectTo: callbackUrl });
      if (!result?.ok || result.error) {
        setAuthError(
          result?.error === "CredentialsSignin" ? "Invalid email or password." : "Unable to sign in. Please try again.",
        );
        return;
      }
      navigating = true;
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setAuthError("Unable to connect. Please try again.");
    } finally {
      if (!navigating) setPendingProvider(null);
    }
  }

  async function handleGoogleSignIn() {
    if (isBusy) return;
    setAuthError(null);
    setPendingProvider("google");
    let navigating = false;

    try {
      const result = await signIn("google", { redirect: false, redirectTo: callbackUrl });
      if (!result?.ok || result.error || !result.url) {
        setAuthError(
          getAuthErrorMessage(result?.error) ?? "Google sign-in is currently unavailable. Please try again.",
        );
        return;
      }
      window.location.assign(result.url);
      navigating = true;
    } catch {
      setAuthError("Unable to connect to Google. Please try again.");
    } finally {
      if (!navigating) setPendingProvider(null);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void form.handleSubmit(handleCredentialsSignIn)(event);
      }}
    >
      {authError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm leading-5">
          {authError}
        </p>
      )}

      <Controller
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              {...field}
              id="login-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isBusy}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.error ? "login-email-error" : undefined}
              className="h-11 border-zinc-300 bg-white text-zinc-950 placeholder:text-zinc-400 dark:bg-white dark:disabled:bg-zinc-100"
            />
            {fieldState.error && (
              <p id="login-email-error" role="alert" className="text-red-600 text-sm">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />

      <Controller
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                {...field}
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isBusy}
                aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.error ? "login-password-error" : undefined}
                className="h-11 border-zinc-300 bg-white pr-12 text-zinc-950 placeholder:text-zinc-400 dark:bg-white dark:disabled:bg-zinc-100"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="login-password"
                disabled={isBusy}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-100"
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            {fieldState.error && (
              <p id="login-password-error" role="alert" className="text-red-600 text-sm">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />

      <Button
        type="submit"
        variant="default"
        disabled={isBusy}
        aria-busy={pendingProvider === "credentials"}
        className="h-11 w-full bg-zinc-900 text-white hover:bg-zinc-800"
      >
        {pendingProvider === "credentials" && (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pendingProvider === "credentials" ? "Signing in..." : "Sign In"}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <Separator className="flex-1 bg-zinc-200" aria-hidden="true" />
        <span className="shrink-0 text-xs text-zinc-500">or continue with</span>
        <Separator className="flex-1 bg-zinc-200" aria-hidden="true" />
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={isBusy}
        aria-busy={pendingProvider === "google"}
        onClick={() => {
          void handleGoogleSignIn();
        }}
        className="h-11 w-full gap-2 bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
      >
        {pendingProvider === "google" ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <SimpleIcon icon={siGoogle} className="size-4 fill-current" aria-hidden="true" />
        )}
        {pendingProvider === "google" ? "Connecting..." : "Continue with Google"}
      </Button>
    </form>
  );
}
