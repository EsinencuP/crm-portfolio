import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

const workflowPreview = process.argv.includes("--workflows");
const js = await build({
  entryPoints: [workflowPreview ? "tests/ui/workflow-preview-entry.tsx" : "tests/ui/webhook-preview-entry.tsx"],
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
const server = createServer((request, response) => {
  const paths = {
    "/bundle.js": ["text/javascript", js.outputFiles.find((file) => file.path.endsWith(".js")).text],
    "/styles.css": ["text/css", css.css + (js.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "")],
    "/": [
      "text/html",
      '<!doctype html><html lang="en" style="--font-inter:Arial;--font-geist-mono:monospace"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Webhook UI fixture preview</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
    ],
  };
  const asset = paths[request.url];
  response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] ?? "text/plain", "Cache-Control": "no-store" });
  response.end(asset?.[1] ?? "Not found");
});
const port = workflowPreview ? 3108 : 3107;
server.listen(port, "127.0.0.1", () =>
  console.log(`Fixture-only ${workflowPreview ? "workflow" : "webhook"} UI: http://127.0.0.1:${port}`),
);
process.on("SIGINT", () => server.close());
