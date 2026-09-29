"use client";

import { useSyncExternalStore } from "react";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;
const subscribe = () => () => undefined;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore<boolean>(
    subscribe,
    () => true,
    () => false,
  );
  const index = mounted ? themes.findIndex(({ value }) => value === theme) : 2;
  const currentIndex = index === -1 ? 2 : index;
  const current = themes[currentIndex];
  const next = themes[(currentIndex + 1) % themes.length];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11"
      disabled={!mounted}
      onClick={() => setTheme(next.value)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
      title={`Theme: ${current.label}. Switch to ${next.label}.`}
    >
      <current.icon aria-hidden="true" />
    </Button>
  );
}
