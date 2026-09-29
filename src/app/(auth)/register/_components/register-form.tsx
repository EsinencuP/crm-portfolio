"use client";

import { useState } from "react";

import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { registrationSchema } from "@/lib/validations/registration";

const formSchema = registrationSchema
  .extend({ confirmPassword: z.string().min(1, { error: "Please confirm your password." }) })
  .refine((values) => values.password === values.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof formSchema>;
type RegisterResponse = {
  success?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
};

const fields = [
  { name: "name", label: "Name", type: "text", autoComplete: "name", placeholder: "Your name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@example.com" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", placeholder: "••••••••" },
  {
    name: "confirmPassword",
    label: "Confirm Password",
    type: "password",
    autoComplete: "new-password",
    placeholder: "••••••••",
  },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [visiblePasswords, setVisiblePasswords] = useState({ password: false, confirmPassword: false });
  const [pendingProvider, setPendingProvider] = useState<"credentials" | "google" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const isBusy = pendingProvider !== null || form.formState.isSubmitting;
  const isDisabled = isBusy || accountCreated;

  async function handleRegister(values: RegisterValues) {
    if (accountCreated) return;
    setFormError(null);
    setPendingProvider("credentials");
    let created = false;
    let navigating = false;

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, email: values.email, password: values.password }),
      });
      const result: RegisterResponse = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          form.setError("email", { type: "server", message: "An account with this email already exists." });
        } else {
          for (const name of ["name", "email", "password"] as const) {
            const message = result.fieldErrors?.[name]?.[0];
            if (message) form.setError(name, { type: "server", message });
          }
          setFormError(result.error ?? "Unable to create your account. Please try again.");
        }
        return;
      }

      if (!result.success) {
        setFormError("Unable to create your account. Please try again.");
        return;
      }

      created = true;
      setAccountCreated(true);
      const session = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
        redirectTo: "/dashboard",
      });
      if (!session?.ok || session.error) {
        setFormError("Your account was created, but automatic sign-in failed. Please continue to login.");
        return;
      }
      navigating = true;
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setFormError(
        created ? "Your account was created. Please continue to login." : "Unable to connect. Please try again.",
      );
    } finally {
      if (!navigating) setPendingProvider(null);
    }
  }

  async function handleGoogleSignIn() {
    if (isDisabled) return;
    setFormError(null);
    setPendingProvider("google");
    let navigating = false;

    try {
      const result = await signIn("google", { redirect: false, redirectTo: "/dashboard" });
      if (!result?.ok || result.error || !result.url) {
        setFormError("Google sign-in is currently unavailable. Please use your email and password.");
        return;
      }
      window.location.assign(result.url);
      navigating = true;
    } catch {
      setFormError("Unable to connect to Google. Please try again.");
    } finally {
      if (!navigating) setPendingProvider(null);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void form.handleSubmit(handleRegister)(event);
      }}
    >
      {formError && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm leading-5"
        >
          <p>{formError}</p>
          {accountCreated && (
            <Link
              href="/login"
              prefetch={false}
              className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Continue to login
            </Link>
          )}
        </div>
      )}

      {fields.map((config) => {
        const name = config.name;
        const isPasswordField = name === "password" || name === "confirmPassword";
        const visible = isPasswordField && visiblePasswords[name];
        const id = name === "confirmPassword" ? "register-confirm-password" : `register-${name}`;

        return (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field, fieldState }) => (
              <div className="space-y-1.5">
                <Label htmlFor={id}>{config.label}</Label>
                <div className="relative">
                  <Input
                    {...field}
                    id={id}
                    type={visible ? "text" : config.type}
                    placeholder={config.placeholder}
                    autoComplete={config.autoComplete}
                    autoCapitalize={name === "email" ? "none" : undefined}
                    spellCheck={name === "email" ? false : undefined}
                    disabled={isDisabled}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.error ? `${id}-error` : undefined}
                    className={cn(
                      "h-11 border-zinc-300 bg-white text-zinc-950 placeholder:text-zinc-400 dark:bg-white dark:disabled:bg-zinc-100",
                      isPasswordField && "pr-12",
                    )}
                  />
                  {isPasswordField && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isDisabled}
                      aria-label={`${visible ? "Hide" : "Show"} ${config.label.toLowerCase()}`}
                      aria-pressed={visible}
                      aria-controls={id}
                      onClick={() => setVisiblePasswords((current) => ({ ...current, [name]: !current[name] }))}
                      className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-100"
                    >
                      {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </Button>
                  )}
                </div>
                {fieldState.error && (
                  <p id={`${id}-error`} role="alert" className="text-red-600 text-sm">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />
        );
      })}

      <Button
        type="submit"
        variant="default"
        disabled={isDisabled}
        aria-busy={pendingProvider === "credentials"}
        className="h-11 w-full bg-zinc-900 text-white hover:bg-zinc-800"
      >
        {pendingProvider === "credentials" && (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pendingProvider === "credentials" ? "Creating account..." : "Create account"}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <Separator className="flex-1 bg-zinc-200" aria-hidden="true" />
        <span className="shrink-0 text-xs text-zinc-500">or continue with</span>
        <Separator className="flex-1 bg-zinc-200" aria-hidden="true" />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={isDisabled}
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
