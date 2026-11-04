import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { addDays } from "date-fns";
import { eq, inArray } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import { getDeliveryNote, getDeliveryNotes } from "@/db/functions/delivery-note";
import { getDeliveryNoteLine, getDeliveryNoteLinesByDeliveryNoteId } from "@/db/functions/delivery-note-line";
import { getInvoiceById } from "@/db/functions/invoice";
import { getLatestPartStockTransactionByPartId, getLatestPartStockTransactionsByIds } from "@/db/functions/part-stock";
import { getSellOrders } from "@/db/functions/sell-order";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice, dbTableSellOrderLine } from "@/db/schema";
import { formatDate, formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents } from "@/lib/prices";
import { SellOrderStatus } from "@/schemas/sell-order";
import { assertPartStockConsumption } from "@/tests/assertions/part-stock";
import { MOCK_INITIAL_DATE, mockClients, mockDeliveryNotes, mockInvoices, mockSellOrderLines } from "@/tests/mock-data";
import { getTestId } from "@/tests/utils/components";
import {
  assertComboboxValue,
  clickInComboboxOption,
  getClearComboboxButton,
  openCombobox,
} from "@/tests/utils/components/combobox";
import {
  assertTableRowCount,
  getDivDisabledMessage,
  getEditableCellById,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
  getTableSubrowById,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { TestAnnotations, inAnotherTab, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockPartByPartReferenceId,
  getMockPartReferenceById,
  getMockPendingSellOrderLines,
  getMockSellOrderById,
} from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import {
  workflowAppendStagedLinesToDeliveryNote,
  workflowDeleteDeliveryNote,
  workflowEditDeliveryNoteLineQuantity,
  workflowOpenCreateDeliveryNoteForClient,
  workflowOpenEditDeliveryNote,
  workflowStageSingleSellOrderLine,
} from "@/tests/workflows/delivery-note";
import { workflowPickInvoiceClient } from "@/tests/workflows/invoice";
import { workflowPrintTag } from "@/tests/workflows/tag";
import { ToastType } from "@/types";
import type { BaseDeliveryNote } from "@/types/delivery-note";
import type { BaseDeliveryNoteLine } from "@/types/delivery-note-line";
import type { BaseSellOrderLine } from "@/types/sell-order-line";

let tablePendingSellOrderLines: Locator;
let tableStagedSellOrderLines: Locator;
let buttonSubmitFormDeliveryNote: Locator;

test.beforeEach(({ page }) => {
  tablePendingSellOrderLines = page.getByTestId("table-pending-sell-orders");
  tableStagedSellOrderLines = page.getByTestId("table-staged-sell-order-lines");
  buttonSubmitFormDeliveryNote = page.getByTestId("button-submit-form-delivery-note");
});

const activeClients = mockClients.filter((client) => client.deletedAt === null);
const clientsWithPendingLines = mockClients.filter(
  (client) =>
    client.deletedAt === null &&
    mockSellOrderLines.some((line) => {
      const sellOrder = getMockSellOrderById(line.sellOrderId);
      return (
        line.deletedAt === null &&
        line.pendingQuantity > 0 &&
        sellOrder?.deletedAt === null &&
        sellOrder.clientId === client.id
      );
    }),
);

for (const selectedClient of clientsWithPendingLines) {
  test(
    `create delivery notes from the pending sell order lines of ${selectedClient.name}`,
    { annotation: TestAnnotations.ResetTags },
    async ({ page, toasts }) => {
      const pendingSellOrderLine = (await getMockPendingSellOrderLines(selectedClient.id)).at(0)!;
      expect(pendingSellOrderLine).toBeDefined();
      const pendingSellOrder = getMockSellOrderById(pendingSellOrderLine.sellOrderId)!;
      expect(pendingSellOrder).toBeDefined();
      const sellOrderLineRow = getTableRowByTestId(tablePendingSellOrderLines, pendingSellOrderLine.id);

      await test.step("stage a sell order line with zero and empty quantity", async () => {
        await setUserMode(page, UserMode.User);
        await workflowOpenCreateDeliveryNoteForClient(page, selectedClient);

        await expect(sellOrderLineRow.getByTestId("pendingQuantity")).toHaveText(
          String(pendingSellOrderLine.pendingQuantity),
        );

        const stagedSellOrderLineRow = await workflowStageSingleSellOrderLine(page, pendingSellOrderLine.id);
        const inputStagedQuantity = getEditableCellById(stagedSellOrderLineRow, "quantity");

        // The quantity is validated as it is typed, without leaving the cell
        await inputStagedQuantity.clear();
        await inputStagedQuantity.pressSequentially("0");
        await expect(inputStagedQuantity).toHaveValue("0");

        await expect(buttonSubmitFormDeliveryNote).toBeVisible();
        await expect(buttonSubmitFormDeliveryNote).toBeDisabled();

        // An empty quantity blocks it too, because a Línea del Albarán always carries a quantity
        await inputStagedQuantity.clear();
        await expect(inputStagedQuantity).toHaveValue("");

        await expect(buttonSubmitFormDeliveryNote).toBeDisabled();

        // The pending quantity is untouched and no Albarán was created
        await expect(sellOrderLineRow.getByTestId("pendingQuantity")).toHaveText(
          String(pendingSellOrderLine.pendingQuantity),
        );
        expect(await getDeliveryNote({ id: mockDeliveryNotes.length + 1 })).toBeUndefined();

        // Restoring a positive quantity unblocks the submission
        await inputStagedQuantity.pressSequentially(String(pendingSellOrderLine.pendingQuantity));

        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();
      });

      await test.step("print the tags of a staged sell order line", async () => {
        await setUserMode(page, UserMode.Admin);
        const tagFilePath = path.join(process.env.TAGS_ROOT_PATH!, `sell-order-line-${pendingSellOrderLine.id}.pdf`);

        await workflowOpenCreateDeliveryNoteForClient(page, selectedClient);

        const stagedSellOrderLineRow = await workflowStageSingleSellOrderLine(page, pendingSellOrderLine.id);
        await workflowPrintTag(page, stagedSellOrderLineRow, tagFilePath);
      });

      await test.step("stage a sell order line, create a delivery note, delete the delivery note", async () => {
        const quantityToStage = Math.floor(pendingSellOrderLine.pendingQuantity / 2);

        // Ensure no delivery note exists yet with the next id
        expect(await getDeliveryNote({ id: mockDeliveryNotes.length + 1 })).toBeUndefined();

        const stagedPart = getMockPartByPartReferenceId(pendingSellOrderLine.partReferenceId);
        const existingPartStock = await getLatestPartStockTransactionByPartId(stagedPart!.id);

        await workflowOpenCreateDeliveryNoteForClient(page, selectedClient);

        await expect(sellOrderLineRow.getByTestId("pendingQuantity")).toHaveText(
          String(pendingSellOrderLine.pendingQuantity),
        );

        const stagedSellOrderLineRow = await workflowStageSingleSellOrderLine(page, pendingSellOrderLine.id);

        // Update the staged quantity
        const inputStagedQuantity = getEditableCellById(stagedSellOrderLineRow, "quantity");

        await inputStagedQuantity.clear();
        await expect(inputStagedQuantity).toBeEmpty();

        await inputStagedQuantity.pressSequentially(String(quantityToStage));
        await expect(inputStagedQuantity).toHaveValue(String(quantityToStage));

        await expect(buttonSubmitFormDeliveryNote).toBeVisible();
        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();
        await buttonSubmitFormDeliveryNote.click();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);

        // The delivered quantity is taken from the stock, which never goes below zero
        const remainingPartStock = await getLatestPartStockTransactionByPartId(stagedPart!.id);
        expect(remainingPartStock?.transaction.__typename).toBe("DeliveryNoteLine");
        expect(remainingPartStock?.finalQuantity).toBe(
          Math.max((existingPartStock?.finalQuantity ?? 0) - quantityToStage, 0),
        );

        await expect(sellOrderLineRow.getByTestId("pendingQuantity")).toHaveText(
          String(pendingSellOrderLine.pendingQuantity - quantityToStage),
        );

        await expect(getDivDisabledMessage(tableStagedSellOrderLines)).toBeVisible();

        const createdDeliveryNote = await getDeliveryNote({ id: mockDeliveryNotes.length + 1 });
        expect(createdDeliveryNote).toBeDefined();

        const createdDeliveryNoteLine = (await getDeliveryNoteLinesByDeliveryNoteId(createdDeliveryNote!.id)).at(0);
        expect(createdDeliveryNoteLine).toBeDefined();
        expect(createdDeliveryNoteLine!.quantity).toBe(quantityToStage);

        const dbSellOrder = await getSellOrders({ filters: [{ id: "id", value: pendingSellOrder.id }] });
        expect(dbSellOrder).toBeDefined();

        const dbSellOrderLine = await getSellOrderLineById(pendingSellOrderLine.id);
        expect(dbSellOrderLine).toBeDefined();
        expect(dbSellOrderLine!.pendingQuantity).toBe(pendingSellOrderLine.pendingQuantity - quantityToStage);

        await inAnotherTab(page, async (anotherPage) =>
          workflowDeleteDeliveryNote(anotherPage, createdDeliveryNote!.id),
        );

        await expect(sellOrderLineRow.getByTestId("pendingQuantity")).toHaveText(
          String(pendingSellOrderLine.pendingQuantity),
        );

        // Deleting the delivery note removes its transaction, so the stock is back to what it was
        expect(await getLatestPartStockTransactionByPartId(stagedPart!.id)).toEqual(existingPartStock);
      });

      // It consumes every pending Línea del Pedido de venta of the Cliente, so it goes last
      await test.step("create a new delivery note by staging all pending sell order lines", async () => {
        await setUserMode(page, UserMode.User);
        const pendingSellOrderLines = await getMockPendingSellOrderLines(selectedClient.id);
        const pendingSellOrderLinesIds = pendingSellOrderLines.map((line) => line.id);
        const pendingPartsIds = pendingSellOrderLines.map(
          (line) => getMockPartByPartReferenceId(line.partReferenceId)!.id,
        );
        const existingPartStocks = await getLatestPartStockTransactionsByIds(pendingPartsIds);
        const previousDeliveryNoteIds = (await getDeliveryNotes()).map((deliveryNote) => deliveryNote.id);

        await workflowOpenCreateDeliveryNoteForClient(page, selectedClient);

        const tablePendingSellOrderLinesRows = getTableRows(tablePendingSellOrderLines);
        await expect(tablePendingSellOrderLinesRows).toHaveCount(pendingSellOrderLines.length);

        // Check that the correct pending sell orders are displayed
        for (const row of await tablePendingSellOrderLinesRows.all()) {
          expect(pendingSellOrderLinesIds.includes(await getTestId(row))).toBeTruthy();
        }

        // A Línea with a reference without Cliente is delivered like any other
        const nullClientReferenceSellOrderLine = pendingSellOrderLines.find(
          (line) => getMockPartReferenceById(line.partReferenceId)?.clientId === null,
        )!;
        expect(
          nullClientReferenceSellOrderLine,
          "A pending line with a reference without client is needed",
        ).toBeDefined();
        const nullClientPartReference = getMockPartReferenceById(nullClientReferenceSellOrderLine.partReferenceId)!;
        await expect(
          getTableRowByTestId(tablePendingSellOrderLines, nullClientReferenceSellOrderLine.id).getByTestId("reference"),
        ).toHaveText(nullClientPartReference.reference);

        // Stage all pending sell order lines
        for (const sellOrderLine of pendingSellOrderLines) {
          await getTableRowByTestId(tablePendingSellOrderLines, sellOrderLine.id).getByTestId("button-success").click();
        }

        await expect(tableStagedSellOrderLines).toBeVisible();
        const stagedSellOrderLinesRows = getTableRows(tableStagedSellOrderLines);
        expect(await stagedSellOrderLinesRows.count()).toEqual(pendingSellOrderLines.length);
        for (const row of await stagedSellOrderLinesRows.all()) {
          expect(pendingSellOrderLinesIds.includes(await getTestId(row))).toBeTruthy();
        }
        await expect(
          getTableRowByTestId(tableStagedSellOrderLines, nullClientReferenceSellOrderLine.id).getByTestId(
            "part-reference",
          ),
        ).toHaveText(nullClientPartReference.reference);

        await expect(buttonSubmitFormDeliveryNote).toBeVisible();
        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();
        await buttonSubmitFormDeliveryNote.click();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);

        // The previous step used the next id of the sequence, so the created Albarán is the only new one
        const createdDeliveryNotes = (await getDeliveryNotes()).filter(
          (deliveryNote) => !previousDeliveryNoteIds.includes(deliveryNote.id),
        );
        expect(createdDeliveryNotes).toHaveLength(1);
        const [createdDeliveryNote] = createdDeliveryNotes;
        expect(createdDeliveryNote.clientId).toBe(selectedClient.id);

        const createdDeliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(createdDeliveryNote.id);
        expect(createdDeliveryNoteLines.length).toBe(pendingSellOrderLines.length);

        const stagedPartQuantities = new Map<number, number>();

        for (const createdDeliveryNoteLine of createdDeliveryNoteLines) {
          const correspondingSellOrderLine = pendingSellOrderLines.find(
            (sol) => sol.id === createdDeliveryNoteLine.sellOrderLineId,
          );
          expect(correspondingSellOrderLine).toBeDefined();
          const correspondingPartReference = getMockPartReferenceById(correspondingSellOrderLine!.partReferenceId);
          const correspondingPart = getMockPartByPartReferenceId(correspondingPartReference!.id);

          // In this step, the staged quantity is always the full pending quantity
          expect(createdDeliveryNoteLine.quantity).toBe(correspondingSellOrderLine!.pendingQuantity);
          expect(createdDeliveryNoteLine.sellOrderLineId).toBe(correspondingSellOrderLine!.id);
          expect(createdDeliveryNoteLine.partReferenceId).toBe(correspondingSellOrderLine!.partReferenceId);
          expect(createdDeliveryNoteLine.deliveryNoteId).toBe(createdDeliveryNote.id);
          expect(createdDeliveryNoteLine.description).toBe(
            correspondingPartReference?.clientDescription ?? correspondingPart?.description,
          );

          stagedPartQuantities.set(
            correspondingPartReference!.partId,
            (stagedPartQuantities.get(correspondingPartReference!.partId) ?? 0) +
              correspondingSellOrderLine!.pendingQuantity,
          );
        }
        expect(
          stagedPartQuantities.size,
          "Some Artículo should be delivered by more than one Línea, through different references",
        ).toBeLessThan(createdDeliveryNoteLines.length);

        await expect(getTableNoDataRow(tablePendingSellOrderLines)).toBeVisible();
        await expect(getDivDisabledMessage(tableStagedSellOrderLines)).toBeVisible();

        const dbPendingSellOrders = await getSellOrders({
          filters: [
            { id: "clientId", value: selectedClient.id },
            { id: "statuses", value: [SellOrderStatus.Pending] },
          ],
        });
        expect(dbPendingSellOrders.length).toBe(0);

        const finalPartStocks = await getLatestPartStockTransactionsByIds(pendingPartsIds);
        assertPartStockConsumption({ existingPartStocks, finalPartStocks, stagedPartQuantities });
      });
    },
  );
}

for (const client of clientsWithPendingLines) {
  test(
    `deliver and invoice a sell order line without part of ${client.name}`,
    { annotation: TestAnnotations.ResetTags },
    async ({ db, page, toasts }) => {
      const sellOrder = getMockSellOrderById((await getMockPendingSellOrderLines(client.id)).at(0)!.sellOrderId)!;
      const [customSellOrderLine] = await db
        .insert(dbTableSellOrderLine)
        .values({
          description: "Portes",
          partPrice: "12.5",
          pendingQuantity: 3,
          quantity: 3,
          sellOrderId: sellOrder.id,
        })
        .returning();
      const pendingSellOrderLineRow = getTableRowByTestId(tablePendingSellOrderLines, customSellOrderLine.id);
      let deliveryNoteLine: BaseDeliveryNoteLine;

      await test.step("the line is pending with its description and without reference", async () => {
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        await expect(pendingSellOrderLineRow.getByTestId("reference")).toHaveText("");
        await expect(pendingSellOrderLineRow.getByTestId("description")).toHaveText(customSellOrderLine.description!);
        await expect(pendingSellOrderLineRow.getByTestId("status")).toHaveText("Pendiente");
      });

      await test.step("print the tags of the staged line, which are named after its description", async () => {
        const stagedSellOrderLineRow = await workflowStageSingleSellOrderLine(page, customSellOrderLine.id);
        await expect(stagedSellOrderLineRow.getByTestId("part-reference")).toHaveText("");
        await expect(stagedSellOrderLineRow).toContainText(customSellOrderLine.description!);

        await workflowPrintTag(
          page,
          stagedSellOrderLineRow,
          path.join(process.env.TAGS_ROOT_PATH!, `sell-order-line-${customSellOrderLine.id}.pdf`),
        );
      });

      await test.step("create a delivery note, whose line keeps the description and has no price of its own", async () => {
        const previousDeliveryNoteIds = (await getDeliveryNotes()).map((deliveryNote) => deliveryNote.id);
        await expect(getTableRowByTestId(tableStagedSellOrderLines, customSellOrderLine.id)).toBeVisible();
        await buttonSubmitFormDeliveryNote.click();
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);

        const createdDeliveryNote = (await getDeliveryNotes()).find(
          (deliveryNote) => !previousDeliveryNoteIds.includes(deliveryNote.id),
        )!;
        const createdDeliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(createdDeliveryNote.id);
        expect(createdDeliveryNoteLines).toEqual([
          expect.objectContaining({
            description: customSellOrderLine.description,
            partReferenceId: null,
            quantity: customSellOrderLine.quantity,
            sellOrderLineId: customSellOrderLine.id,
            unitPrice: null,
          }),
        ]);
        [deliveryNoteLine] = createdDeliveryNoteLines;
        expect((await getSellOrderLineById(customSellOrderLine.id))?.pendingQuantity).toBe(0);
        await expect(pendingSellOrderLineRow).toHaveCount(0);
      });

      await test.step("edit the delivery note line, which has no part", async () => {
        const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(page, deliveryNoteLine.deliveryNoteId);
        const deliveryNoteLineRow = getTableRowByTestId(
          dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
          deliveryNoteLine.id,
        );
        await expect(deliveryNoteLineRow.getByTestId("partReference")).toHaveText("");

        await workflowEditDeliveryNoteLineQuantity(page, deliveryNoteLine.id, 2);
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);
        deliveryNoteLine = (await getDeliveryNoteLine({ id: deliveryNoteLine.id }))!;
        expect(deliveryNoteLine.quantity).toBe(2);
        // The part no longer delivered is pending again
        expect((await getSellOrderLineById(customSellOrderLine.id))?.pendingQuantity).toBe(1);
      });

      await test.step("invoice the line with the price of the sell order line, next to lines with their own price", async () => {
        // Albaranes migrated from the old database have Líneas with the price agreed on delivery, whether they belong to
        // a Pedido de venta or not
        const [pricedDeliveryNoteLine, pricedSellOrderDeliveryNoteLine] = await db
          .insert(dbTableDeliveryNoteLine)
          .values([
            {
              deliveryNoteId: deliveryNoteLine.deliveryNoteId,
              description: "Embalaje",
              quantity: 4,
              unitPrice: "3.25",
              vatPercentage: deliveryNoteLine.vatPercentage,
            },
            {
              deliveryNoteId: deliveryNoteLine.deliveryNoteId,
              description: customSellOrderLine.description!,
              quantity: 3,
              sellOrderLineId: customSellOrderLine.id,
              unitPrice: "6.4",
              vatPercentage: deliveryNoteLine.vatPercentage,
            },
          ])
          .returning();
        expect(Number(pricedSellOrderDeliveryNoteLine.unitPrice)).not.toBe(Number(customSellOrderLine.partPrice));

        await page.goto("/invoicing");
        await page.getByRole("button", { name: "Crear Factura" }).click();
        const dialogCreateInvoice = page.getByTestId("dialog-create-invoice");
        await workflowPickInvoiceClient(page, dialogCreateInvoice, client);

        const tablePendingDeliveryNotes = dialogCreateInvoice.getByTestId("table-pending-delivery-note");
        await getTableRowByTestId(tablePendingDeliveryNotes, deliveryNoteLine.deliveryNoteId)
          .getByTestId("button-expander")
          .click();
        const tablePendingDeliveryNoteLines = getTableSubrowById(
          tablePendingDeliveryNotes,
          deliveryNoteLine.deliveryNoteId,
        ).getByTestId("table-pending-delivery-note-line");
        for (const [line, unitPrice] of [
          [deliveryNoteLine, customSellOrderLine.partPrice!],
          [pricedDeliveryNoteLine, pricedDeliveryNoteLine.unitPrice!],
          [pricedSellOrderDeliveryNoteLine, pricedSellOrderDeliveryNoteLine.unitPrice!],
        ] as const) {
          const row = getTableRowByTestId(tablePendingDeliveryNoteLines, line.id);
          await expect(row.getByTestId("unitPrice")).toHaveText(formatPrice(unitPrice));
          await expect(row.getByTestId("total")).toHaveText(
            formatCents(getLineTotalInCents({ quantity: line.quantity, unitPrice })),
          );
        }
      });
    },
  );
}

{
  const client = clientsWithPendingLines[0];
  test(
    `deliver the returns of ${client.name}`,
    { annotation: TestAnnotations.NonEmptyErrorsLogFile },
    async ({ db, page, toasts }) => {
      const partSellOrderLine = (await getMockPendingSellOrderLines(client.id)).find(
        (line) => line.partReferenceId !== null,
      )!;
      expect(partSellOrderLine, "Wrong test set up: the client should have a pending line with part").toBeDefined();
      const partId = getMockPartByPartReferenceId(partSellOrderLine.partReferenceId)!.id;
      const [returnSellOrderLine, orderedSellOrderLine] = await db
        .insert(dbTableSellOrderLine)
        .values([
          {
            partPrice: "0.82",
            partReferenceId: partSellOrderLine.partReferenceId,
            pendingQuantity: -170,
            quantity: -170,
            sellOrderId: partSellOrderLine.sellOrderId,
          },
          {
            partPrice: "1.5",
            partReferenceId: partSellOrderLine.partReferenceId,
            pendingQuantity: 40,
            quantity: 100,
            sellOrderId: partSellOrderLine.sellOrderId,
          },
        ])
        .returning();
      const getPendingQuantity = async (sellOrderLineId: number) =>
        (await getSellOrderLineById(sellOrderLineId))?.pendingQuantity;
      const getStock = async () => (await getLatestPartStockTransactionByPartId(partId))?.finalQuantity ?? 0;
      const expectSingleToastOfType = async (toastType: ToastType) => {
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(toastType);
        await clearToasts(page);
      };
      const submitStagedQuantities = async (stagedQuantities: Array<[BaseSellOrderLine, number]>) => {
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        for (const [sellOrderLine, quantity] of stagedQuantities) {
          await getTableRowByTestId(tablePendingSellOrderLines, sellOrderLine.id).getByTestId("button-success").click();
          const inputStagedQuantity = getEditableCellById(
            getTableRowByTestId(tableStagedSellOrderLines, sellOrderLine.id),
            "quantity",
          );
          await inputStagedQuantity.clear();
          await inputStagedQuantity.pressSequentially(String(quantity));
          await expect(inputStagedQuantity).toHaveValue(String(quantity));
        }
        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();
        await buttonSubmitFormDeliveryNote.click();
      };
      // Creates the Albarán from the staged lines with the given quantities and returns its only line
      const createDeliveryNote = async (stagedQuantities: Array<[BaseSellOrderLine, number]>) => {
        const previousDeliveryNoteIds = (await getDeliveryNotes()).map((deliveryNote) => deliveryNote.id);
        await submitStagedQuantities(stagedQuantities);
        await expectSingleToastOfType(ToastType.Success);
        const createdDeliveryNote = (await getDeliveryNotes()).find(
          (deliveryNote) => !previousDeliveryNoteIds.includes(deliveryNote.id),
        )!;
        return getDeliveryNoteLinesByDeliveryNoteId(createdDeliveryNote.id);
      };
      const expectDeliveryNoteRejected = async (stagedQuantities: Array<[BaseSellOrderLine, number]>) => {
        const previousDeliveryNotesCount = (await getDeliveryNotes()).length;
        await submitStagedQuantities(stagedQuantities);
        await expectSingleToastOfType(ToastType.Error);
        expect(await getDeliveryNotes()).toHaveLength(previousDeliveryNotesCount);
      };

      await test.step("a return is pending to be delivered back, and its tags can not be printed", async () => {
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        const pendingRow = getTableRowByTestId(tablePendingSellOrderLines, returnSellOrderLine.id);
        await expect(pendingRow.getByTestId("pendingQuantity")).toHaveText("-170");

        const stagedRow = await workflowStageSingleSellOrderLine(page, returnSellOrderLine.id);
        await expect(getEditableCellById(stagedRow, "quantity")).toHaveValue("-170");
        await expect(stagedRow.getByTestId("button-print-tag")).toBeDisabled();
      });

      let returnDeliveryNoteLine: BaseDeliveryNoteLine;
      await test.step("delivering the return completes it and leaves the stock of the part as it was", async () => {
        const previousStock = await getStock();
        [returnDeliveryNoteLine] = await createDeliveryNote([[returnSellOrderLine, -170]]);
        expect(returnDeliveryNoteLine).toMatchObject({ quantity: -170, sellOrderLineId: returnSellOrderLine.id });
        expect(await getPendingQuantity(returnSellOrderLine.id)).toBe(0);
        await expect(getTableRowByTestId(tablePendingSellOrderLines, returnSellOrderLine.id)).toHaveCount(0);
        expect(await getStock()).toBe(previousStock);

        await page.goto(`/part/${partId}?tab=history`);
        await expect(
          page.getByTestId("table-part-delivery-note-consumptions").getByText("Devueltos 170 artículos"),
        ).toBeVisible();
      });

      await test.step("the return totals a negative amount, and a negative price turns it positive", async () => {
        const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(
          page,
          returnDeliveryNoteLine.deliveryNoteId,
        );
        const row = getTableRowByTestId(
          dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
          returnDeliveryNoteLine.id,
        );
        await expect(row.getByTestId("button-print-tag")).toBeDisabled();
        await expect(row.getByTestId("total")).toHaveText(
          formatCents(getLineTotalInCents({ quantity: -170, unitPrice: returnSellOrderLine.partPrice })),
        );

        const inputUnitPrice = getEditableCellById(row, "unitPrice");
        await inputUnitPrice.clear();
        await inputUnitPrice.pressSequentially("-0.5");
        await inputUnitPrice.blur();
        await expectSingleToastOfType(ToastType.Success);
        expect((await getDeliveryNoteLine({ id: returnDeliveryNoteLine.id }))?.unitPrice).toBe("-0.5");
        await expect(row.getByTestId("total")).toHaveText(formatCents(8500));
        await expect(dialogCreateEditDeliveryNote.getByTestId("span-delivery-note-lines-total")).toContainText(
          formatCents(8500),
        );
      });

      await test.step("deleting the delivered return makes it pending again", async () => {
        await workflowDeleteDeliveryNote(page, returnDeliveryNoteLine.deliveryNoteId);
        await clearToasts(page);
        expect(await getPendingQuantity(returnSellOrderLine.id)).toBe(-170);
      });

      await test.step("a delivery of the opposite sign can not take the pending quantity past the quantity", async () => {
        // Nothing of the return was delivered back yet, so there is nothing to give back
        await expectDeliveryNoteRejected([[returnSellOrderLine, 20]]);
        expect(await getPendingQuantity(returnSellOrderLine.id)).toBe(-170);
      });

      await test.step("a return against an ordered line gives back at most what was delivered of it", async () => {
        const previousStock = await getStock();
        const [firstReturnLine] = await createDeliveryNote([[orderedSellOrderLine, -30]]);
        expect(await getPendingQuantity(orderedSellOrderLine.id)).toBe(70);
        expect(await getStock()).toBe(previousStock);

        await expectDeliveryNoteRejected([[orderedSellOrderLine, -100]]);
        expect(await getPendingQuantity(orderedSellOrderLine.id)).toBe(70);

        const [secondReturnLine] = await createDeliveryNote([[orderedSellOrderLine, -30]]);
        expect(await getPendingQuantity(orderedSellOrderLine.id)).toBe(100);

        // Nothing was clamped, so deleting the Albarán takes away exactly what it gave back
        await workflowDeleteDeliveryNote(page, secondReturnLine.deliveryNoteId);
        await clearToasts(page);
        expect(await getPendingQuantity(orderedSellOrderLine.id)).toBe(70);

        await workflowOpenEditDeliveryNote(page, firstReturnLine.deliveryNoteId);
        const inputQuantity = await workflowEditDeliveryNoteLineQuantity(page, firstReturnLine.id, -100);
        await expectSingleToastOfType(ToastType.Error);
        await expect(inputQuantity).toHaveValue("-30");
        expect((await getDeliveryNoteLine({ id: firstReturnLine.id }))?.quantity).toBe(-30);
        expect(await getPendingQuantity(orderedSellOrderLine.id)).toBe(70);
      });

      await test.step("a staged quantity of 0 is rejected", async () => {
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        const stagedRow = await workflowStageSingleSellOrderLine(page, returnSellOrderLine.id);
        const inputStagedQuantity = getEditableCellById(stagedRow, "quantity");
        await inputStagedQuantity.clear();
        await inputStagedQuantity.pressSequentially("0");
        await expect(buttonSubmitFormDeliveryNote).toBeDisabled();
      });
    },
  );
}

for (const client of clientsWithPendingLines) {
  test(`pending sell order lines of ${client.name} are sorted by delivery date keeping the lines of the same part together`, async ({
    db,
    page,
  }) => {
    const mockPendingSellOrderLines = await getMockPendingSellOrderLines(client.id);
    expect(
      mockPendingSellOrderLines.every((line) => line.requestedDeliveryDate === null),
      "The mock pending lines of the Cliente are expected without delivery date",
    ).toBe(true);

    const samePartReferenceId = 2;
    const samePartPendingLine = mockPendingSellOrderLines.find(
      (line) =>
        line.partReferenceId !== samePartReferenceId &&
        getMockPartByPartReferenceId(line.partReferenceId)?.id ===
          getMockPartByPartReferenceId(samePartReferenceId)?.id,
    )!;
    expect(samePartPendingLine, "A pending line of the same part with another reference is needed").toBeDefined();
    const otherPartReferenceId = 10;
    const line = { pendingQuantity: 1, quantity: 1, sellOrderId: samePartPendingLine.sellOrderId };

    const [earliestLine, laterLine, noDateLine, customLine, samePartLine] = await db
      .insert(dbTableSellOrderLine)
      .values([
        { ...line, partReferenceId: otherPartReferenceId, requestedDeliveryDate: addDays(MOCK_INITIAL_DATE, 1) },
        { ...line, partReferenceId: otherPartReferenceId, requestedDeliveryDate: addDays(MOCK_INITIAL_DATE, 5) },
        { ...line, partReferenceId: otherPartReferenceId, requestedDeliveryDate: null },
        { ...line, description: "Portes", partPrice: "12.5", requestedDeliveryDate: addDays(MOCK_INITIAL_DATE, 2) },
        { ...line, partReferenceId: samePartReferenceId, requestedDeliveryDate: addDays(MOCK_INITIAL_DATE, 3) },
      ])
      .returning();

    await workflowOpenCreateDeliveryNoteForClient(page, client);
    const rows = getTableRows(tablePendingSellOrderLines);
    await expect(rows).toHaveCount(mockPendingSellOrderLines.length + 5);
    const rowIds = await Promise.all((await rows.all()).map(getTestId));

    // A line without delivery date stays with the lines of its part, and a part goes where its earliest line goes
    expect(rowIds.slice(0, 6)).toEqual([
      earliestLine.id,
      laterLine.id,
      noDateLine.id,
      customLine.id,
      samePartLine.id,
      samePartPendingLine.id,
    ]);
    expect(rowIds.slice(6)).toEqual(
      expect.arrayContaining(
        mockPendingSellOrderLines
          .filter((pendingLine) => pendingLine.id !== samePartPendingLine.id)
          .map((pendingLine) => pendingLine.id),
      ),
    );
  });
}

for (const client of clientsWithPendingLines) {
  test(`staged sell order lines of ${client.name} can be hidden from the pending sell order lines`, async ({
    page,
  }) => {
    const [stagedLine, otherLine] = await getMockPendingSellOrderLines(client.id);
    expect(otherLine, "At least two pending lines of the Cliente are needed").toBeDefined();
    const checkboxShowStagedLines = page.getByTestId("checkbox-show-staged-lines");
    const stagedLineRow = getTableRowByTestId(tablePendingSellOrderLines, stagedLine.id);
    const otherLineRow = getTableRowByTestId(tablePendingSellOrderLines, otherLine.id);

    await workflowOpenCreateDeliveryNoteForClient(page, client);
    await expect(checkboxShowStagedLines).toBeChecked();
    await workflowStageSingleSellOrderLine(page, stagedLine.id);

    await expect(stagedLineRow).toBeVisible();
    await expect(otherLineRow).toBeVisible();

    await checkboxShowStagedLines.click();
    await expect(checkboxShowStagedLines).not.toBeChecked();
    await expect(stagedLineRow).toHaveCount(0);
    await expect(otherLineRow).toBeVisible();

    await page.getByText("Mostrar líneas preparadas").click();
    await expect(checkboxShowStagedLines).toBeChecked();
    await expect(stagedLineRow).toBeVisible();

    await checkboxShowStagedLines.click();
    await expect(stagedLineRow).toHaveCount(0);
    await getTableRowByTestId(tableStagedSellOrderLines, stagedLine.id).getByTestId("button-unstage").click();
    await expect(stagedLineRow).toBeVisible();
    await expect(otherLineRow).toBeVisible();
  });
}

test("the delivery method starts as the default one of the client", async ({ page }) => {
  const comboboxDeliveryMethod = page.getByTestId("combobox-delivery-method");
  expect(
    [true, false].every((hasDefault) =>
      activeClients.some((client) => (client.defaultDeliveryMethodId !== null) === hasDefault),
    ),
    "Wrong test set up: Some Clientes should have a default Transporte and some should not",
  ).toBe(true);

  for (const client of activeClients) {
    await workflowOpenCreateDeliveryNoteForClient(page, client);
    await assertComboboxValue(
      comboboxDeliveryMethod,
      client.defaultDeliveryMethodId === null ? null : String(client.defaultDeliveryMethodId),
    );
  }
});

for (const client of clientsWithPendingLines) {
  test(`print the pending sell orders of ${client.name}`, async ({ db, page }) => {
    const mockPendingSellOrderLines = await getMockPendingSellOrderLines(client.id);
    expect(mockPendingSellOrderLines.length, "The Cliente is expected with pending lines").toBeGreaterThan(0);

    const buttonPrint = page.getByTestId("button-print-pending-sell-orders");
    const dialogCheckboxes = page.getByTestId("dialog-pending-sell-orders-checkboxes-content");
    const dialogPrint = page.getByTestId("dialog-print-pending-sell-orders-content");

    await test.step("a user opens the preview without being asked for the extra columns", async () => {
      await setUserMode(page, UserMode.User);
      await page.goto("/create-delivery-note");
      await expect(buttonPrint).toBeDisabled();

      await workflowOpenCreateDeliveryNoteForClient(page, client);
      await expect(buttonPrint).toBeEnabled();
      await buttonPrint.click();

      await expect(dialogPrint).toBeVisible();
      await expect(dialogCheckboxes).not.toBeVisible();
      await dialogPrint.getByRole("button", { name: "Cerrar" }).click();
      await expect(dialogPrint).not.toBeVisible();
    });

    await test.step("an admin is asked for the extra columns before the preview", async () => {
      await setUserMode(page, UserMode.Admin);
      await workflowOpenCreateDeliveryNoteForClient(page, client);
      await buttonPrint.click();

      await expect(dialogCheckboxes).toBeVisible();
      await expect(dialogPrint).not.toBeVisible();
      await dialogCheckboxes.getByTestId("button-print-pending-sell-orders-without-checkboxes").click();

      await expect(dialogCheckboxes).not.toBeVisible();
      await expect(dialogPrint).toBeVisible();
      await dialogPrint.getByRole("button", { name: "Cerrar" }).click();
      await expect(dialogPrint).not.toBeVisible();
    });

    await test.step("the button is disabled once the client has no pending lines", async () => {
      await db
        .update(dbTableSellOrderLine)
        .set({ pendingQuantity: 0 })
        .where(
          inArray(
            dbTableSellOrderLine.id,
            mockPendingSellOrderLines.map((line) => line.id),
          ),
        );

      await expect(getTableNoDataRow(tablePendingSellOrderLines)).toBeVisible();
      await expect(buttonPrint).toBeDisabled();
    });
  });
}

for (const client of activeClients) {
  test(
    `the pending sell orders file is generated for ${client.name}`,
    { annotation: TestAnnotations.NonEmptyErrorsLogFile },
    async ({ page }) => {
      for (const withCheckboxes of [true, false]) {
        const response = await page.request.get(
          `/api/files/pending-sell-orders/${client.id}?withCheckboxes=${withCheckboxes}`,
        );
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("application/pdf");
        expect(decodeURIComponent(response.headers()["content-disposition"].split("''")[1])).toBe(
          `Pedidos Pendientes ${client.name} ${formatDate(new Date())!.replaceAll("/", "-")}.pdf`,
        );
        expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
      }

      expect((await page.request.get("/api/files/pending-sell-orders/invalid")).status()).toBe(400);
      const missingClientId = Math.max(...mockClients.map((mockClient) => mockClient.id)) + 1;
      expect((await page.request.get(`/api/files/pending-sell-orders/${missingClientId}`)).status()).toBe(404);
    },
  );
}

for (const client of clientsWithPendingLines) {
  test(
    `add the staged lines of ${client.name} to an existing delivery note`,
    { annotation: TestAnnotations.NonEmptyErrorsLogFile },
    async ({ db, page, toasts }) => {
      const partLine = (await getMockPendingSellOrderLines(client.id)).find((line) => line.partReferenceId !== null)!;
      expect(partLine, "A pending line of the Cliente with part is needed").toBeDefined();
      const sellOrder = getMockSellOrderById(partLine.sellOrderId)!;
      const [notInvoicedLine, notAccountedLine, accountedLine] = await db
        .insert(dbTableSellOrderLine)
        .values(
          ["Portes", "Embalaje", "Montaje"].map((description) => ({
            description,
            partPrice: "10",
            pendingQuantity: 2,
            quantity: 2,
            sellOrderId: sellOrder.id,
          })),
        )
        .returning();

      const isInvoiceAccounted = (deliveryNote: BaseDeliveryNote) =>
        mockInvoices.find((invoice) => invoice.id === deliveryNote.invoiceId)?.accounted === true;
      const clientDeliveryNotes = mockDeliveryNotes
        .filter((deliveryNote) => deliveryNote.clientId === client.id)
        .sort((a, b) => b.id - a.id);
      const notInvoicedDeliveryNote = clientDeliveryNotes.find((deliveryNote) => deliveryNote.invoiceId === null)!;
      const notAccountedDeliveryNote = clientDeliveryNotes.find(
        (deliveryNote) => deliveryNote.invoiceId !== null && !isInvoiceAccounted(deliveryNote),
      )!;
      const accountedDeliveryNote = clientDeliveryNotes.find(isInvoiceAccounted)!;
      expect(
        [notInvoicedDeliveryNote, notAccountedDeliveryNote, accountedDeliveryNote].every(Boolean),
        "The Cliente needs an Albarán without Factura, one of a Factura not accounted and one of an accounted Factura",
      ).toBe(true);
      const otherClientDeliveryNote = mockDeliveryNotes.find((deliveryNote) => deliveryNote.clientId !== client.id)!;

      const dialog = page.getByTestId("dialog-add-lines-to-existing-delivery-note-content");
      const comboboxDeliveryNote = dialog.getByTestId("combobox-delivery-note");
      const buttonSubmit = dialog.getByTestId("button-submit-add-lines-to-existing-delivery-note");

      const buttonAddLinesToExistingDeliveryNote = page.getByTestId("button-add-lines-to-existing-delivery-note");

      async function stageSellOrderLines(sellOrderLines: Array<BaseSellOrderLine>) {
        for (const sellOrderLine of sellOrderLines) {
          await getTableRowByTestId(tablePendingSellOrderLines, sellOrderLine.id).getByTestId("button-success").click();
        }
        await assertTableRowCount(tableStagedSellOrderLines, sellOrderLines.length);
      }

      async function appendStagedLines(
        sellOrderLines: Array<BaseSellOrderLine>,
        deliveryNoteId: number,
        selectableDeliveryNotes: Array<BaseDeliveryNote>,
      ) {
        const previousLinesCount = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId)).length;
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        await stageSellOrderLines(sellOrderLines);

        await buttonAddLinesToExistingDeliveryNote.click();
        await expect(dialog).toBeVisible();
        await expect(buttonSubmit).toBeDisabled();

        await openCombobox(comboboxDeliveryNote);
        await expect(page.getByTestId("combobox-list").getByRole("option")).toHaveText(
          selectableDeliveryNotes.map((deliveryNote) => new RegExp(`^Albarán ${deliveryNote.id} `)),
        );
        await clickInComboboxOption(page, `Albarán ${deliveryNoteId} `);
        await assertComboboxValue(comboboxDeliveryNote, String(deliveryNoteId));

        await buttonSubmit.click();
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);

        await expect(dialog).not.toBeVisible();
        await expect(getDivDisabledMessage(tableStagedSellOrderLines)).toBeVisible();

        const deliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(deliveryNoteId);
        expect(deliveryNoteLines).toHaveLength(previousLinesCount + sellOrderLines.length);
        for (const sellOrderLine of sellOrderLines) {
          await expect(getTableRowByTestId(tablePendingSellOrderLines, sellOrderLine.id)).toHaveCount(0);
          const partReference = getMockPartReferenceById(sellOrderLine.partReferenceId);
          expect(deliveryNoteLines).toContainEqual(
            expect.objectContaining({
              description:
                partReference === undefined
                  ? sellOrderLine.description
                  : (partReference.clientDescription ?? getMockPartByPartReferenceId(partReference.id)!.description),
              partReferenceId: sellOrderLine.partReferenceId,
              quantity: sellOrderLine.pendingQuantity,
              sellOrderLineId: sellOrderLine.id,
            }),
          );
          expect((await getSellOrderLineById(sellOrderLine.id))?.pendingQuantity).toBe(0);
        }
      }

      await test.step("cancelling the dialog leaves the delivery note to create untouched", async () => {
        await setUserMode(page, UserMode.User);
        await workflowOpenCreateDeliveryNoteForClient(page, client);
        await stageSellOrderLines([notInvoicedLine]);

        await buttonAddLinesToExistingDeliveryNote.click();
        await openCombobox(comboboxDeliveryNote);
        await clickInComboboxOption(page, `Albarán ${notInvoicedDeliveryNote.id} `);
        await expect(buttonSubmit).toBeEnabled();
        // Clearing the selection invalidates the form while adding to an existing Albarán, not while creating one
        await getClearComboboxButton(comboboxDeliveryNote).click();
        await expect(buttonSubmit).toBeDisabled();
        await openCombobox(comboboxDeliveryNote);
        await clickInComboboxOption(page, `Albarán ${notInvoicedDeliveryNote.id} `);
        await dialog.getByTestId("button-close").click();
        await expect(dialog).not.toBeVisible();
        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();

        // The previous selection is not kept, so it cannot be submitted without being seen
        await buttonAddLinesToExistingDeliveryNote.click();
        await assertComboboxValue(comboboxDeliveryNote, null);
        await expect(buttonSubmit).toBeDisabled();
        await dialog.getByTestId("button-close").click();
        await expect(buttonSubmitFormDeliveryNote).toBeEnabled();

        expect(await getDeliveryNoteLinesByDeliveryNoteId(notInvoicedDeliveryNote.id)).not.toContainEqual(
          expect.objectContaining({ sellOrderLineId: notInvoicedLine.id }),
        );
      });

      await test.step("a user adds several lines, with and without part, to a delivery note without invoice", async () => {
        const partId = getMockPartByPartReferenceId(partLine.partReferenceId)!.id;
        const existingPartStocks = await getLatestPartStockTransactionsByIds([partId]);

        await appendStagedLines(
          [partLine, notInvoicedLine],
          notInvoicedDeliveryNote.id,
          clientDeliveryNotes.filter((deliveryNote) => !isInvoiceAccounted(deliveryNote)),
        );

        assertPartStockConsumption({
          existingPartStocks,
          finalPartStocks: await getLatestPartStockTransactionsByIds([partId]),
          stagedPartQuantities: new Map([[partId, partLine.pendingQuantity]]),
        });
      });

      await test.step("a user adds lines to a delivery note of a sent invoice, which has to be sent again", async () => {
        const invoiceId = notAccountedDeliveryNote.invoiceId!;
        await db.update(dbTableInvoice).set({ sent: true }).where(eq(dbTableInvoice.id, invoiceId));

        await appendStagedLines(
          [notAccountedLine],
          notAccountedDeliveryNote.id,
          clientDeliveryNotes.filter((deliveryNote) => !isInvoiceAccounted(deliveryNote)),
        );
        expect(await getInvoiceById(invoiceId)).toMatchObject({ accounted: false, sent: false });
      });

      await test.step("lines cannot be added to an accounted invoice by a user, to another client or to nothing", async () => {
        const accountedLinesCount = (await getDeliveryNoteLinesByDeliveryNoteId(accountedDeliveryNote.id)).length;
        const appendWhile = async (
          deliveryNoteId: number,
          expectedErrorMessage: string,
          meanwhile: () => Promise<void>,
        ) => {
          await workflowOpenCreateDeliveryNoteForClient(page, client);
          await stageSellOrderLines([accountedLine]);
          await holdRequestWhile({
            page,
            procedurePath: "deliveryNote.appendLines",
            send: async () => workflowAppendStagedLinesToDeliveryNote(page, deliveryNoteId, expectedErrorMessage),
            meanwhile,
          });
        };
        const setDeliveryNoteClient = async (clientId: number) => {
          await db
            .update(dbTableDeliveryNote)
            .set({ clientId })
            .where(eq(dbTableDeliveryNote.id, notInvoicedDeliveryNote.id));
        };

        // Only the Administrador is offered the delivery notes of accounted invoices
        await setUserMode(page, UserMode.Admin);
        await appendWhile(accountedDeliveryNote.id, "pertenece a una Factura contabilizada", async () =>
          setUserMode(page, UserMode.User),
        );

        await appendWhile(notInvoicedDeliveryNote.id, "no es del Cliente del Albarán", async () =>
          setDeliveryNoteClient(otherClientDeliveryNote.clientId),
        );
        await setDeliveryNoteClient(client.id);

        const [newDeliveryNote] = await db
          .insert(dbTableDeliveryNote)
          .values({ clientId: client.id, createdAt: new Date() })
          .returning();
        await appendWhile(newDeliveryNote.id, `Albarán con ID ${newDeliveryNote.id} no encontrado`, async () => {
          await db.delete(dbTableDeliveryNote).where(eq(dbTableDeliveryNote.id, newDeliveryNote.id));
        });

        expect(await getDeliveryNoteLinesByDeliveryNoteId(accountedDeliveryNote.id)).toHaveLength(accountedLinesCount);
        expect((await getSellOrderLineById(accountedLine.id))?.pendingQuantity).toBe(accountedLine.pendingQuantity);
        expect(await getInvoiceById(accountedDeliveryNote.invoiceId!)).toMatchObject({ accounted: true, sent: true });
      });

      await test.step("an admin adds lines to an accounted invoice, which has to be accounted and sent again", async () => {
        await setUserMode(page, UserMode.Admin);
        await appendStagedLines([accountedLine], accountedDeliveryNote.id, clientDeliveryNotes);
        expect(await getInvoiceById(accountedDeliveryNote.invoiceId!)).toMatchObject({ accounted: false, sent: false });
      });
    },
  );
}
