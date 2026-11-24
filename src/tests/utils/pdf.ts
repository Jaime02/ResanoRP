import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// The text of each page of a PDF. A value wrapped onto several lines or split into several runs is joined back, and the
// fields are separated by a single space
export async function readPdfPagesTexts(pdfBuffer: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  return Promise.all(
    Array.from({ length: pdf.numPages }, async (_, index) =>
      (await (await pdf.getPage(index + 1)).getTextContent()).items
        .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? " " : ""}` : ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
}
