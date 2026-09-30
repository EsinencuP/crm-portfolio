import Link from "next/link";

import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = {
  title: "Login | CRM Portfolio",
};

function getCallbackUrl(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";

  try {
    const url = new URL(value, "https://crm.invalid");
    if (
      url.origin === "https://crm.invalid" &&
      (url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/invite/"))
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return "/dashboard";
  }

  return "/dashboard";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;

  return (
    <Card className="w-full max-w-[350px] gap-8 overflow-visible rounded-none bg-white py-0 text-zinc-950 ring-0">
      <CardHeader className="gap-2 px-0 text-center">
        <p className="mb-5 font-semibold text-sm text-zinc-950 lg:hidden">CRM Portfolio</p>
        <h1 className="font-medium text-3xl tracking-tight">Welcome back</h1>
        <CardDescription className="text-zinc-500">Enter your credentials to access your CRM</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <LoginForm
          callbackUrl={getCallbackUrl(params.callbackUrl)}
          initialError={typeof params.error === "string" ? params.error : undefined}
        />
      </CardContent>
      <p className="text-center text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          prefetch={false}
          className="rounded-sm font-medium text-zinc-950 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-950 focus-visible:outline-offset-4"
        >
          Register
        </Link>
      </p>
    </Card>
  );
}
