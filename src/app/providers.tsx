"use client";

import type { ReactNode } from "react";

import { isServer, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const makeQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60_000 },
      },
    });

  // Each server render gets its own cache; the browser keeps one across renders and Suspense retries.
  if (isServer) return makeQueryClient();

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

function ThemeToaster() {
  const { resolvedTheme } = useTheme();

  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          {children}
          <ThemeToaster />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
