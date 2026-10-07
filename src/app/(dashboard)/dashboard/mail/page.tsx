import { Suspense } from "react";

import { MailClient } from "./_components/mail-client";

export default function MailPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Loading mail…</p>}>
      <MailClient />
    </Suspense>
  );
}
