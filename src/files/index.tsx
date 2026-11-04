import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { renderToString } from "react-dom/server";

import { cn } from "@/lib/utils";

const stylesPath = path.join(process.cwd(), "public", "styles.css");

const BROWSER_TIMEOUT_MS = 30_000;

let browserPromise: Promise<Browser> | undefined;

async function getBrowser() {
  browserPromise ??= chromium.launch({ timeout: BROWSER_TIMEOUT_MS }).catch((error: unknown) => {
    browserPromise = undefined;
    throw error;
  });

  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = undefined;
    return getBrowser();
  }
  return browser;
}

export async function closePdfBrowser() {
  const promise = browserPromise;
  if (promise === undefined) return;
  browserPromise = undefined;
  await (await promise).close();
}

// Nowrap cells make the table's minimum width the sum of every column's longest value, which can
// exceed the page and push the table past its border. Letting cells break anywhere lowers that
// minimum to the page width, so columns keep their natural width until space runs out.
export const WRAPPING_CELL_CLASS_NAME = "text-wrap wrap-anywhere";

function getCssContent() {
  return fs.readFileSync(stylesPath, "utf8");
}

const IMAGE_MIME_TYPES: Partial<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const publicImageDataUris = new Map<string, string>();

export function getPublicImageDataUri(fileName: string) {
  const cached = publicImageDataUris.get(fileName);
  if (cached !== undefined) return cached;

  const mimeType = IMAGE_MIME_TYPES[path.extname(fileName).toLowerCase()];
  if (mimeType === undefined) throw new Error(`Unsupported image type: ${fileName}`);

  const base64 = fs.readFileSync(path.join(process.cwd(), "public", fileName)).toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  publicImageDataUris.set(fileName, dataUri);
  return dataUri;
}

function DocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="UTF-8" />
        <style dangerouslySetInnerHTML={{ __html: getCssContent() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function fitFontSize(value: string | number, maxPt: number, idealChars: number, minPt: number) {
  const length = String(value).length;
  if (length <= idealChars) return maxPt;
  return Math.max(minPt, maxPt * (idealChars / length));
}

interface AutoFitTextProps {
  value: string | number;
  maxPt: number;
  idealChars: number;
  minPt: number;
  wrap?: boolean;
  maxLines?: number;
  className?: string;
}

export function AutoFitText({ value, maxPt, idealChars, minPt, wrap = true, maxLines, className }: AutoFitTextProps) {
  const fontSize = fitFontSize(value, maxPt, idealChars, minPt);
  return (
    <span
      className={cn("max-w-full shrink-0 overflow-hidden", wrap ? "wrap-break-word" : "whitespace-nowrap", className)}
      style={{ fontSize: `${fontSize}pt`, hyphens: wrap ? "auto" : undefined, textWrap: wrap ? "balance" : undefined }}
    >
      {wrap && maxLines !== undefined ? (
        // Chrome blockifies a line-clamped flex item and then skips the ellipsis, so the clamp lives on an inner element
        <span
          className="overflow-hidden"
          style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: maxLines }}
        >
          {value}
        </span>
      ) : (
        value
      )}
    </span>
  );
}

type RenderPdfSize =
  | { width: string; height: string; format?: never; landscape?: never }
  | { format: "A4" | "Letter"; landscape?: boolean; width?: never; height?: never };

type RenderPdfProps = RenderPdfSize & {
  document: React.ReactNode;
  path?: string;
  margin?: string;
  saveHtml?: boolean;
};

export async function renderPdf({
  document,
  path,
  width,
  height,
  margin = "0",
  saveHtml = false,
  format,
  landscape,
}: RenderPdfProps) {
  const html = `<!doctype html>${renderToString(<DocumentLayout>{document}</DocumentLayout>)}`;

  if (saveHtml && path !== undefined) {
    fs.writeFileSync(path.replace(/\.pdf$/, ".html"), html);
  }

  const browser = await getBrowser();
  const context = await browser.newContext();
  context.setDefaultTimeout(BROWSER_TIMEOUT_MS);

  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      format,
      height,
      landscape,
      margin: { bottom: margin, left: margin, right: margin, top: margin },
      path,
      printBackground: true,
      width,
    });
  } finally {
    await context.close();
  }
}
