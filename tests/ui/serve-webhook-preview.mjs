import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const workflowPreview = process.argv.includes("--workflows");
const productPreview = process.argv.includes("--products");
const quotationPreview = process.argv.includes("--quotations");
const invoicePreview = process.argv.includes("--invoices");
let previewKind = "webhook";
if (workflowPreview) previewKind = "workflow";
if (productPreview) previewKind = "product";
if (quotationPreview) previewKind = "quotation";
if (invoicePreview) previewKind = "invoice";
const js = await build({
  entryPoints: [`tests/ui/${previewKind}-preview-entry.tsx`],
  outfile: "preview.js",
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  define: { "process.env.NODE_ENV": '"development"' },
});
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), { from: cssPath });
const server = createServer(async (request, response) => {
  if ((quotationPreview || invoicePreview) && request.url === "/fixture-pdf" && request.method === "POST") {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 131072) throw new Error("Fixture too large");
        chunks.push(chunk);
      }
      const { renderDocumentPdf } = await import("../../src/lib/quotations/pdf.ts");
      const pdf = await renderDocumentPdf(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        invoicePreview ? "Invoice" : "Quotation",
      );
      response.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store" });
      response.end(Buffer.from(pdf));
    } catch {
      response.writeHead(400);
      response.end("Invalid PDF fixture");
    }
    return;
  }
  const paths = {
    "/bundle.js": ["text/javascript", js.outputFiles.find((file) => file.path.endsWith(".js")).text],
    "/styles.css": ["text/css", css.css + (js.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "")],
    "/": [
      "text/html",
      `<!doctype html><html lang="en" style="--font-inter:Arial;--font-geist-mono:monospace"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${previewKind} UI fixture preview</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`,
    ],
  };
  const asset = paths[request.url];
  response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] ?? "text/plain", "Cache-Control": "no-store" });
  response.end(asset?.[1] ?? "Not found");
});
const port = { invoice: 3111, quotation: 3110, product: 3109, workflow: 3108, webhook: 3107 }[previewKind];
server.listen(port, "127.0.0.1", () => console.log(`Fixture-only ${previewKind} UI: http://127.0.0.1:${port}`));
process.on("SIGINT", () => server.close());
