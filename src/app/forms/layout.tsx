import type { ReactNode } from "react";

// Public capture pages intentionally do not use the authenticated dashboard layout.
export default function FormsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-zinc-100 p-4 py-10 sm:p-10">
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}
