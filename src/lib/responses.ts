import fs from "node:fs/promises";

// Without a type, the browser sniffs the text and may download it instead of showing it
export function textResponse(message: string, status: number) {
  return new Response(message, { headers: { "Content-Type": "text/plain; charset=utf-8" }, status });
}

// No Accept-Ranges: Range is not honored, and advertising it makes PDF.js download the whole file once per chunk.
// The ETag follows the file on disk, so a PDF regenerated or overwritten under the same url is fetched again
export async function pdfFileResponse(request: Request, filePath: string, contentDisposition: string) {
  const { size, mtimeMs } = await fs.stat(filePath);
  const headers = {
    "Cache-Control": "private, no-cache",
    ETag: `"${size}-${Math.trunc(mtimeMs)}"`,
  };
  const ifNoneMatch = request.headers
    .get("If-None-Match")
    ?.split(",")
    .map((etag) => etag.trim());
  if (ifNoneMatch?.includes(headers.ETag) === true) {
    return new Response(null, { headers, status: 304 });
  }
  return new Response(new Uint8Array(await fs.readFile(filePath)), {
    headers: { ...headers, "Content-Disposition": contentDisposition, "Content-Type": "application/pdf" },
    status: 200,
  });
}
