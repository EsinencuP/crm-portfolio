"use client";

import { type CSSProperties, type FormEvent, useId, useRef, useState } from "react";

import type { PublicFormConfig } from "@/lib/forms/config";

const controlClass =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60";
export function PublicForm({ config, preview = false }: { config: PublicFormConfig; preview?: boolean }) {
  const prefix = useId();
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const dark = config.style.theme === "dark";
  const style: CSSProperties = {
    backgroundColor: dark ? "#18181b" : "#ffffff",
    color: dark ? "#fafafa" : "#18181b",
    colorScheme: dark ? "dark" : "light",
  };
  const controlStyle = { backgroundColor: dark ? "#27272a" : "#ffffff", borderColor: dark ? "#52525b" : "#d4d4d8" };
  const rgb = config.style.primaryColor
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16)) ?? [0, 0, 0];
  const buttonColor = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? "#000000" : "#ffffff";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview || busy) return;
    const values = new FormData(event.currentTarget);
    const data = Object.fromEntries(
      config.fields.map((field) => [
        field.name,
        field.type === "checkbox" ? values.has(field.name) : String(values.get(field.name) ?? ""),
      ]),
    );
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/forms/${encodeURIComponent(config.slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, requestId: requestId.current, website: String(values.get("_website") ?? "") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        throw new Error(result.error ?? "Unable to submit.");
      }
      setMessage(result.message);
      if (result.redirectUrl) {
        const destination = new URL(result.redirectUrl);
        if (["https:", "http:"].includes(destination.protocol)) window.location.assign(destination.href);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w-full rounded-xl border p-6 shadow-sm" style={style} aria-label={config.name}>
      <h1 className="mb-2 font-semibold text-2xl">{config.name}</h1>
      {config.description && <p className="mb-6 whitespace-pre-wrap text-sm opacity-80">{config.description}</p>}
      {message ? (
        <p role="status" className="whitespace-pre-wrap py-6">
          {message}
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy}>
          <div className={config.style.layout === "two-column" ? "grid gap-5 sm:grid-cols-2" : "grid gap-5"}>
            {config.fields.map((field) => {
              const id = `${prefix}-${field.name}`;
              const common = {
                id,
                name: field.name,
                required: field.required,
                disabled: busy,
                "aria-invalid": Boolean(fieldErrors[field.name]),
                "aria-describedby": fieldErrors[field.name] ? `${id}-error` : undefined,
              };
              return (
                <div key={field.name} className={field.type === "textarea" ? "sm:col-span-full" : "space-y-1.5"}>
                  <label htmlFor={id} className="mb-1.5 block font-medium text-sm">
                    {field.label}
                    {field.required && <span aria-hidden="true"> *</span>}
                  </label>
                  {field.type === "textarea" && (
                    <textarea
                      {...common}
                      rows={4}
                      placeholder={field.placeholder}
                      maxLength={10000}
                      className={controlClass}
                      style={controlStyle}
                    />
                  )}
                  {field.type === "select" && (
                    <select {...common} defaultValue="" className={controlClass} style={controlStyle}>
                      <option value="">{field.placeholder || "Choose an option"}</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                  {field.type === "checkbox" && (
                    <input
                      {...common}
                      type="checkbox"
                      className="size-4"
                      style={{ accentColor: config.style.primaryColor }}
                    />
                  )}
                  {["text", "email", "phone"].includes(field.type) && (
                    <input
                      {...common}
                      type={field.type === "phone" ? "tel" : field.type}
                      placeholder={field.placeholder}
                      maxLength={field.type === "email" ? 254 : 500}
                      className={controlClass}
                      style={controlStyle}
                    />
                  )}
                  {fieldErrors[field.name] && (
                    <p id={`${id}-error`} className="mt-1 text-red-500 text-sm">
                      {fieldErrors[field.name].join(" ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <input type="text" name="_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          {error && (
            <p role="alert" className="text-red-500 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || preview}
            className="w-full rounded-md px-4 py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            style={{ backgroundColor: config.style.primaryColor, color: buttonColor }}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
          {preview && <p className="text-center text-xs opacity-70">Preview only — no lead will be created.</p>}
        </form>
      )}
    </section>
  );
}
