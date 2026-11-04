import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Vite transforms every .mjs it serves out of node_modules, prepending an import
// of /@vite/client - a pdf.js worker started from there boots its own HMR socket.
// public/ is served untransformed, so the worker is copied here instead. Resolving
// it through pdfjs-dist's own package keeps it on the exact version react-pdf
// depends on, so the two can't drift.
const pdfjsDistPath = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const source = path.join(pdfjsDistPath, "build", "pdf.worker.min.mjs");
const destination = path.resolve("public/pdf.worker.min.mjs");

mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(source, destination);

// The worker loads its image decoders (JBig2, JPEG 2000) from wasmUrl; without
// them scanned PDFs render blank.
cpSync(path.join(pdfjsDistPath, "wasm"), path.resolve("public/pdfjs-wasm"), { recursive: true });

console.debug(`✅ Copied pdf.worker.min.mjs and wasm/ from ${pdfjsDistPath} to public/`);
