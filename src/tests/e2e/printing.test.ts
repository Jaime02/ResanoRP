import fs from "node:fs";

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import type { TDatabase } from "@/db";
import { dbTablePrinter } from "@/db/schema";
import {
  CUPS_GRAY_COLOR_SPACE,
  IPP_PATH,
  IPP_PORT,
  LABEL_DPI,
  INTERMEC_IMAGE_NAME,
  IPP_USER_NAME,
  PWG_RASTER_MIME_TYPE,
  RASTER_BITS_PER_COLOR,
  RASTER_DPI,
} from "@/files/printer";
import { PartTagSource } from "@/lib/part-tag";
import { LoggerLevels, LogMessages } from "@/logging/types";
import { PRICE_LABEL } from "@/messages/common";
import { BROWSER_PRINTER_LABEL, PRINTER_UNREACHABLE_MESSAGE, SENT_TO_PRINTER_MESSAGE } from "@/messages/printer";
import { mockClients, mockDeliveryNotes, mockInvoices, mockSellOrders } from "@/tests/mock-data";
import { assertComboboxOptionsCount, openCombobox } from "@/tests/utils/components/combobox";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { expectSingleSuccessToast, expectSingleToast } from "@/tests/utils/components/toast";
import { httpRequestFailedEvent, rejectedMutationEvents } from "@/tests/utils/errors-log";
import { expectErrorsLog, inAnotherTab, test } from "@/tests/utils/fixtures";
import { getMockDeliveryNoteLines, getMockPendingSellOrderLines } from "@/tests/utils/mock-data-utils";
import {
  clearPrintJobs,
  MOCK_OFFLINE_PRINTER_HOST,
  MOCK_PRINTER_HOST,
  getMockPrinterShareCredentials,
  MOCK_LABELS_SHARE_NAME,
  MOCK_LASER_SHARE_NAME,
  MOCK_PRINTER_SHARE_HOST,
  MOCK_REJECTING_PRINTER_HOST,
  parseBrotherJobSettings,
  parseIntermecDirectProtocolJob,
  parseTsplJob,
  readPrintJobs,
  readRawJobs,
  readShareJobs,
} from "@/tests/utils/mock-printer";
import type { TPrintJob } from "@/tests/utils/mock-printer";
import { readPdfPagesTexts } from "@/tests/utils/pdf";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { workflowOpenCreateDeliveryNoteForClient } from "@/tests/workflows/delivery-note";
import {
  assertSelectedPrinter,
  expectPrintedByBrowser,
  getComboboxPrinter,
  MAINTENANCE_PRINTER_URL,
  workflowCreatePrinter,
  workflowDeletePrinter,
  workflowEditPrinter,
  workflowSelectPrinter,
} from "@/tests/workflows/printer";
import { workflowOpenSellOrderFile } from "@/tests/workflows/sell-order";
import { expectNoTagFile, getTagNamePrefix } from "@/tests/workflows/tag";
import { PrinterKind } from "@/types/printer";

// Sorted by name, so the first one, the default of the dialogs, is the one that prints
const PRINTERS = {
  accepting: { address: MOCK_PRINTER_HOST, name: "Almacén" },
  offline: { address: MOCK_OFFLINE_PRINTER_HOST, name: "Oficina" },
  rejecting: { address: MOCK_REJECTING_PRINTER_HOST, name: "Taller" },
};

// In points. Chromium rounds the size of the pages it prints, so a page only has to be close to it
const A4_SIZE_IN_POINTS = [595, 842] as const;
const POINTS_PER_INCH = 72;
// The page size of the raster header is in whole points, so the raster may differ from it by less than one
const PIXELS_PER_POINT = RASTER_DPI / POINTS_PER_INCH;
const MILLIMETERS_PER_INCH = 25.4;
const BITS_PER_BYTE = 8;
const TAG_RENDER_TIMEOUT_MS = 30_000;

const toDots = (millimeters: number) => Math.round((millimeters / MILLIMETERS_PER_INCH) * LABEL_DPI);
const PAGE_SIZE_TOLERANCE_IN_POINTS = 2;

enum Orientation {
  Portrait = "portrait",
  Landscape = "landscape",
}

const deliveryNote = mockDeliveryNotes[0];
const invoice = mockInvoices[0];
const sellOrderWithFile = mockSellOrders.find(
  (sellOrder) => sellOrder.deletedAt === null && sellOrder.fileUploadedAt !== null,
)!;

async function createPrinters(page: Page) {
  await page.goto(MAINTENANCE_PRINTER_URL);
  for (const printer of Object.values(PRINTERS)) {
    await workflowCreatePrinter(page, printer);
  }
}

async function getPrinterId(db: TDatabase, name: string) {
  return (await db.select().from(dbTablePrinter).where(eq(dbTablePrinter.name, name))).at(0)!.id;
}

// An admin chooses whether to print with prices, a user (null) prints without them straight away
async function workflowOpenPrintDeliveryNote(
  page: Page,
  adminChoice: "with-prices" | "without-prices" | null = "without-prices",
) {
  await page.goto(`/delivery-note/${deliveryNote.id}`);
  await page.getByTestId("button-print-delivery-note").click();
  if (adminChoice !== null) {
    await page.getByTestId(`button-print-delivery-note-${adminChoice}`).click();
  }
  const dialog = page.getByTestId("dialog-print-delivery-note-content");
  await expect(dialog).toBeVisible();
  return dialog;
}

// Waits for the job the printer saved after the given number of jobs, and checks it is the raster the shop's
// printers accept. The documents the app generates are A4, while an uploaded file keeps its own size
async function expectPrintJob(
  previousJobsCount: number,
  { host, orientation, pagesCount }: { host: string; orientation?: Orientation; pagesCount?: number },
): Promise<TPrintJob> {
  await expect.poll(() => readPrintJobs().length).toBe(previousJobsCount + 1);
  const job = readPrintJobs().at(-1)!;
  expect(job.host).toBe(host);
  expect(job.attributes).toMatchObject({
    "document-format": PWG_RASTER_MIME_TYPE,
    "printer-uri": `ipp://${host}:${IPP_PORT}${IPP_PATH}`,
    "requesting-user-name": IPP_USER_NAME,
  });
  if (pagesCount === undefined) {
    expect(job.pages.length).toBeGreaterThan(0);
  } else {
    expect(job.pages).toHaveLength(pagesCount);
  }
  for (const page of job.pages) {
    expect(page.bitsPerColor).toBe(RASTER_BITS_PER_COLOR);
    expect(page.colorSpace).toBe(CUPS_GRAY_COLOR_SPACE);
    expect(page.resolution).toEqual([RASTER_DPI, RASTER_DPI]);
    expect(Math.abs(page.width - (page.pageSize[0] * RASTER_DPI) / POINTS_PER_INCH)).toBeLessThan(PIXELS_PER_POINT);
    expect(Math.abs(page.height - (page.pageSize[1] * RASTER_DPI) / POINTS_PER_INCH)).toBeLessThan(PIXELS_PER_POINT);
    if (orientation !== undefined) {
      const [width, height] =
        orientation === Orientation.Portrait ? A4_SIZE_IN_POINTS : [A4_SIZE_IN_POINTS[1], A4_SIZE_IN_POINTS[0]];
      expect(Math.abs(page.pageSize[0] - width)).toBeLessThanOrEqual(PAGE_SIZE_TOLERANCE_IN_POINTS);
      expect(Math.abs(page.pageSize[1] - height)).toBeLessThanOrEqual(PAGE_SIZE_TOLERANCE_IN_POINTS);
    }
  }
  return job;
}

async function printOnPrinter(page: Page, buttonPrint: Locator, printerName: string) {
  const previousJobsCount = readPrintJobs().length;
  await buttonPrint.click();
  await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(printerName));
  return previousJobsCount;
}

test("print the documents on the Impresoras of the server or with the browser", async ({ page, db }) => {
  clearPrintJobs();

  await test.step("without Impresoras the browser prints the Albarán", async () => {
    const dialog = await workflowOpenPrintDeliveryNote(page);
    await assertSelectedPrinter(dialog, BROWSER_PRINTER_LABEL);
    await openCombobox(getComboboxPrinter(dialog));
    await assertComboboxOptionsCount(page, 1);
    await dialog.getByRole("heading").click();
    await expectPrintedByBrowser(page, dialog.getByTestId("button-print-delivery-note-once"));
  });

  await test.step("the Impresoras created meanwhile show up in the open dialog, the first one selected", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    await inAnotherTab(page, createPrinters);
    await assertSelectedPrinter(dialog, PRINTERS.accepting.name);
    await openCombobox(getComboboxPrinter(dialog));
    await expect(page.getByTestId("combobox-list").locator("[role='option']")).toHaveText([
      PRINTERS.accepting.name,
      PRINTERS.offline.name,
      PRINTERS.rejecting.name,
      BROWSER_PRINTER_LABEL,
    ]);
    await dialog.getByRole("heading").click();
  });

  await test.step("the Albarán is sent to the Impresora once or twice, and the dialog waits for it", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    const buttonOnce = dialog.getByTestId("button-print-delivery-note-once");
    const buttonTwice = dialog.getByTestId("button-print-delivery-note-twice");

    let previousJobsCount = readPrintJobs().length;
    await holdRequestWhile({
      page,
      procedurePath: "printer.print",
      send: async () => buttonOnce.click(),
      meanwhile: async () => {
        await expect(buttonOnce).toBeDisabled();
        await expect(buttonTwice).toBeDisabled();
        await expect(getComboboxPrinter(dialog)).toHaveAttribute("data-loading");
      },
    });
    await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(PRINTERS.accepting.name));
    await expect(buttonOnce).toBeEnabled();
    const jobOnce = await expectPrintJob(previousJobsCount, {
      host: PRINTERS.accepting.address,
      orientation: Orientation.Portrait,
    });

    previousJobsCount = await printOnPrinter(page, buttonTwice, PRINTERS.accepting.name);
    await expectPrintJob(previousJobsCount, {
      host: PRINTERS.accepting.address,
      orientation: Orientation.Portrait,
      pagesCount: jobOnce.pages.length * 2,
    });
  });

  await test.step("an Impresora that refuses the job or does not answer shows an error and prints nothing", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    const previousJobsCount = readPrintJobs().length;
    for (const printer of [PRINTERS.rejecting, PRINTERS.offline]) {
      const message = PRINTER_UNREACHABLE_MESSAGE(printer.name);
      expectErrorsLog(
        {
          error: expect.any(Object),
          level: LoggerLevels.error,
          message: LogMessages.printerPrintFailed,
          printerId: await getPrinterId(db, printer.name),
        },
        ...rejectedMutationEvents({
          code: "INTERNAL_SERVER_ERROR",
          message,
          procedurePath: "printer.print",
          serverError: null,
        }),
      );
      await workflowSelectPrinter(page, dialog, printer.name);
      await dialog.getByTestId("button-print-delivery-note-once").click();
      await expectSingleToast(page, message);
    }
    expect(readPrintJobs()).toHaveLength(previousJobsCount);
  });

  await test.step("the selected Impresora follows its changes in another tab", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    await workflowSelectPrinter(page, dialog, PRINTERS.rejecting.name);

    const renamedPrinter = { ...PRINTERS.rejecting, name: "Taller nuevo" };
    await inAnotherTab(page, async (anotherPage) => {
      await anotherPage.goto(MAINTENANCE_PRINTER_URL);
      await workflowEditPrinter(anotherPage, PRINTERS.rejecting.name, renamedPrinter);
    });
    await assertSelectedPrinter(dialog, renamedPrinter.name);

    // A deleted Impresora can no longer be used, so the first one is selected again
    await inAnotherTab(page, async (anotherPage) => {
      await anotherPage.goto(MAINTENANCE_PRINTER_URL);
      await workflowDeletePrinter(anotherPage, renamedPrinter.name);
    });
    await assertSelectedPrinter(dialog, PRINTERS.accepting.name);
  });

  await test.step("an Impresora shared by a Windows computer or a label printer on the network gets the Albarán in its own language", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    const credentials = getMockPrinterShareCredentials();
    const labelPrinter = {
      ...credentials,
      address: MOCK_PRINTER_SHARE_HOST,
      kind: PrinterKind.IntermecShare,
      labelLengthMm: 107,
      labelWidthMm: 52,
      name: "Etiquetas",
      shareName: MOCK_LABELS_SHARE_NAME,
    };
    const laserPrinter = {
      ...credentials,
      address: MOCK_PRINTER_SHARE_HOST,
      kind: PrinterKind.BrotherShare,
      name: "Láser",
      shareName: MOCK_LASER_SHARE_NAME,
    };
    const networkLabelPrinter = {
      address: MOCK_PRINTER_HOST,
      kind: PrinterKind.TscRaw,
      labelLengthMm: 70,
      labelWidthMm: 100,
      name: "Tarjetas",
    };
    await inAnotherTab(page, async (anotherPage) => {
      await anotherPage.goto(MAINTENANCE_PRINTER_URL);
      await workflowCreatePrinter(anotherPage, labelPrinter);
      await workflowCreatePrinter(anotherPage, laserPrinter);
      await workflowCreatePrinter(anotherPage, networkLabelPrinter);
    });
    const albaranPagesCount = readPrintJobs().at(0)!.pages.length;

    // Each page becomes a label, an image of the size of its labels at the resolution of the printer head
    await workflowSelectPrinter(page, dialog, labelPrinter.name);
    await dialog.getByTestId("button-print-delivery-note-once").click();
    await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(labelPrinter.name));
    await expect.poll(() => readShareJobs().length).toBe(1);
    const labelJob = readShareJobs()[0];
    expect(labelJob.shareName).toBe(MOCK_LABELS_SHARE_NAME);
    expect(parseIntermecDirectProtocolJob(labelJob.data)).toEqual(
      Array.from({ length: albaranPagesCount }, () => ({
        dpi: LABEL_DPI,
        height: toDots(labelPrinter.labelLengthMm),
        imageName: INTERMEC_IMAGE_NAME,
        width: toDots(labelPrinter.labelWidthMm),
      })),
    );

    await workflowSelectPrinter(page, dialog, laserPrinter.name);
    await dialog.getByTestId("button-print-delivery-note-once").click();
    await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(laserPrinter.name));
    await expect.poll(() => readShareJobs().length).toBe(2);
    const laserJob = readShareJobs()[1];
    expect(laserJob.shareName).toBe(MOCK_LASER_SHARE_NAME);
    expect(parseBrotherJobSettings(laserJob.data)).toMatchObject({ ORIENTATION: "PORTRAIT", PAPER: "A4" });

    // A label printer on the network gets the same labels as TSPL bitmaps on its raw port
    await workflowSelectPrinter(page, dialog, networkLabelPrinter.name);
    await dialog.getByTestId("button-print-delivery-note-once").click();
    await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(networkLabelPrinter.name));
    await expect.poll(() => readRawJobs().length).toBe(1);
    expect(parseTsplJob(readRawJobs()[0])).toEqual(
      Array.from({ length: albaranPagesCount }, () => ({
        bytesPerRow: Math.ceil(toDots(networkLabelPrinter.labelWidthMm) / BITS_PER_BYTE),
        height: toDots(networkLabelPrinter.labelLengthMm),
        size: `${networkLabelPrinter.labelWidthMm} mm,${networkLabelPrinter.labelLengthMm} mm`,
      })),
    );
  });

  await test.step("Otra prints the Albarán with the browser", async () => {
    const dialog = page.getByTestId("dialog-print-delivery-note-content");
    await workflowSelectPrinter(page, dialog, BROWSER_PRINTER_LABEL);
    await expectPrintedByBrowser(page, dialog.getByTestId("button-print-delivery-note-once"));
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  await test.step("a Factura is sent to the Impresora", async () => {
    await page.goto("/invoicing");
    await getTableRowByTestId(page.getByTestId("table-invoice"), invoice.id)
      .getByTestId("button-print-invoice")
      .click();
    const dialog = page.getByTestId("dialog-print-invoice-content");
    await expect(dialog).toBeVisible();
    await assertSelectedPrinter(dialog, PRINTERS.accepting.name);
    const previousJobsCount = await printOnPrinter(
      page,
      dialog.getByTestId("button-print-invoice-once"),
      PRINTERS.accepting.name,
    );
    await expectPrintJob(previousJobsCount, { host: PRINTERS.accepting.address, orientation: Orientation.Portrait });
  });

  await test.step("the pending sell orders are sent to the Impresora in landscape", async () => {
    const activeClients = mockClients.filter((client) => client.deletedAt === null);
    const pendingLinesByClient = await Promise.all(
      activeClients.map(async (client) => getMockPendingSellOrderLines(client.id)),
    );
    const clientWithPendingLines = activeClients.find((_, index) => pendingLinesByClient[index].length > 0);
    expect(clientWithPendingLines, "Wrong test set up: Some Cliente should have pending lines").toBeDefined();

    await workflowOpenCreateDeliveryNoteForClient(page, clientWithPendingLines!);
    await page.getByTestId("button-print-pending-sell-orders").click();
    await page.getByTestId("button-print-pending-sell-orders-with-checkboxes").click();
    const dialog = page.getByTestId("dialog-print-pending-sell-orders-content");
    await expect(dialog).toBeVisible();
    const previousJobsCount = await printOnPrinter(
      page,
      dialog.getByTestId("button-print-pending-sell-orders-once"),
      PRINTERS.accepting.name,
    );
    await expectPrintJob(previousJobsCount, { host: PRINTERS.accepting.address, orientation: Orientation.Landscape });
  });

  await test.step("the file of a Pedido de venta is sent to the Impresora", async () => {
    await page.goto("/sell-order");
    const dialog = await workflowOpenSellOrderFile(
      page,
      getTableRowByTestId(page.getByTestId("table-sell-order"), sellOrderWithFile.id).getByTestId(
        "button-sell-order-file",
      ),
    );
    const previousJobsCount = await printOnPrinter(
      page,
      dialog.getByTestId("button-print-sell-order-file"),
      PRINTERS.accepting.name,
    );
    await expectPrintJob(previousJobsCount, { host: PRINTERS.accepting.address });
  });

  await test.step("an Impresora for tags only prints tags, rendered at the size of its labels", async () => {
    const tagPrinter = {
      address: MOCK_PRINTER_HOST,
      forTags: true,
      kind: PrinterKind.TscRaw,
      labelLengthMm: 70,
      labelWidthMm: 100,
      name: "Etiquetas de pieza",
    };
    await inAnotherTab(page, async (anotherPage) => {
      await anotherPage.goto(MAINTENANCE_PRINTER_URL);
      await workflowCreatePrinter(anotherPage, tagPrinter);
    });

    const dialogDeliveryNote = await workflowOpenPrintDeliveryNote(page);
    await openCombobox(getComboboxPrinter(dialogDeliveryNote));
    await expect(page.getByTestId("combobox-list").getByText(tagPrinter.name)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    const deliveryNoteLine = getMockDeliveryNoteLines(deliveryNote.id)[0];
    await getTableRowByTestId(page.getByTestId("table-delivery-note-line"), deliveryNoteLine.id)
      .getByTestId("button-print-tag")
      .click();
    const dialogTag = page.getByTestId("dialog-tag-print-content");
    await assertSelectedPrinter(dialogTag, tagPrinter.name);
    const previousRawJobsCount = readRawJobs().length;
    await dialogTag.getByTestId("button-submit").click();
    // The tag is rendered when it is printed, so the printer gets it later than a file that was already generated
    await expect.poll(() => readRawJobs().length, { timeout: TAG_RENDER_TIMEOUT_MS }).toBe(previousRawJobsCount + 1);
    await expectSingleSuccessToast(page, SENT_TO_PRINTER_MESSAGE(tagPrinter.name));
    await expect(dialogTag).not.toBeVisible();
    expectNoTagFile(getTagNamePrefix(PartTagSource.DeliveryNoteLine, deliveryNoteLine.id));

    // The tag fills the label exactly, so the printer gets it at its size without scaling it
    expect(parseTsplJob(readRawJobs().at(-1)!)).toEqual([
      {
        bytesPerRow: Math.ceil(toDots(tagPrinter.labelWidthMm) / BITS_PER_BYTE),
        height: toDots(tagPrinter.labelLengthMm),
        size: `${tagPrinter.labelWidthMm} mm,${tagPrinter.labelLengthMm} mm`,
      },
    ]);
  });
});

// The download is the file the preview shows
async function downloadPrintedDeliveryNote(page: Page, dialog: Locator) {
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByTestId("button-download-delivery-note").click();
  const download = await downloadPromise;
  return { texts: await readPdfPagesTexts(await fs.promises.readFile(await download.path())), url: download.url() };
}

test("an Albarán with prices is a file apart, which only the Administrador opens, and a user prints on the Impresoras of an admin", async ({
  page,
  openPage,
}) => {
  const userPage = await openPage({ userMode: UserMode.User });
  const dialog = await workflowOpenPrintDeliveryNote(page, "with-prices");

  await test.step("a user prints the same Albarán meanwhile, without prices", async () => {
    const userDialog = await workflowOpenPrintDeliveryNote(userPage, null);
    const { texts } = await downloadPrintedDeliveryNote(userPage, userDialog);
    expect(texts.join(" ")).not.toContain(PRICE_LABEL);
  });

  const { texts, url } = await downloadPrintedDeliveryNote(page, dialog);
  await test.step("the preview of the Administrador still has the prices", () => {
    expect(texts.join(" ")).toContain(PRICE_LABEL);
  });

  await test.step("a user can not open it", async () => {
    const { pathname, search } = new URL(url);
    const response = await userPage.goto(url);
    expect(response?.status()).toBe(403);
    expectErrorsLog(httpRequestFailedEvent("GET", 403, `${pathname}${search}`));
  });

  await test.step("a user prints an Albarán on an Impresora created by an admin", async () => {
    clearPrintJobs();
    await createPrinters(page);

    const userDialog = await workflowOpenPrintDeliveryNote(userPage, null);
    await assertSelectedPrinter(userDialog, PRINTERS.accepting.name);
    const previousJobsCount = await printOnPrinter(
      userPage,
      userDialog.getByTestId("button-print-delivery-note-once"),
      PRINTERS.accepting.name,
    );
    await expectPrintJob(previousJobsCount, { host: PRINTERS.accepting.address, orientation: Orientation.Portrait });
  });
});
