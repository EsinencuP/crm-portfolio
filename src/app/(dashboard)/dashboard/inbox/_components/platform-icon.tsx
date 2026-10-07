import { siTelegram, siWhatsapp } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import type { Platform } from "@/lib/messaging/types";

export function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <SimpleIcon
      icon={platform === "WHATSAPP" ? siWhatsapp : siTelegram}
      className={platform === "WHATSAPP" ? "size-5 shrink-0 fill-green-600" : "size-5 shrink-0 fill-sky-500"}
    />
  );
}
