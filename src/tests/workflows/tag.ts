import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { getPartTagFileUrl, getPartTagName, getTagSellOrderQuantityText } from "@/lib/part-tag";
import type { PartTagSource } from "@/lib/part-tag";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";
import { readPdfPagesTexts } from "@/tests/utils/pdf";
import { expectPrintedByBrowser } from "@/tests/workflows/printer";

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
export function getTagSellOrderText(reference: string, quantity: number, sellOrderCount: number) {
  return `${sellOrderCount === 1 ? `${SELL_ORDER_LABEL}: ` : ""}${reference} ${getTagSellOrderQuantityText(quantity, sellOrderCount)}`;
}

// Every print names its tag file after what it is printed for and a random id, so a print is found by the start of its
// name
export function getTagNamePrefix(source: PartTagSource, id: number) {
  return getPartTagName(source, id, "");
}

export function expectNoTagFile(tagNamePrefix: string) {
  expect(fs.readdirSync(process.env.TAGS_ROOT_PATH!).filter((file) => file.startsWith(tagNamePrefix))).toEqual([]);
}

// The server deletes a tag once it is served, so its text is read from the response of the browser print and the file
// on disk has to be gone
export async function expectTagPrintedByBrowser(page: Page, buttonPrint: Locator, tagNamePrefix: string) {
  const tagUrl = getPartTagFileUrl(tagNamePrefix);
  // The iframe is removed right after printing, which discards the body of its response, so it is read on its way
  const routeUrl = (url: URL) => url.pathname.startsWith(tagUrl);
  let resolveTagPdf: (tagPdf: Buffer) => void = () => {};
  const tagPdf = new Promise<Buffer>((resolve) => (resolveTagPdf = resolve));
  await page.route(routeUrl, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response });
    resolveTagPdf(await response.body());
  });
  await expectPrintedByBrowser(page, buttonPrint);
  // Unrouting while the handler is still fetching lets the browser request the tag again, which the server has
  // already deleted
  const tagsTexts = await readPdfPagesTexts(await tagPdf);
  await page.unroute(routeUrl);
  expectNoTagFile(tagNamePrefix);
  return tagsTexts;
}

// The dialog fills in by default a single group of one tag holding the whole quantity of the row. Given the units of
// each tag, it prints one tag per group instead. Without Impresoras for tags, the browser prints it
export async function workflowPrintTag(
  page: Page,
  row: Locator,
  tagNamePrefix: string,
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
  const tagsTexts = await expectTagPrintedByBrowser(page, buttonSubmit, tagNamePrefix);

  await expect(dialogPrintTag).not.toBeVisible();
  return tagsTexts;
}
