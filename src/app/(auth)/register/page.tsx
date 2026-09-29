import Link from "next/link";

import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import { RegisterForm } from "./_components/register-form";

export const metadata: Metadata = {
  title: "Register | CRM Portfolio",
};

export default function RegisterPage() {
  return (
    <Card className="w-full max-w-[350px] gap-8 overflow-visible rounded-none bg-white py-0 text-zinc-950 ring-0">
      <CardHeader className="gap-2 px-0 text-center">
        <p className="mb-5 font-semibold text-sm text-zinc-950 lg:hidden">CRM Portfolio</p>
        <h1 className="font-medium text-3xl tracking-tight">Create an account</h1>
        <CardDescription className="text-zinc-500">Enter your details to get started</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <RegisterForm />
      </CardContent>
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          href="/login"
          prefetch={false}
          className="rounded-sm font-medium text-zinc-950 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-950 focus-visible:outline-offset-4"
        >
          Login
        </Link>
      </p>
    </Card>
  );
}
