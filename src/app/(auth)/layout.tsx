import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-dvh flex-1 bg-white p-2 text-zinc-950">
      <div className="grid w-full lg:grid-cols-[2fr_3fr]">
        <aside className="hidden flex-col justify-between rounded-3xl bg-zinc-950 p-10 text-white lg:flex xl:p-12">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-14 items-center justify-center rounded-xl border border-white/20 font-semibold text-sm tracking-tight">
                CRM
              </span>
              <p className="font-medium text-2xl tracking-tight">CRM Portfolio</p>
            </div>
            <p className="max-w-sm text-sm text-white/70 leading-6">
              Your contacts, deals, and next steps. Together in one workspace.
            </p>
          </div>

          <div className="flex gap-5">
            <div className="flex-1 space-y-2">
              <h2 className="font-medium text-sm">Stay organized</h2>
              <p className="text-sm text-white/60 leading-6">Keep your contacts, companies, and deals connected.</p>
            </div>
            <Separator orientation="vertical" className="h-auto self-stretch bg-white/15" />
            <div className="flex-1 space-y-2">
              <h2 className="font-medium text-sm">Move work forward</h2>
              <p className="text-sm text-white/60 leading-6">
                Follow up on conversations and keep track of your pipeline.
              </p>
            </div>
          </div>
        </aside>

        <section
          aria-label="Account access"
          className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 lg:px-12"
        >
          {children}
        </section>
      </div>
    </main>
  );
}
