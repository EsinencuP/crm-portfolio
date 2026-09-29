"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { Building2, DollarSign, LoaderCircle, Search, Users } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { CrmSearchResults } from "@/lib/search-types";

const searchGroups = [
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "deals", label: "Deals", icon: DollarSign },
] as const;

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { data: session, status } = useSession();
  const router = useRouter();
  const normalizedQuery = query.trim();
  const canSearch = normalizedQuery.length >= 2;

  const handleOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    if (!value) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 250);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.repeat &&
        !event.isComposing &&
        !event.defaultPrevented
      ) {
        event.preventDefault();
        handleOpenChange(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleOpenChange]);

  const search = useQuery<CrmSearchResults>({
    queryKey: ["crm-search", session?.user.id, debouncedQuery],
    enabled: open && status !== "loading" && debouncedQuery.length >= 2,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "Please sign in to search." : "Search is unavailable. Please try again.",
        );
      }
      return response.json();
    },
    staleTime: 0,
    retry: false,
  });
  const isWaiting = canSearch && (normalizedQuery !== debouncedQuery || search.isFetching || search.isPending);
  const showResults = canSearch && !isWaiting && !search.isError;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label="Search CRM"
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Search CRM (⌘K / Ctrl+K)"
        className="size-11 gap-2 p-0 lg:w-auto lg:px-3"
        onClick={() => handleOpenChange(true)}
      >
        <Search aria-hidden="true" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px] lg:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog
        title="Search CRM"
        description="Search contacts, companies, and deals. Use the arrow keys to select a result and Enter to open it."
        open={open}
        onOpenChange={handleOpenChange}
        showCloseButton
        className="top-[15%] max-h-[75dvh] sm:max-w-xl"
      >
        <Command shouldFilter={false} vimBindings={false} label="Search contacts, companies, and deals">
          <CommandInput
            aria-label="Search contacts, companies, and deals"
            placeholder="Search contacts, companies, and deals…"
            value={query}
            onValueChange={setQuery}
            maxLength={100}
            className="pr-10"
          />
          <CommandList className="max-h-[50dvh]" aria-busy={isWaiting}>
            {!canSearch && <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>}
            {isWaiting && (
              <div role="status" className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                Searching…
              </div>
            )}
            {canSearch && !isWaiting && search.isError && (
              <div role="alert" className="space-y-2 p-4 text-center text-sm">
                <p>{search.error.message}</p>
                <Button type="button" variant="outline" onClick={() => void search.refetch()}>
                  Try again
                </Button>
              </div>
            )}
            {showResults && (
              <>
                <CommandEmpty>No results found.</CommandEmpty>
                {searchGroups.map((group) => (
                  <CommandGroup key={group.key} heading={group.label}>
                    {search.data?.[group.key].map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${group.key}:${item.id}`}
                        onSelect={() => {
                          handleOpenChange(false);
                          router.push(item.url);
                        }}
                        className="min-h-12 gap-3"
                      >
                        <group.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                        <span className="grid min-w-0 gap-0.5">
                          <span className="truncate font-medium">{item.name}</span>
                          <span className="truncate text-muted-foreground text-xs">{item.subtitle}</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
