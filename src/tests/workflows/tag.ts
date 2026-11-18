import fs from "node:fs";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { formatPartUnits } from "@/lib/formatters";
import { getPartTagFileUrl } from "@/lib/part-tag";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import { expectPrintedByBrowser } from "@/tests/workflows/printer";

// The text of each tag, which is a page of its PDF. A value wrapped onto several lines or split into several runs is
// joined back, and the fields are separated by a single space
async function readTagsTexts(tagPdf: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(tagPdf) }).promise;
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

// The labels of a tag are uppercased by its style, so they are compared ignoring the case. Without a value, the field
// is not on the tag
export function expectTagField(tag: string, label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    expect(tag.toLowerCase()).not.toContain(label.toLowerCase());
  } else {
    expect(tag.toLowerCase()).toContain(`${label} ${value}`.toLowerCase());
  }
}

// A tag of a single Pedido names it, while a tag shared by several Pedidos lists them in rows
export function getTagSellOrderText(reference: string, quantity: number, isSingle: boolean) {
  return `${isSingle ? `${SELL_ORDER_LABEL}: ` : ""}${reference} ${formatPartUnits(quantity)}`;
}

// The server deletes a tag once it is served, so its text is read from the response of the browser print and the file
// on disk has to be gone
export async function expectTagPrintedByBrowser(page: Page, buttonPrint: Locator, tagFilePath: string) {
  const tagUrl = getPartTagFileUrl(path.basename(tagFilePath, ".pdf")).split("?")[0];
  const [response] = await Promise.all([
    page.waitForResponse((tagResponse) => tagResponse.url().includes(tagUrl)),
    expectPrintedByBrowser(page, buttonPrint),
  ]);
  const tagsTexts = await readTagsTexts(await response.body());
  expect(fs.existsSync(tagFilePath)).toBe(false);
  return tagsTexts;
}

// The dialog fills in by default a single group of one tag holding the whole quantity of the row. Given the units of
// each tag, it prints one tag per group instead. Without Impresoras for tags, the browser prints it
export async function workflowPrintTag(
  page: Page,
  row: Locator,
  tagFilePath: string,
  tagsPartQuantities?: Array<number>,
) {
  await row.getByTestId("button-print-tag").click();

  const dialogPrintTag = page.getByTestId("dialog-tag-print-content");
  const buttonSubmit = dialogPrintTag.getByTestId("button-submit");
  await expect(dialogPrintTag).toBeVisible();
  for (const [index, partQuantity] of (tagsPartQuantities ?? []).entries()) {
    if (index > 0) {
      await dialogPrintTag.getByTestId("button-add-tag-group").click();
      // A new group starts without units, and a tag without units can not be printed
      await expect(dialogPrintTag.getByTestId("input-tag-part-quantity").nth(index)).toHaveValue("0");
      await expect(buttonSubmit).toBeDisabled();
    }
    const inputPartQuantity = dialogPrintTag.getByTestId("input-tag-part-quantity").nth(index);
    await inputPartQuantity.fill(String(partQuantity));
    await expect(inputPartQuantity).toHaveValue(String(partQuantity));
  }
  const tagsTexts = await expectTagPrintedByBrowser(page, buttonSubmit, tagFilePath);

  await expect(dialogPrintTag).not.toBeVisible();
  return tagsTexts;
}
