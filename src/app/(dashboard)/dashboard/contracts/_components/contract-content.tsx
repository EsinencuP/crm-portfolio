"use client";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContractContentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function insert(before: string, after = "") {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    onChange(value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end));
    el.focus();
  }
  return (
    <div className="space-y-2">
      <Label htmlFor="contract-content">Contract content (Markdown)</Label>
      <fieldset className="flex flex-wrap gap-2" aria-label="Markdown formatting">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => insert("**", "**")}>
          Bold
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => insert("## ")}>
          Heading
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => insert("- ")}>
          List item
        </Button>
      </fieldset>
      <Textarea
        ref={ref}
        id="contract-content"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
        maxLength={60000}
        disabled={disabled}
        className="font-mono text-sm"
      />
      <p className="text-muted-foreground text-xs">
        Supports headings, bold text and list items. HTML and embedded content are displayed as text.
      </p>
    </div>
  );
}
export function ContractContentPreview({ content }: { content: string | null }) {
  const blocks = (content ?? "No contract content.").split("\n");
  const occurrences = new Map<string, number>();
  return (
    <div className="space-y-2 break-words [overflow-wrap:anywhere]">
      {blocks.map((line) => {
        const count = occurrences.get(line) ?? 0;
        occurrences.set(line, count + 1);
        const heading = /^(#{1,3})\s+(.+)$/.exec(line) ?? [],
          list = /^-\s+(.+)$/.exec(line) ?? [];
        let text = line;
        if (heading.length > 0) text = heading[2];
        else if (list.length > 0) text = list[1];
        const inlineOccurrences = new Map<string, number>();
        const inline = text.split(/(\*\*[^*]+\*\*)/g).map((part) => {
          const occurrence = inlineOccurrences.get(part) ?? 0;
          inlineOccurrences.set(part, occurrence + 1);
          return part.startsWith("**") && part.endsWith("**") ? (
            <strong key={`${occurrence}:${part}`}>{part.slice(2, -2)}</strong>
          ) : (
            part
          );
        });
        const key = `${count}:${line}`;
        if (heading.length > 0 && heading[1].length === 1)
          return (
            <h2 key={key} className="pt-3 font-semibold text-xl">
              {inline}
            </h2>
          );
        if (heading.length > 0)
          return (
            <h3 key={key} className="pt-2 font-semibold text-lg">
              {inline}
            </h3>
          );
        if (list.length > 0)
          return (
            <p key={key} className="pl-4">
              • {inline}
            </p>
          );
        return (
          <p key={key} className="min-h-3 whitespace-pre-wrap">
            {inline}
          </p>
        );
      })}
    </div>
  );
}
