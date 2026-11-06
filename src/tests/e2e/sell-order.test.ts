import fs from "node:fs";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import { getMachineById } from "@/db/functions/machine";
import { getMachineProductionOrderQueue } from "@/db/functions/machine-production-order-queue";
import { getPartPricesByPartId } from "@/db/functions/part-price";
import { dbGetProductionOrderStatus, getProductionOrderById } from "@/db/functions/production-order";
import { getSellOrderById, getSellOrders } from "@/db/functions/sell-order";
import { getSellOrderLineById, getSellOrderLinesBySellOrderId } from "@/db/functions/sell-order-line";
import {
  SELL_ORDER_LINE_ITEM_CONSTRAINT,
  SELL_ORDER_REFERENCE_CONSTRAINT,
  dbTableClient,
  dbTableSellOrder,
  dbTableSellOrderLine,
} from "@/db/schema";
import { findFolderById } from "@/files/functions";
import { getSellOrderPath, getSellOrderRootPath } from "@/files/sell-order";
import { isSameAppDay } from "@/lib/dates";
import { formatPrice } from "@/lib/formatters";
import {
  STATUS_COMPLETED_LABEL,
  STATUS_DELETED_LABEL,
  STATUS_PENDING_LABEL,
  CLIENT_LABEL,
  DESCRIPTION_LABEL,
  DROP_FILE_PLACEHOLDER,
  FILE_LABEL,
  NOTES_LABEL,
  PART_LABEL,
  PAYMENT_METHOD_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
} from "@/messages/common";
import {
  SELL_ORDER_LINE_DELETED_MESSAGE,
  SELL_ORDER_LINE_ORDER_DELETED_LABEL,
  CLIENT_REFERENCE_LABEL,
  RECEPTION_DATE_LABEL,
} from "@/messages/sell-order";
import { ProductionOrderStatus } from "@/schemas/production-order";
import type { TTableSellOrderState } from "@/schemas/sell-order";
import { createSellOrderLineSchema, updateSellOrderLineSchema } from "@/schemas/sell-order-line";
import type { TCreateSellOrderLine, TSellOrderLine } from "@/schemas/sell-order-line";
import {
  MOCK_DATA_PATH,
  MOCK_INITIAL_DATE,
  mockClients,
  mockMachineProductionOrderQueues,
  mockMachines,
  mockPartPrices,
  mockParts,
  mockPaymentMethods,
  mockProductionOrders,
  mockSellOrderLines,
  mockSellOrders,
} from "@/tests/mock-data";
import { getTestId } from "@/tests/utils/components";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  assertComboboxValue,
  clickInComboboxOption,
  fillComboboxFilter,
  getClearComboboxButton,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { setInputFiles } from "@/tests/utils/components/file-input";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertPickerPartKeepsNullClientParts,
  clearPicker,
  getPickerDialogContent,
  getPickerText,
  getPickerValue,
  openPartPicker,
  openPicker,
} from "@/tests/utils/components/picker";
import { getPopoverContent } from "@/tests/utils/components/popover";
import {
  assertTableRowCount,
  getDivDisabledMessage,
  getEditableCellById,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
  getTableSkeletonRows,
  getTableSubrowById,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectCheckViolation, expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  getMockClientById,
  getMockClientParts,
  getMockPartReferenceById,
  getMockPartReferences,
  getMockSellOrderLineById,
  getMockSellOrderLines,
  getMockSellOrdersOfPart,
} from "@/tests/utils/mock-data-utils";
import {
  getSellOrderFilePath,
  workflowDeleteSellOrder,
  workflowDeleteSellOrderFile,
  workflowDeleteSellOrderLine,
  workflowDownloadSellOrderFile,
  workflowOpenCreateSellOrderLine,
  workflowOpenSellOrder,
  workflowOpenSellOrderFile,
  workflowSubmitSellOrder,
  workflowUploadSellOrderFile,
} from "@/tests/workflows/sell-order";
import { ToastType } from "@/types";
import type { BaseSellOrder } from "@/types/sell-order";

test(
  "manage the sell orders",
  { annotation: [TestAnnotations.ResetSellOrders, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, db, toasts }) => {
    await test.step("create a new sell order", async () => {
      const newSellOrderClient = mockClients[0];
      const newSellOrder: Omit<BaseSellOrder, "fileUploadedAt"> = {
        clientId: newSellOrderClient.id,
        clientReference: "TestSellOrderClientReference/25",
        deletedAt: null,
        id: mockSellOrders.length + 1,
        notes: "Sell order notes... important things for your interest",
        paymentMethodId: newSellOrderClient.defaultPaymentMethodId,
        receptionDate: MOCK_INITIAL_DATE,
      };
      const newSellOrderFilePath = path.join(MOCK_DATA_PATH, "sample.pdf");

      await page.goto("/create-sell-order");
      const existingDbSellOrder = await getSellOrderById(newSellOrder.id);
      expect(existingDbSellOrder).toBeUndefined();

      const comboboxClient = getFormInputByLabel(page, CLIENT_LABEL, InputElementType.Combobox);
      await expect(comboboxClient).toBeVisible();
      await assertComboboxValue(comboboxClient, null);
      await openCombobox(comboboxClient);
      await fillComboboxFilter(page, newSellOrderClient.name.substring(0, 4));
      await clickInComboboxOption(page, newSellOrderClient.name);
      await assertComboboxValue(comboboxClient, String(newSellOrderClient.id));

      const comboboxPaymentMethod = getFormInputByLabel(page, PAYMENT_METHOD_LABEL, InputElementType.Combobox);
      await expect(comboboxPaymentMethod).toBeVisible();
      await assertComboboxValue(
        comboboxPaymentMethod,
        newSellOrderClient.defaultPaymentMethodId !== null ? String(newSellOrderClient.defaultPaymentMethodId) : null,
      );

      const inputSellOrderFile = getFormInputByLabel(page, FILE_LABEL, InputElementType.File);
      await expect(inputSellOrderFile).toBeVisible();
      await setInputFiles(page, inputSellOrderFile, newSellOrderFilePath);

      if (newSellOrder.clientReference !== null) {
        const inputClientReference = getFormInputByLabel(page, CLIENT_REFERENCE_LABEL);
        await expect(inputClientReference).toBeVisible();
        await inputClientReference.fill(newSellOrder.clientReference);
      }

      const inputNotes = getFormInputByLabel(page, NOTES_LABEL, InputElementType.Textarea);
      await expect(inputNotes).toBeVisible();
      await inputNotes.fill(newSellOrder.notes!);

      const buttonSubmit = page.getByTestId("button-submit-form-sell-order");
      await expect(buttonSubmit).toBeEnabled();

      // Holding the request keeps the form saving long enough to check that the Cliente can not change meanwhile
      let releaseCreateSellOrder!: () => void;
      const createSellOrderReleased = new Promise<void>((resolve) => {
        releaseCreateSellOrder = resolve;
      });
      await page.route(
        "**/api/trpc/sellOrder.create*",
        async (route) => {
          await createSellOrderReleased;
          await route.continue();
        },
        { times: 1 },
      );
      await buttonSubmit.click();
      await expect(comboboxClient.getByTestId("button-trigger")).toBeDisabled();
      releaseCreateSellOrder();

      await expect(page).toHaveURL(`/sell-order/${newSellOrder.id}`);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);

      const dbSellOrder = await getSellOrderById(newSellOrder.id);
      expect(dbSellOrder).toBeDefined();

      const { receptionDate: dbReceptionDate, ...dbSellOrderWithoutReceptionDate } = dbSellOrder!;
      const { receptionDate: newSellOrderReceptionDate, ...newSellOrderWithoutReceptionDate } = newSellOrder;
      expect(isSameAppDay(dbReceptionDate, newSellOrderReceptionDate)).toBeTruthy();
      expect(dbSellOrderWithoutReceptionDate).toMatchObject(newSellOrderWithoutReceptionDate);
      expect(dbSellOrder!.fileUploadedAt).not.toBeNull();

      expect(
        await getSellOrderPath({
          checkIfFileExists: true,
          clientId: newSellOrder.clientId,
          sellOrderId: newSellOrder.id,
        }),
      ).toBeTruthy();
    });

    await test.step("clear the optional fields of a sell order", async () => {
      const sellOrder = (await getSellOrderById(mockSellOrders.length + 1))!;
      expect(sellOrder.clientReference).not.toBeNull();
      expect(sellOrder.notes).not.toBeNull();
      expect(sellOrder.paymentMethodId).toBeNull();
      const paymentMethod = mockPaymentMethods[0];

      await page.goto(`/sell-order/${sellOrder.id}`);
      const formSellOrder = page.getByTestId("form-sell-order");
      await assertFormLoaded(formSellOrder);
      const buttonSubmit = formSellOrder.getByTestId("button-submit-form-sell-order");
      const comboboxPaymentMethod = getFormInputByLabel(formSellOrder, PAYMENT_METHOD_LABEL, InputElementType.Combobox);

      await getFormInputByLabel(formSellOrder, CLIENT_REFERENCE_LABEL).clear();
      await getFormInputByLabel(formSellOrder, NOTES_LABEL, InputElementType.Textarea).clear();
      await selectComboboxOption(page, comboboxPaymentMethod, paymentMethod.name, String(paymentMethod.id));
      await buttonSubmit.click();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect(await getSellOrderById(sellOrder.id)).toMatchObject({
        clientReference: null,
        notes: null,
        paymentMethodId: paymentMethod.id,
        receptionDate: sellOrder.receptionDate,
      });

      await getClearComboboxButton(comboboxPaymentMethod).click();
      await assertComboboxValue(comboboxPaymentMethod, null);
      await buttonSubmit.click();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await getSellOrderById(sellOrder.id))?.paymentMethodId).toBeNull();
    });

    await test.step("add sell order lines", async () => {
      const sellOrder = mockSellOrders[0];
      const existingSellOrderLines = getMockSellOrderLines(sellOrder.id);

      const sellOrderClient = getMockClientById(sellOrder.clientId);
      expect(sellOrderClient).toBeDefined();
      const clientParts = getMockClientParts({ clientId: sellOrder.clientId, includePartReferenceNullClientId: true });
      const clientPartReferences = getMockPartReferences({
        clientId: sellOrder.clientId,
        includeNullClientId: true,
      });
      const existingSellOrderLinesPartReferencesIds = existingSellOrderLines.map((line) => line.partReferenceId);
      const pickedPartReference = clientPartReferences.find(
        (ref) => !ref.deletedAt && !existingSellOrderLinesPartReferencesIds.includes(ref.id),
      );
      expect(pickedPartReference).toBeDefined();
      if (!pickedPartReference) {
        return;
      }

      const partToBeAdded = clientParts.find((part) => part.id === pickedPartReference.partId);
      expect(partToBeAdded).toBeDefined();
      if (!partToBeAdded) {
        return;
      }

      const pickedPartPrice = mockPartPrices.find((price) => price.partId === partToBeAdded.id)!;
      expect(pickedPartPrice).toBeDefined();

      const newSellOrderLine: TCreateSellOrderLine & { id: number } = {
        description: null,
        id: Math.max(...mockSellOrderLines.map((line) => line.id)) + 1,
        notes: "Entregar con certificado de material",
        partPrice: pickedPartPrice.price,
        partReferenceId: pickedPartReference.id,
        quantity: 50,
        requestedDeliveryDate: null,
        sellOrderId: sellOrder.id,
      };

      const dialogCreateSellOrderLine = await workflowOpenCreateSellOrderLine(page, sellOrder.id);

      const tablePartPrices = dialogCreateSellOrderLine.getByTestId("radio-table-part-prices");
      await expect(tablePartPrices).toBeVisible();
      await expect(getDivDisabledMessage(tablePartPrices)).toBeVisible();

      const pickerPart = dialogCreateSellOrderLine.getByTestId("picker-part");
      await expect(pickerPart).toBeVisible();
      expect(await getPickerValue(pickerPart)).toBeNull();

      const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);

      expect(await getTableRows(tablePickerPart).count()).toBe(clientParts.length);

      // Assert that the part picker is displaying the client parts
      const partRowIds = await Promise.all(
        (await getTableRows(tablePickerPart).all()).map(async (row) => getTestId(row)),
      );
      expect(partRowIds.sort((a, b) => a - b)).toEqual(clientParts.map((part) => part.id).sort((a, b) => a - b));

      await assertPickerPartKeepsNullClientParts(tablePickerPart, sellOrder.clientId);

      const pickedReferenceRow = getTableRowByTestId(tablePickerPart, partToBeAdded.id);
      await expect(pickedReferenceRow).toBeVisible();
      // Find the matched subrow that contains the pickedPartReference.reference text
      await pickedReferenceRow
        .locator('[data-testid="div-part-reference-row"]', {
          has: page.getByText(pickedPartReference.reference),
        })
        .getByTestId("button-success")
        .click();

      await expect(dialogPickerPartContent).not.toBeVisible();
      await expect(getDivDisabledMessage(tablePartPrices)).not.toBeVisible();

      expect(await getPickerValue(pickerPart)).toBe(String(partToBeAdded.id));
      expect(await getPickerText(pickerPart)).toEqual(pickedPartReference.reference);

      const inputQuantity = getFormInputByLabel(dialogCreateSellOrderLine, QUANTITY_LABEL, InputElementType.Number);
      await expect(inputQuantity).toBeVisible();

      await inputQuantity.pressSequentially(String(newSellOrderLine.quantity));
      await inputQuantity.press("Enter");

      const inputPartPrice = getFormInputByLabel(dialogCreateSellOrderLine, PRICE_LABEL, InputElementType.Number);
      await expect(inputPartPrice).toBeVisible();

      await inputPartPrice.pressSequentially(newSellOrderLine.partPrice!);

      await getFormInputByLabel(dialogCreateSellOrderLine, NOTES_LABEL, InputElementType.Textarea).fill(
        newSellOrderLine.notes!,
      );

      const buttonSubmit = dialogCreateSellOrderLine.getByTestId("button-submit");
      await expect(buttonSubmit).toBeEnabled();
      await buttonSubmit.click();

      await expect(dialogCreateSellOrderLine).not.toBeVisible();

      const dbSellOrder = await getSellOrderById(sellOrder.id);
      expect(dbSellOrder).not.toBeNull();
      const dbSellOrderLines = await getSellOrderLinesBySellOrderId(dbSellOrder!.id);

      const sellOrderLines = getMockSellOrderLines(sellOrder.id);
      expect(dbSellOrderLines.length).toBe(sellOrderLines.length + 1);

      const newDbSellOrderLine = dbSellOrderLines.find((line) => line.id === newSellOrderLine.id);
      expect(newDbSellOrderLine).toBeDefined();
      expect(newDbSellOrderLine).toMatchObject({
        ...newSellOrderLine,
        sellOrderId: dbSellOrder!.id,
      });

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    });

    await test.step("add a sell order line with a reference without client", async () => {
      const sellOrder = mockSellOrders[0];
      const existingDbSellOrderLines = await getSellOrderLinesBySellOrderId(sellOrder.id);
      const usedPartReferenceIds = existingDbSellOrderLines.map((line) => line.partReferenceId);
      const nullClientPartReference = getMockPartReferences({ includeNullClientId: true }).find(
        (partReference) => !usedPartReferenceIds.includes(partReference.id),
      )!;
      expect(nullClientPartReference, "An unused reference without client is needed").toBeDefined();
      const clientParts = getMockClientParts({ clientId: sellOrder.clientId, includePartReferenceNullClientId: true });
      const otherClientPartReference = getMockPartReferences({}).find(
        (partReference) =>
          partReference.clientId !== null &&
          partReference.clientId !== sellOrder.clientId &&
          clientParts.some((part) => part.id === partReference.partId),
      )!;
      expect(otherClientPartReference, "A visible reference of another client is needed").toBeDefined();
      const quantity = 7;
      const partPrice = "4.5";

      const dialogCreateSellOrderLine = await workflowOpenCreateSellOrderLine(page, sellOrder.id);
      const formSellOrder = page.getByTestId("form-sell-order");
      const tablePartPrices = dialogCreateSellOrderLine.getByTestId("radio-table-part-prices");
      await expect(getDivDisabledMessage(tablePartPrices)).toBeVisible();

      const pickerPart = dialogCreateSellOrderLine.getByTestId("picker-part");
      const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
      // The Cliente is fixed by the Pedido de venta, so the picker has no part filters to change
      await expect(tablePickerPart.getByTestId("popover-part-filters")).toHaveCount(0);

      // Only the references of the Cliente and the ones without Cliente can be picked
      const getReferenceRow = (partReference: { partId: number; reference: string }) =>
        getTableRowByTestId(tablePickerPart, partReference.partId).getByTestId("div-part-reference-row").filter({
          hasText: partReference.reference,
        });
      await expect(getReferenceRow(otherClientPartReference)).toBeVisible();
      await expect(getReferenceRow(otherClientPartReference).getByTestId("button-success")).toHaveCount(0);
      await getReferenceRow(nullClientPartReference).getByTestId("button-success").click();

      await expect(dialogPickerPartContent).not.toBeVisible();
      expect(await getPickerValue(pickerPart)).toBe(String(nullClientPartReference.partId));
      expect(await getPickerText(pickerPart)).toEqual(nullClientPartReference.reference);
      await expect(getDivDisabledMessage(tablePartPrices)).not.toBeVisible();

      const inputQuantity = getFormInputByLabel(dialogCreateSellOrderLine, QUANTITY_LABEL, InputElementType.Number);
      await inputQuantity.pressSequentially(String(quantity));
      await inputQuantity.press("Enter");
      await getFormInputByLabel(dialogCreateSellOrderLine, PRICE_LABEL, InputElementType.Number).pressSequentially(
        partPrice,
      );
      await dialogCreateSellOrderLine.getByTestId("button-submit").click();
      await expect(dialogCreateSellOrderLine).not.toBeVisible();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);

      const dbSellOrderLines = await getSellOrderLinesBySellOrderId(sellOrder.id);
      expect(dbSellOrderLines).toHaveLength(existingDbSellOrderLines.length + 1);
      const newDbSellOrderLine = dbSellOrderLines.find(
        (line) => !existingDbSellOrderLines.some((existingLine) => existingLine.id === line.id),
      )!;
      expect(newDbSellOrderLine).toMatchObject({
        partPrice,
        partReferenceId: nullClientPartReference.id,
        pendingQuantity: quantity,
        quantity,
      });

      const rowSellOrderLine = getTableRowByTestId(
        formSellOrder.getByTestId("table-sell-order-line"),
        newDbSellOrderLine.id,
      );
      await expect(rowSellOrderLine.getByTestId("part")).toContainText(nullClientPartReference.reference);
      await expect(rowSellOrderLine.getByTestId("description")).toHaveText(
        mockParts.find((part) => part.id === nullClientPartReference.partId)!.description,
      );
    });

    await test.step("delete a sell order", async () => {
      const sellOrder = mockSellOrders[0];
      // An Orden de producción of the Pedido de venta that is queued in a Máquina
      const queuedProductionOrder = mockMachineProductionOrderQueues.find(
        (queue) =>
          getMockSellOrderLineById(
            mockProductionOrders.find((productionOrder) => productionOrder.id === queue.productionOrderId)
              ?.sellOrderLineId ?? 0,
          )?.sellOrderId === sellOrder.id,
      )!;
      expect(queuedProductionOrder).toBeDefined();

      await workflowDeleteSellOrder(page, sellOrder.id);

      // Its Órdenes de producción are deleted along with it, so they are taken off the Máquinas
      expect((await getMachineProductionOrderQueue(queuedProductionOrder.machineId)).map((po) => po.id)).not.toContain(
        queuedProductionOrder.productionOrderId,
      );
      expect(
        await dbGetProductionOrderStatus((await getProductionOrderById(queuedProductionOrder.productionOrderId))!),
      ).toBe(ProductionOrderStatus.SellOrderDeleted);

      await page.goto(`/sell-order/${sellOrder.id}`);

      // Expect every form field to be disabled
      const formSellOrder = page.getByTestId("form-sell-order");
      await expect(formSellOrder).toBeVisible();
      await assertFormLoaded(formSellOrder);

      const inputReceptionDate = getFormInputByLabel(formSellOrder, RECEPTION_DATE_LABEL, InputElementType.Date);
      await expect(inputReceptionDate.getByTestId("popover-trigger")).toBeDisabled();

      const comboboxClient = getFormInputByLabel(formSellOrder, CLIENT_LABEL, InputElementType.Combobox);
      await expect(comboboxClient.getByTestId("button-trigger")).toBeDisabled();

      const inputClientReference = getFormInputByLabel(formSellOrder, CLIENT_REFERENCE_LABEL, InputElementType.Input);
      await expect(inputClientReference).toHaveAttribute("readonly");

      const comboboxPaymentMethod = getFormInputByLabel(formSellOrder, PAYMENT_METHOD_LABEL, InputElementType.Combobox);
      await expect(comboboxPaymentMethod.getByTestId("button-trigger")).toBeDisabled();

      const inputNotes = getFormInputByLabel(formSellOrder, NOTES_LABEL, InputElementType.Textarea);
      await expect(inputNotes).toHaveAttribute("readonly");

      const tableSellOrderLine = formSellOrder.getByTestId("table-sell-order-line");
      // From the database, so the Líneas added by the previous steps are checked too
      const dbSellOrderLines = (await getSellOrderLinesBySellOrderId(sellOrder.id)).filter(
        (line) => line.deletedAt === null,
      );
      expect(dbSellOrderLines.length).toBeGreaterThan(getMockSellOrderLines(sellOrder.id).length);
      for (const sellOrderLine of dbSellOrderLines) {
        await expect(getTableRowByTestId(tableSellOrderLine, sellOrderLine.id).getByTestId("status")).toHaveText(
          SELL_ORDER_LINE_ORDER_DELETED_LABEL,
        );
      }

      // Its Órdenes de producción show why they are deleted, and they can still be deleted on their own
      const productionOrderState = {
        filters: [
          { id: "statuses", value: [ProductionOrderStatus.Deleted, ProductionOrderStatus.SellOrderDeleted] },
          { id: "sellOrderId", value: sellOrder.id },
        ],
      };
      await page.goto(
        `/production-order?${new URLSearchParams({ "table-production-order": JSON.stringify(productionOrderState) })}`,
      );
      const rowProductionOrder = getTableRowByTestId(
        page.getByTestId("table-production-order"),
        queuedProductionOrder.productionOrderId,
      );
      const actionsProductionOrder = rowProductionOrder.getByTestId("actions");
      await expect(rowProductionOrder.getByTestId("status")).toHaveText(SELL_ORDER_LINE_ORDER_DELETED_LABEL);
      await expect(actionsProductionOrder.getByTestId("button-edit")).toBeVisible();
      await expect(actionsProductionOrder.getByTestId("button-restore")).not.toBeAttached();

      await openAndConfirmAlertDialog(
        page,
        actionsProductionOrder.getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      await expect(rowProductionOrder.getByTestId("status")).toHaveText(STATUS_DELETED_LABEL);
      await expect(actionsProductionOrder.getByTestId("button-delete")).not.toBeAttached();
      expect(
        await dbGetProductionOrderStatus((await getProductionOrderById(queuedProductionOrder.productionOrderId))!),
      ).toBe(ProductionOrderStatus.Deleted);

      // Restoring it on its own leaves it deleted along with its Pedido de venta
      await openAndConfirmAlertDialog(
        page,
        actionsProductionOrder.getByTestId("button-restore"),
        "dialog-restore-model-content",
      );
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      await expect(rowProductionOrder.getByTestId("status")).toHaveText(SELL_ORDER_LINE_ORDER_DELETED_LABEL);
      await expect(actionsProductionOrder.getByTestId("button-restore")).not.toBeAttached();
      expect(
        await dbGetProductionOrderStatus((await getProductionOrderById(queuedProductionOrder.productionOrderId))!),
      ).toBe(ProductionOrderStatus.SellOrderDeleted);

      // In the table, a deleted Pedido de venta can only be restored, and its subrow has no actions of its own
      const tableSellOrder = page.getByTestId("table-sell-order");
      const tableState = { filters: [{ id: "id", value: sellOrder.id }] };
      await page.goto(`/sell-order?${new URLSearchParams({ "table-sell-order": JSON.stringify(tableState) })}`);
      const rowSellOrder = getTableRowByTestId(tableSellOrder, sellOrder.id);
      const actionsSellOrder = rowSellOrder.getByTestId("actions");
      await expect(actionsSellOrder.getByTestId("button-delete")).not.toBeAttached();
      await expect(actionsSellOrder.getByTestId("button-restore")).toBeEnabled();

      await rowSellOrder.getByTestId("button-expander").click();
      const subrowSellOrder = getTableSubrowById(tableSellOrder, sellOrder.id);
      await assertFormLoaded(subrowSellOrder);
      await expect(subrowSellOrder.getByTestId("button-restore-sell-order")).not.toBeAttached();
      await expect(subrowSellOrder.getByTestId("button-delete-sell-order")).not.toBeAttached();

      // Restoring it brings it back, but its Órdenes de producción are not queued again
      await openAndConfirmAlertDialog(
        page,
        actionsSellOrder.getByTestId("button-restore"),
        "dialog-restore-model-content",
      );
      await expect(actionsSellOrder.getByTestId("button-delete")).toBeEnabled();
      await expect(actionsSellOrder.getByTestId("button-restore")).not.toBeAttached();
      expect((await getSellOrderById(sellOrder.id))?.deletedAt).toBeNull();
      expect(
        await dbGetProductionOrderStatus((await getProductionOrderById(queuedProductionOrder.productionOrderId))!),
      ).toBe(ProductionOrderStatus.Pending);
      expect((await getMachineProductionOrderQueue(queuedProductionOrder.machineId)).map((po) => po.id)).not.toContain(
        queuedProductionOrder.productionOrderId,
      );
    });

    await test.step("update a sell order line", async () => {
      const sellOrder = mockSellOrders[0];
      const sellOrderLines = getMockSellOrderLines(sellOrder.id);
      const sellOrderLineToBeUpdated = sellOrderLines.at(0);
      expect(sellOrderLineToBeUpdated).toBeDefined();
      if (!sellOrderLineToBeUpdated) {
        return;
      }

      const updatedSellOrderLineData: Partial<TSellOrderLine> = {
        pendingQuantity: 2,
        quantity: 20,
      };

      await page.goto(`/sell-order/${sellOrder.id}`);

      await assertFormLoaded(page.getByTestId("form-sell-order"));

      const sellOrderLinesTable = page.getByTestId("table-sell-order-line");
      const rowSellOrderLine = getTableRowByTestId(sellOrderLinesTable, sellOrderLineToBeUpdated.id);
      await expect(rowSellOrderLine).toBeVisible();

      const inputQuantity = getEditableCellById(rowSellOrderLine, "quantity");
      await expect(inputQuantity).toBeVisible();
      await inputQuantity.clear();
      await inputQuantity.pressSequentially(String(updatedSellOrderLineData.quantity));
      await inputQuantity.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      let updatedSellOrderLine = await getSellOrderLineById(sellOrderLineToBeUpdated.id);
      expect(updatedSellOrderLine).toBeDefined();
      expect(updatedSellOrderLine!.quantity).toBe(updatedSellOrderLineData.quantity);

      const inputPendingQuantity = getEditableCellById(rowSellOrderLine, "pendingQuantity");
      await expect(inputPendingQuantity).toBeVisible();
      await inputPendingQuantity.clear();
      await inputPendingQuantity.pressSequentially(String(updatedSellOrderLineData.pendingQuantity));
      await inputPendingQuantity.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      updatedSellOrderLine = await getSellOrderLineById(sellOrderLineToBeUpdated.id);
      expect(updatedSellOrderLine).toBeDefined();
      expect(updatedSellOrderLine!.pendingQuantity).toBe(updatedSellOrderLineData.pendingQuantity);

      const sellOrderLineWithNotes = sellOrderLines.find((sellOrderLine) => sellOrderLine.notes !== null)!;
      expect(sellOrderLineWithNotes, "A sell order line with notes is needed").toBeDefined();
      const inputNotes = getEditableCellById(
        getTableRowByTestId(sellOrderLinesTable, sellOrderLineWithNotes.id),
        "notes",
      );
      await expect(inputNotes).toHaveValue(sellOrderLineWithNotes.notes!);
      const newNotes = "Cambiar el embalaje";
      await inputNotes.fill(newNotes);
      await inputNotes.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await getSellOrderLineById(sellOrderLineWithNotes.id))?.notes).toBe(newNotes);

      // Clearing the notes stores them as empty
      await inputNotes.clear();
      await inputNotes.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await getSellOrderLineById(sellOrderLineWithNotes.id))?.notes).toBeNull();

      const cellInputPartPicker = rowSellOrderLine.getByTestId("partPrice");
      const inputPickerPartPrice = cellInputPartPicker.getByTestId("input-picker-part-price");
      const inputPartPrice = cellInputPartPicker.getByTestId("input-part-price");

      // Sell order lines store only the price, not the part price it was picked from
      await expect(inputPickerPartPrice).toBeVisible();
      await expect(inputPickerPartPrice).not.toHaveAttribute("data-value");

      // Update the part price through the picker
      await openPicker(inputPickerPartPrice);

      const dialogPickerPartPriceContent = getPickerDialogContent(page, "input-picker-part-price");
      await expect(dialogPickerPartPriceContent).toBeVisible();
      const tablePickerPartPrice = dialogPickerPartPriceContent.getByTestId("table-picker-part-prices");

      await expect(tablePickerPartPrice).toBeVisible();
      await expect(getTableSkeletonRows(tablePickerPartPrice)).toHaveCount(0);

      const tableRowPartPrices = getTableRows(tablePickerPartPrice);
      const tableRowPartPricesIds = await Promise.all(
        (await tableRowPartPrices.all()).map(async (row) => getTestId(row)),
      );
      expect(tableRowPartPricesIds.length).toBeGreaterThan(1);

      // Find a part price that is different from the current sell order line part price, with the same part id
      const pickedPartPrice = mockPartPrices.find(
        (price) =>
          price.partId === getMockPartReferenceById(sellOrderLineToBeUpdated.partReferenceId)?.partId &&
          price.price !== sellOrderLineToBeUpdated.partPrice,
      );
      expect(pickedPartPrice).toBeDefined();
      if (!pickedPartPrice) {
        return;
      }

      const pickedPartPriceRow = getTableRowByTestId(tablePickerPartPrice, pickedPartPrice.id);
      await expect(pickedPartPriceRow).toBeVisible();
      const buttonRowSelectPickedPartPrice = pickedPartPriceRow.getByTestId("button-success");
      await expect(buttonRowSelectPickedPartPrice).toBeVisible();
      await expect(buttonRowSelectPickedPartPrice).toBeEnabled();
      await buttonRowSelectPickedPartPrice.click();
      await expect(dialogPickerPartPriceContent).not.toBeVisible();

      await expect(inputPartPrice).toHaveValue(formatPrice(pickedPartPrice.price, { replaceNBSP: true }));

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);

      updatedSellOrderLine = await getSellOrderLineById(sellOrderLineToBeUpdated.id);
      expect(updatedSellOrderLine).toBeDefined();
      if (!updatedSellOrderLine) {
        return;
      }
      expect(updatedSellOrderLine.partPrice).not.toBe(sellOrderLineToBeUpdated.partPrice);
      await clearToasts(page);

      // Update the part price through the price input
      const newPartPrice = "69.69";
      expect(newPartPrice, "Wrong test dummy value, it is equal to the existing part price").not.toStrictEqual(
        updatedSellOrderLine.partPrice,
      );
      await inputPartPrice.clear();
      await inputPartPrice.pressSequentially(newPartPrice);
      await inputPartPrice.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);

      updatedSellOrderLine = await getSellOrderLineById(sellOrderLineToBeUpdated.id);
      expect(updatedSellOrderLine).toBeDefined();
      if (!updatedSellOrderLine) {
        return;
      }
      expect(updatedSellOrderLine.partPrice).toBe(newPartPrice);
      await clearToasts(page);

      const sellOrderLineWithoutPrice = sellOrderLines.find((sellOrderLine) => sellOrderLine.partPrice === null);
      expect(sellOrderLineWithoutPrice).toBeDefined();
      if (!sellOrderLineWithoutPrice) {
        return;
      }
      const cellPartPriceWithoutPrice = getTableRowByTestId(
        sellOrderLinesTable,
        sellOrderLineWithoutPrice.id,
      ).getByTestId("partPrice");
      const pickerPartPriceWithoutPrice = cellPartPriceWithoutPrice.getByTestId("input-picker-part-price");
      const inputPartPriceWithoutPrice = cellPartPriceWithoutPrice.getByTestId("input-part-price");
      const buttonClearPartPrice = pickerPartPriceWithoutPrice.getByTestId("button-clear");
      await expect(buttonClearPartPrice).not.toBeAttached();

      // The clear button follows prices typed in the price input
      await inputPartPriceWithoutPrice.pressSequentially(newPartPrice);
      await inputPartPriceWithoutPrice.press("Enter");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await getSellOrderLineById(sellOrderLineWithoutPrice.id))?.partPrice).toBe(newPartPrice);
      await expect(buttonClearPartPrice).toBeVisible();

      await clearPicker(pickerPartPriceWithoutPrice);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await getSellOrderLineById(sellOrderLineWithoutPrice.id))?.partPrice).toBeNull();
      await expect(inputPartPriceWithoutPrice).toHaveValue("");
      await expect(buttonClearPartPrice).not.toBeAttached();
    });

    await test.step("delete a sell order line", async () => {
      const sellOrder = mockSellOrders[0];
      const sellOrderLines = getMockSellOrderLines(sellOrder.id);
      const sellOrderLineToBeDeleted = sellOrderLines.at(0);
      expect(sellOrderLineToBeDeleted).toBeDefined();
      if (!sellOrderLineToBeDeleted) {
        return;
      }

      await page.goto(`/sell-order/${sellOrder.id}`);

      await assertFormLoaded(page.getByTestId("form-sell-order"));

      const rowSellOrderLine = await workflowDeleteSellOrderLine(page, sellOrderLineToBeDeleted.id);

      await expect(rowSellOrderLine).toBeVisible();
      await expect(getEditableCellById(rowSellOrderLine, "quantity")).toHaveAttribute("readonly");
      await expect(getEditableCellById(rowSellOrderLine, "pendingQuantity")).toHaveAttribute("readonly");
      const partPriceCell = rowSellOrderLine.getByTestId("partPrice");
      await expect(partPriceCell.getByTestId("input-picker-part-price")).not.toBeAttached();

      const requestedDeliveryDateCell = rowSellOrderLine.getByTestId("requestedDeliveryDate");
      await expect(requestedDeliveryDateCell.getByTestId("popover-trigger")).toBeDisabled();
      await expect(requestedDeliveryDateCell.getByTestId("button-clear")).not.toBeAttached();

      const actionsCell = rowSellOrderLine.getByTestId("actions");
      await expect(actionsCell.getByTestId("button-delete")).not.toBeAttached();
      await expect(actionsCell.getByTestId("button-restore")).toBeEnabled();
    });

    await test.step("deleting the last pending line of a sell order completes it and stops its production", async () => {
      // A Línea whose Orden de producción is the one a Máquina is working on
      const machine = mockMachines.find((mockMachine) => mockMachine.activeProductionOrderId !== null)!;
      const productionOrder = mockProductionOrders.find(
        (mockProductionOrder) => mockProductionOrder.id === machine.activeProductionOrderId,
      )!;
      const sellOrderLine = getMockSellOrderLineById(productionOrder.sellOrderLineId!)!;
      const sellOrderLines = getMockSellOrderLines(sellOrderLine.sellOrderId);
      expect(sellOrderLines.filter((line) => line.pendingQuantity > 0 && line.deletedAt === null)).toEqual([
        sellOrderLine,
      ]);

      await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
      const formSellOrder = page.getByTestId("form-sell-order");
      await assertFormLoaded(formSellOrder);
      const badgeSellOrderStatus = formSellOrder.getByTestId("badge-sell-order-status");
      await expect(badgeSellOrderStatus).toContainText(STATUS_PENDING_LABEL);

      const rowSellOrderLine = await workflowDeleteSellOrderLine(page, sellOrderLine.id);

      await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_DELETED_LABEL);
      await expect(badgeSellOrderStatus).toContainText(STATUS_COMPLETED_LABEL);

      // Its Orden de producción is deleted along with it, so it is taken off the Máquinas
      expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrder.id))!)).toBe(
        ProductionOrderStatus.SellOrderLineDeleted,
      );
      expect((await getMachineById(machine.id))?.activeProductionOrderId).toBeNull();
      expect((await getMachineProductionOrderQueue(machine.id)).map((po) => po.id)).not.toContain(productionOrder.id);

      // The deleted Línea is shown over its deleted Pedido de venta
      await db
        .update(dbTableSellOrder)
        .set({ deletedAt: new Date() })
        .where(eq(dbTableSellOrder.id, sellOrderLine.sellOrderId));
      expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrder.id))!)).toBe(
        ProductionOrderStatus.SellOrderLineDeleted,
      );
      const tableProductionOrder = page.getByTestId("table-production-order");
      const gotoProductionOrdersOfSellOrderWithStatus = async (status: ProductionOrderStatus) =>
        page.goto(
          `/production-order?${new URLSearchParams({
            "table-production-order": JSON.stringify({
              filters: [
                { id: "statuses", value: [status] },
                { id: "sellOrderId", value: sellOrderLine.sellOrderId },
              ],
            }),
          })}`,
        );
      await gotoProductionOrdersOfSellOrderWithStatus(ProductionOrderStatus.SellOrderLineDeleted);
      await expect(getTableRowByTestId(tableProductionOrder, productionOrder.id).getByTestId("status")).toHaveText(
        SELL_ORDER_LINE_DELETED_MESSAGE,
      );
      await gotoProductionOrdersOfSellOrderWithStatus(ProductionOrderStatus.SellOrderDeleted);
      await expect(getTableNoDataRow(tableProductionOrder)).toBeVisible();
      await db
        .update(dbTableSellOrder)
        .set({ deletedAt: null })
        .where(eq(dbTableSellOrder.id, sellOrderLine.sellOrderId));

      await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
      await assertFormLoaded(formSellOrder);

      // Restoring the Línea makes it pending again, but its Orden de producción is not queued again
      await openAndConfirmAlertDialog(
        page,
        rowSellOrderLine.getByTestId("actions").getByTestId("button-restore"),
        "dialog-restore-model-content",
      );
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await expect(badgeSellOrderStatus).toContainText(STATUS_PENDING_LABEL);
      await expect(rowSellOrderLine.getByTestId("status")).not.toHaveText(STATUS_DELETED_LABEL);
      expect((await getSellOrderLineById(sellOrderLine.id))?.deletedAt).toBeNull();
      expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrder.id))!)).toBe(
        ProductionOrderStatus.Pending,
      );
      expect((await getMachineProductionOrderQueue(machine.id)).map((po) => po.id)).not.toContain(productionOrder.id);
    });

    // It leaves the Pedido de venta deleted for good, so it goes last
    await test.step("avoid creating a sell order with a duplicate client reference for the same client", async () => {
      const existingSellOrder = mockSellOrders[0];
      if (existingSellOrder.clientReference === null)
        throw new Error("Existing sell order must have a client reference for this test to be valid");

      const existingSellOrderClient = getMockClientById(existingSellOrder.clientId);
      expect(existingSellOrderClient).toBeDefined();
      const previousSellOrderIds = (await getSellOrders()).map((sellOrder) => sellOrder.id);

      await page.goto("/create-sell-order");

      const comboboxClient = getFormInputByLabel(page, CLIENT_LABEL, InputElementType.Combobox);
      const buttonClearComboboxClient = getClearComboboxButton(comboboxClient);
      await expect(comboboxClient).toBeVisible();
      await expect(buttonClearComboboxClient).not.toBeVisible();
      await assertComboboxValue(comboboxClient, null);
      await openCombobox(comboboxClient);
      await fillComboboxFilter(page, existingSellOrderClient!.name.substring(0, 4));
      await clickInComboboxOption(page, existingSellOrderClient!.name);
      await assertComboboxValue(comboboxClient, String(existingSellOrderClient!.id));
      await expect(buttonClearComboboxClient).toBeVisible();

      const inputClientReference = getFormInputByLabel(page, CLIENT_REFERENCE_LABEL);

      await expect(inputClientReference).toBeVisible();
      await inputClientReference.fill(existingSellOrder.clientReference);

      const buttonSubmit = page.getByTestId("button-submit-form-sell-order");
      await expect(buttonSubmit).toBeDisabled();

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);

      const finalDbSellOrders = await getSellOrders();
      expect(finalDbSellOrders.length).toEqual(previousSellOrderIds.length);

      // Deleting the Pedido de venta frees its reference
      await clearToasts(page);
      await workflowDeleteSellOrder(page, existingSellOrder.id);

      // A previous step created a Pedido de venta, so the replacement is the one after it
      const replacementSellOrderId = Math.max(...previousSellOrderIds) + 1;
      await page.goto("/create-sell-order");
      await openCombobox(comboboxClient);
      await fillComboboxFilter(page, existingSellOrderClient!.name.substring(0, 4));
      await clickInComboboxOption(page, existingSellOrderClient!.name);
      await inputClientReference.fill(existingSellOrder.clientReference);
      await setInputFiles(
        page,
        getFormInputByLabel(page, FILE_LABEL, InputElementType.File),
        path.join(MOCK_DATA_PATH, "sample.pdf"),
      );

      await clearToasts(page);
      await expect(buttonSubmit).toBeEnabled();
      await buttonSubmit.click();
      await expect(page).toHaveURL(`/sell-order/${replacementSellOrderId}`);

      // ...so the deleted Pedido de venta can no longer be restored
      await page.goto(`/sell-order/${existingSellOrder.id}`);
      await clearToasts(page);
      await openAndConfirmAlertDialog(
        page,
        page.getByTestId("button-restore-sell-order"),
        "dialog-restore-model-content",
      );

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("El Cliente ya tiene un Pedido de venta con esa referencia");
      expect((await getSellOrderById(existingSellOrder.id))!.deletedAt).not.toBeNull();

      // The index rejects the duplicate even when the form is bypassed
      await expectUniqueViolation(
        db.insert(dbTableSellOrder).values({
          clientId: existingSellOrder.clientId,
          clientReference: existingSellOrder.clientReference,
          receptionDate: new Date(),
        }),
        SELL_ORDER_REFERENCE_CONSTRAINT,
      );

      // Pedidos de venta without a reference never collide
      const sellOrderWithoutReference = {
        clientId: existingSellOrder.clientId,
        clientReference: null,
        receptionDate: new Date(),
      };
      await db.insert(dbTableSellOrder).values([sellOrderWithoutReference, sellOrderWithoutReference]);
    });
  },
);

test(
  "create a sell order with a file for a client inserted outside the app",
  { annotation: TestAnnotations.ResetSellOrders },
  async ({ page, db, toasts }) => {
    const client = (
      await db
        .insert(dbTableClient)
        .values({
          address: "Calle Mayor 1",
          city: "Pamplona",
          legalName: "Cliente Migrado S.L.",
          name: "Cliente Migrado",
          postalCode: "31001",
          taxId: "B31000000",
        })
        .returning()
    )[0];
    expect(await findFolderById(getSellOrderRootPath(), client.id)).toBeNull();

    await page.goto("/create-sell-order");
    const comboboxClient = getFormInputByLabel(page, CLIENT_LABEL, InputElementType.Combobox);
    await openCombobox(comboboxClient);
    await fillComboboxFilter(page, client.name);
    await clickInComboboxOption(page, client.name);
    await assertComboboxValue(comboboxClient, String(client.id));

    await setInputFiles(
      page,
      getFormInputByLabel(page, FILE_LABEL, InputElementType.File),
      path.join(MOCK_DATA_PATH, "sample.pdf"),
    );
    await page.getByTestId("button-submit-form-sell-order").click();

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);

    const sellOrder = await db.query.dbTableSellOrder.findFirst({ where: { clientId: client.id } });
    expect(sellOrder).toBeDefined();
    expect(await getSellOrderPath({ checkIfFileExists: true, clientId: client.id, sellOrderId: sellOrder!.id })).toBe(
      path.join(getSellOrderRootPath(), `${client.id} - ${client.name}`, `${sellOrder!.id}.pdf`),
    );
  },
);

test("manage the sell order lines without part", async ({ page, db, toasts }) => {
  const sellOrder = mockSellOrders[0];
  const formSellOrder = page.getByTestId("form-sell-order");
  const tableSellOrderLine = formSellOrder.getByTestId("table-sell-order-line");
  const dialogCreateSellOrderLine = page.getByTestId("dialog-create-sell-order-line");
  const checkboxCustomLine = dialogCreateSellOrderLine.getByTestId("checkbox-custom-line");
  const pickerPart = dialogCreateSellOrderLine.getByTestId("picker-part");
  const inputDescription = getFormInputByLabel(dialogCreateSellOrderLine, DESCRIPTION_LABEL);
  const inputQuantity = getFormInputByLabel(dialogCreateSellOrderLine, QUANTITY_LABEL, InputElementType.Number);
  const inputPartPrice = getFormInputByLabel(dialogCreateSellOrderLine, PRICE_LABEL, InputElementType.Number);
  const buttonSubmit = dialogCreateSellOrderLine.getByTestId("button-submit");
  const requiredFieldErrors = dialogCreateSellOrderLine.getByText("Campo obligatorio");
  const customLine = { description: "Portes", quantity: 3 };
  const customLinePartPrice = "12.5";
  let customSellOrderLineId: number;

  await test.step("a line has either a part or a description, with or without a price", async () => {
    const line = { notes: null, partPrice: null, quantity: 1, requestedDeliveryDate: null, sellOrderId: sellOrder.id };
    const partReferenceId = mockSellOrderLines[0].partReferenceId;
    expect(createSellOrderLineSchema.safeParse({ ...line, description: null, partReferenceId }).success).toBe(true);
    for (const partPrice of [null, "1"]) {
      expect(
        createSellOrderLineSchema.safeParse({ ...line, description: "Portes", partPrice, partReferenceId: null })
          .success,
      ).toBe(true);
    }
    expect(createSellOrderLineSchema.safeParse({ ...line, description: null, partReferenceId: null }).success).toBe(
      false,
    );
    expect(
      createSellOrderLineSchema.safeParse({ ...line, description: "Portes", partPrice: "1", partReferenceId }).success,
    ).toBe(false);
    // An emptied price is no price, as the database can not store an empty number
    expect(
      createSellOrderLineSchema.parse({ ...line, description: null, partPrice: "", partReferenceId }).partPrice,
    ).toBeNull();
    expect(
      createSellOrderLineSchema.parse({ ...line, description: "Portes", partPrice: "", partReferenceId: null })
        .partPrice,
    ).toBeNull();
    expect(
      updateSellOrderLineSchema.parse({ ...line, id: mockSellOrderLines[0].id, partPrice: "", pendingQuantity: 1 })
        .partPrice,
    ).toBeNull();
    expect(
      createSellOrderLineSchema.safeParse({ ...line, description: "", partPrice: "1", partReferenceId: null }).success,
    ).toBe(false);

    // The database holds the same rules for the lines that do not come through the app, like the migrated ones
    const dbLine = { pendingQuantity: 1, quantity: 1, sellOrderId: sellOrder.id };
    await expectCheckViolation(
      db.insert(dbTableSellOrderLine).values({ ...dbLine, partPrice: "1" }),
      SELL_ORDER_LINE_ITEM_CONSTRAINT,
    );
    await expectCheckViolation(
      db.insert(dbTableSellOrderLine).values({ ...dbLine, description: "Portes", partReferenceId }),
      SELL_ORDER_LINE_ITEM_CONSTRAINT,
    );
  });

  await test.step("create a line without part", async () => {
    const existingDbSellOrderLines = await getSellOrderLinesBySellOrderId(sellOrder.id);
    await workflowOpenCreateSellOrderLine(page, sellOrder.id);

    await inputQuantity.pressSequentially(String(customLine.quantity));
    await inputQuantity.press("Enter");
    await inputPartPrice.pressSequentially("4.5");
    await buttonSubmit.click();
    // Only the part is missing
    await expect(requiredFieldErrors).toHaveCount(1);

    // The part, its error and its price go away with the switch, as they would block or misprice the line
    await checkboxCustomLine.click();
    await expect(checkboxCustomLine).toBeChecked();
    await expect(pickerPart).toHaveCount(0);
    await expect(getDivDisabledMessage(dialogCreateSellOrderLine.getByTestId("card-part-prices"))).toBeVisible();
    await expect(requiredFieldErrors).toHaveCount(0);
    await expect(inputPartPrice).toHaveValue("");

    // Like a line with part, its price can be left for when it is calculated
    await inputDescription.fill(customLine.description);
    await expect(buttonSubmit).toBeEnabled();
    await buttonSubmit.click();
    await expect(dialogCreateSellOrderLine).not.toBeVisible();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    const newDbSellOrderLine = (await getSellOrderLinesBySellOrderId(sellOrder.id)).find(
      (line) => !existingDbSellOrderLines.some((existingLine) => existingLine.id === line.id),
    );
    expect(newDbSellOrderLine).toMatchObject({
      ...customLine,
      partPrice: null,
      partReferenceId: null,
      pendingQuantity: customLine.quantity,
    });
    customSellOrderLineId = newDbSellOrderLine!.id;

    const rowSellOrderLine = getTableRowByTestId(tableSellOrderLine, customSellOrderLineId);
    await expect(rowSellOrderLine.getByTestId("part")).toHaveText("");
    await expect(rowSellOrderLine.getByTestId("description")).toHaveText(customLine.description);
    await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_PENDING_LABEL);
  });

  await test.step("switching back to a line with part drops the description", async () => {
    await workflowOpenCreateSellOrderLine(page, sellOrder.id);
    await checkboxCustomLine.click();
    await inputDescription.fill(customLine.description);

    await checkboxCustomLine.click();
    await expect(checkboxCustomLine).not.toBeChecked();
    await expect(pickerPart).toBeVisible();
    expect(await getPickerValue(pickerPart)).toBeNull();

    await checkboxCustomLine.click();
    await expect(inputDescription).toHaveValue("");
  });

  await test.step("set and clear the price of a line without part", async () => {
    await page.goto(`/sell-order/${sellOrder.id}`);
    await assertFormLoaded(formSellOrder);
    const rowSellOrderLine = getTableRowByTestId(tableSellOrderLine, customSellOrderLineId);
    const cellPartPrice = rowSellOrderLine.getByTestId("partPrice");

    // There are no prices of a part to pick from
    await expect(cellPartPrice.getByTestId("input-picker-part-price")).toHaveCount(0);

    const inputRowPartPrice = cellPartPrice.getByTestId("input-part-price");
    await expect(inputRowPartPrice).toHaveValue("");
    await inputRowPartPrice.pressSequentially(customLinePartPrice);
    await inputRowPartPrice.press("Enter");
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);
    expect((await getSellOrderLineById(customSellOrderLineId))?.partPrice).toBe(customLinePartPrice);

    await inputRowPartPrice.clear();
    await inputRowPartPrice.press("Enter");
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);
    expect((await getSellOrderLineById(customSellOrderLineId))?.partPrice).toBeNull();

    // Delivering all of it by hand completes it, like any other line
    const inputPendingQuantity = getEditableCellById(rowSellOrderLine, "pendingQuantity");
    await inputPendingQuantity.clear();
    await inputPendingQuantity.pressSequentially("0");
    await inputPendingQuantity.press("Enter");
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    expect((await getSellOrderLineById(customSellOrderLineId))?.pendingQuantity).toBe(0);
    await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_COMPLETED_LABEL);
  });
});

test(
  "manage the returns of a sell order",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, toasts }) => {
    const sellOrder = mockSellOrders[0];
    const formSellOrder = page.getByTestId("form-sell-order");
    const tableSellOrderLine = formSellOrder.getByTestId("table-sell-order-line");
    const dialogCreateSellOrderLine = page.getByTestId("dialog-create-sell-order-line");
    const inputQuantity = getFormInputByLabel(dialogCreateSellOrderLine, QUANTITY_LABEL, InputElementType.Number);
    const inputPartPrice = getFormInputByLabel(dialogCreateSellOrderLine, PRICE_LABEL, InputElementType.Number);
    const inputTotal = dialogCreateSellOrderLine.locator("#dialog-create-sell-order-line-total");
    const buttonSubmit = dialogCreateSellOrderLine.getByTestId("button-submit");
    const returnLine = { description: "Devolución pieza", quantity: -170 };
    let returnSellOrderLineId: number;

    const expectSingleToastOfType = async (toastType: ToastType) => {
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(toastType);
      await clearToasts(page);
    };

    await test.step("a line can not have a quantity of 0", async () => {
      await workflowOpenCreateSellOrderLine(page, sellOrder.id);
      await dialogCreateSellOrderLine.getByTestId("checkbox-custom-line").click();
      await getFormInputByLabel(dialogCreateSellOrderLine, DESCRIPTION_LABEL).fill(returnLine.description);
      await inputQuantity.pressSequentially("0");
      await inputQuantity.blur();
      await buttonSubmit.click();
      await expect(dialogCreateSellOrderLine.getByText("La cantidad no puede ser 0")).toBeVisible();
      await expect(dialogCreateSellOrderLine).toBeVisible();
    });

    await test.step("create a return, which is pending for its whole negative quantity", async () => {
      const existingDbSellOrderLines = await getSellOrderLinesBySellOrderId(sellOrder.id);
      await inputQuantity.clear();
      await inputQuantity.pressSequentially(String(returnLine.quantity));
      await expect(inputQuantity).toHaveValue(String(returnLine.quantity));
      await inputPartPrice.pressSequentially("0.82");
      await inputPartPrice.blur();
      // The read-only total keeps the sign of a negative amount
      await expect(inputTotal).toHaveValue(/^-139,40\s€$/);
      await buttonSubmit.click();
      await expect(dialogCreateSellOrderLine).not.toBeVisible();
      await expectSingleToastOfType(ToastType.Success);

      const newDbSellOrderLine = (await getSellOrderLinesBySellOrderId(sellOrder.id)).find(
        (line) => !existingDbSellOrderLines.some((existingLine) => existingLine.id === line.id),
      );
      expect(newDbSellOrderLine).toMatchObject({
        ...returnLine,
        partPrice: "0.82",
        pendingQuantity: returnLine.quantity,
      });
      returnSellOrderLineId = newDbSellOrderLine!.id;

      const rowSellOrderLine = getTableRowByTestId(tableSellOrderLine, returnSellOrderLineId);
      await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_PENDING_LABEL);
      // A return is delivered back without being produced
      await expect(rowSellOrderLine.getByTestId("button-create-production-order")).toHaveCount(0);
    });

    await test.step("the pending quantity of a return can not leave its range", async () => {
      const rowSellOrderLine = getTableRowByTestId(tableSellOrderLine, returnSellOrderLineId);
      const inputPendingQuantity = getEditableCellById(rowSellOrderLine, "pendingQuantity");
      for (const pendingQuantity of [5, -171]) {
        await inputPendingQuantity.clear();
        await inputPendingQuantity.pressSequentially(String(pendingQuantity));
        await inputPendingQuantity.press("Enter");
        await expectSingleToastOfType(ToastType.Error);
        expect((await getSellOrderLineById(returnSellOrderLineId))?.pendingQuantity).toBe(returnLine.quantity);
      }

      await inputPendingQuantity.clear();
      await inputPendingQuantity.pressSequentially("-20");
      await inputPendingQuantity.press("Enter");
      await expectSingleToastOfType(ToastType.Success);
      expect((await getSellOrderLineById(returnSellOrderLineId))?.pendingQuantity).toBe(-20);
    });

    await test.step("changing the quantity brings the pending quantity into its new range", async () => {
      const rowSellOrderLine = getTableRowByTestId(tableSellOrderLine, returnSellOrderLineId);
      const inputRowQuantity = getEditableCellById(rowSellOrderLine, "quantity");
      const inputPendingQuantity = getEditableCellById(rowSellOrderLine, "pendingQuantity");
      const editCell = async (input: Locator, value: number) => {
        await input.clear();
        await input.pressSequentially(String(value));
        await input.press("Enter");
        await expectSingleToastOfType(ToastType.Success);
      };

      // A return turned into an ordered line has nothing pending until it is set again
      await editCell(inputRowQuantity, 100);
      expect(await getSellOrderLineById(returnSellOrderLineId)).toMatchObject({ pendingQuantity: 0, quantity: 100 });
      await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_COMPLETED_LABEL);

      await editCell(inputPendingQuantity, 40);
      expect(await getSellOrderLineById(returnSellOrderLineId)).toMatchObject({ pendingQuantity: 40, quantity: 100 });
      await expect(rowSellOrderLine.getByTestId("status")).toHaveText(STATUS_PENDING_LABEL);

      await editCell(inputRowQuantity, 30);
      expect(await getSellOrderLineById(returnSellOrderLineId)).toMatchObject({ pendingQuantity: 30, quantity: 30 });

      await editCell(inputRowQuantity, -30);
      expect(await getSellOrderLineById(returnSellOrderLineId)).toMatchObject({ pendingQuantity: 0, quantity: -30 });

      // 0 is rejected, keeping the line as it was
      await inputRowQuantity.clear();
      await inputRowQuantity.pressSequentially("0");
      await inputRowQuantity.press("Enter");
      await expectSingleToastOfType(ToastType.Error);
      expect(await getSellOrderLineById(returnSellOrderLineId)).toMatchObject({ pendingQuantity: 0, quantity: -30 });
    });
  },
);

test("create the part prices of a sell order for its client", async ({ page, toasts }) => {
  const sellOrder = mockSellOrders[0];
  const sellOrderClient = getMockClientById(sellOrder.clientId);
  expect(sellOrderClient, "Wrong test set up values").toBeDefined();
  const pickedPartReference = getMockPartReferences({ clientId: sellOrder.clientId, includeNullClientId: true }).find(
    (partReference) => partReference.deletedAt === null,
  );
  expect(pickedPartReference, "Wrong test set up values").toBeDefined();

  const formSellOrder = page.getByTestId("form-sell-order");
  const dialogCreateSellOrderLine = page.getByTestId("dialog-create-sell-order-line");
  const pickerPart = dialogCreateSellOrderLine.getByTestId("picker-part");
  const tablePartPrices = dialogCreateSellOrderLine.getByTestId("radio-table-part-prices");
  const cardCreatePartPrice = dialogCreateSellOrderLine.getByTestId("card-create-part-price");
  const buttonToggleCreatePartPrice = cardCreatePartPrice.getByTestId("button-toggle-create-part-price");
  const inputCreatePartPrice = getFormInputByLabel(cardCreatePartPrice, PRICE_LABEL, InputElementType.Number);

  const pickPart = async () => {
    const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
    await getTableRowByTestId(tablePickerPart, pickedPartReference!.partId)
      .locator('[data-testid="div-part-reference-row"]', { has: page.getByText(pickedPartReference!.reference) })
      .getByTestId("button-success")
      .click();
    await expect(dialogPickerPartContent).not.toBeVisible();
    await expect(pickerPart).toHaveAttribute("data-value", String(pickedPartReference!.partId));
  };

  const createPartPrice = async (card: Locator, partId: number, quantity: number) => {
    const existingPartPriceIds = (await getPartPricesByPartId(partId)).map((partPrice) => partPrice.id);
    const price = "9.87";

    // The price is for the client of the sell order, so it is not asked
    await expect(card.getByTestId("combobox-client")).toHaveCount(0);
    await getFormInputByLabel(card, QUANTITY_LABEL, InputElementType.Number).pressSequentially(String(quantity));
    await getFormInputByLabel(card, PRICE_LABEL, InputElementType.Number).pressSequentially(price);
    await card.getByTestId("button-submit").click();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    const newPartPrice = (await getPartPricesByPartId(partId)).find(
      (partPrice) => !existingPartPriceIds.includes(partPrice.id),
    );
    expect(newPartPrice).toMatchObject({ clientId: sellOrder.clientId, price, quantity });
    return newPartPrice!;
  };

  await test.step("create a price from a new line once it has a part", async () => {
    await workflowOpenCreateSellOrderLine(page, sellOrder.id);

    await expect(buttonToggleCreatePartPrice).toBeDisabled();
    await expect(inputCreatePartPrice).not.toBeVisible();

    await pickPart();
    await expect(buttonToggleCreatePartPrice).toBeEnabled();
    await buttonToggleCreatePartPrice.click();
    const newPartPrice = await createPartPrice(cardCreatePartPrice, pickedPartReference!.partId, 777);
    await expect(getTableRowByTestId(tablePartPrices, newPartPrice.id)).toContainText(sellOrderClient!.name);
  });

  await test.step("losing the part closes the price creation until it is opened again", async () => {
    await expect(inputCreatePartPrice).toBeVisible();
    await clearPicker(pickerPart);
    await expect(buttonToggleCreatePartPrice).toBeDisabled();
    await expect(inputCreatePartPrice).not.toBeVisible();

    await pickPart();
    await expect(buttonToggleCreatePartPrice).toBeEnabled();
    await expect(inputCreatePartPrice).not.toBeVisible();
  });

  await test.step("a line without part can not create prices", async () => {
    await buttonToggleCreatePartPrice.click();
    await expect(inputCreatePartPrice).toBeVisible();

    await dialogCreateSellOrderLine.getByTestId("checkbox-custom-line").click();
    await expect(buttonToggleCreatePartPrice).toBeDisabled();
    await expect(inputCreatePartPrice).not.toBeVisible();
    // Only the message of the custom line is shown, not the one asking for a part
    await expect(getDivDisabledMessage(dialogCreateSellOrderLine.getByTestId("card-part-prices"))).toBeVisible();
    await expect(getDivDisabledMessage(tablePartPrices)).not.toBeVisible();
  });

  await test.step("create a price from the price picker of a line", async () => {
    const sellOrderLine = getMockSellOrderLines(sellOrder.id).find(
      (line) => line.partReferenceId !== null && line.deletedAt === null,
    );
    const partId = getMockPartReferenceById(sellOrderLine?.partReferenceId ?? null)?.partId;
    expect(partId, "Wrong test set up values").toBeDefined();

    await page.goto(`/sell-order/${sellOrder.id}`);
    await assertFormLoaded(formSellOrder);
    await openPicker(
      getTableRowByTestId(formSellOrder.getByTestId("table-sell-order-line"), sellOrderLine!.id)
        .getByTestId("partPrice")
        .getByTestId("input-picker-part-price"),
    );
    const dialogPickerPartPriceContent = getPickerDialogContent(page, "input-picker-part-price");
    const cardPickerCreatePartPrice = dialogPickerPartPriceContent.getByTestId("card-create-part-price");
    await cardPickerCreatePartPrice.getByTestId("button-toggle-create-part-price").click();

    const newPartPrice = await createPartPrice(cardPickerCreatePartPrice, partId!, 778);
    await expect(
      getTableRowByTestId(dialogPickerPartPriceContent.getByTestId("table-picker-part-prices"), newPartPrice.id),
    ).toContainText(sellOrderClient!.name);
  });
});

test("filter the sell orders by part", async ({ page }) => {
  const tableSellOrder = page.getByTestId("table-sell-order");
  const popoverFilters = tableSellOrder.getByTestId("popover-sell-order-filters");
  const buttonClearFilters = popoverFilters.getByTestId("button-clear-filters");
  const pickerPart = getFormInputByLabel(getPopoverContent(page), PART_LABEL, InputElementType.Picker);
  const getTableState = () => {
    const tableState = new URL(page.url()).searchParams.get("table-sell-order");
    return tableState !== null ? (JSON.parse(tableState) as TTableSellOrderState) : undefined;
  };
  const assertSellOrdersOfPart = async (partId: number) => {
    const expectedSellOrders = getMockSellOrdersOfPart(partId);
    if (expectedSellOrders.length === 0) {
      await expect(getTableNoDataRow(tableSellOrder)).toBeVisible();
      return;
    }
    await assertTableRowCount(tableSellOrder, expectedSellOrders.length);
    for (const expectedSellOrder of expectedSellOrders) {
      await expect(getTableRowByTestId(tableSellOrder, expectedSellOrder.id)).toBeVisible();
    }
  };

  await test.step("pick each part in the filter", async () => {
    await page.goto("/sell-order");
    await assertTableRowCount(tableSellOrder, mockSellOrders.length);

    for (const part of mockParts.filter((p) => p.deletedAt === null)) {
      await popoverFilters.getByTestId("popover-trigger").click();
      const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
      await getTableRowByTestId(tablePickerPart, part.id).getByTestId("button-success").click();
      await expect(dialogPickerPartContent).not.toBeVisible();

      await assertSellOrdersOfPart(part.id);
      expect(getTableState()?.filters).toEqual([{ id: "partId", value: part.id }]);

      await buttonClearFilters.click();
      await assertTableRowCount(tableSellOrder, mockSellOrders.length);
      await expect.poll(() => getTableState()?.filters).toBeUndefined();
    }
  });

  await test.step("a sell order with several lines of the part is listed and counted once", async () => {
    const part = mockParts.find(
      (p) =>
        mockSellOrderLines.filter((line) => getMockPartReferenceById(line.partReferenceId)?.partId === p.id).length >
        getMockSellOrdersOfPart(p.id).length,
    );
    expect(part, "Some sell order should have several lines of the same part").toBeDefined();
    const expectedSellOrders = getMockSellOrdersOfPart(part!.id);

    // A page that exactly fits the sell orders of the part would gain a second page if any of them were repeated
    const tableState: TTableSellOrderState = {
      filters: [{ id: "partId", value: part!.id }],
      pagination: { pageSize: expectedSellOrders.length },
    };
    await page.goto(`/sell-order?${new URLSearchParams({ "table-sell-order": JSON.stringify(tableState) })}`);
    await assertSellOrdersOfPart(part!.id);
    await expect(page.getByText(/^Página \d+ de \d+$/)).toHaveCount(0);

    // The filter of the link is shown in the picker
    await expect(buttonClearFilters).toBeVisible();
    await popoverFilters.getByTestId("popover-trigger").click();
    await expect(pickerPart).toHaveAttribute("data-value", String(part!.id));
  });
});

const SAMPLE_PDF_PATH = path.join(MOCK_DATA_PATH, "sample.pdf");
const sellOrderWithFile = mockSellOrders.find(
  (sellOrder) => sellOrder.fileUploadedAt !== null && sellOrder.deletedAt === null,
)!;
// Shares the client folder with sellOrderWithFile, so a change to one file must not touch the other
const sameClientSellOrderWithFile = mockSellOrders.find(
  (sellOrder) =>
    sellOrder.id !== sellOrderWithFile.id &&
    sellOrder.clientId === sellOrderWithFile.clientId &&
    sellOrder.fileUploadedAt !== null,
)!;
// Also of the same client, so editing it checks that folder is left alone
const sellOrderWithoutFile = mockSellOrders.find(
  (sellOrder) =>
    sellOrder.clientId === sellOrderWithFile.clientId &&
    sellOrder.fileUploadedAt === null &&
    sellOrder.deletedAt === null,
)!;
const deletedSellOrder = mockSellOrders.find((sellOrder) => sellOrder.deletedAt !== null)!;

async function getDeletedSellOrderFilePaths(sellOrderId: number) {
  const clientFolder = (await findFolderById(getSellOrderRootPath(), sellOrderWithFile.clientId))!;
  return fs
    .readdirSync(clientFolder)
    .filter((fileName) => fileName.startsWith("DELETED_") && fileName.endsWith(`.${sellOrderId}.pdf`))
    .map((fileName) => path.join(clientFolder, fileName));
}

const getButtonFile = (container: Locator) => container.getByTestId("button-sell-order-file");

test("view the files of the sell orders", async ({ page }) => {
  // The UI only reads fileUploadedAt, so the mock data has to match the mock SELL_ORDERS folder
  for (const sellOrder of mockSellOrders) {
    expect((await getSellOrderFilePath(sellOrder.id)) !== null, `Wrong test set up: sell order ${sellOrder.id}`).toBe(
      sellOrder.fileUploadedAt !== null,
    );
  }

  await test.step("in the table", async () => {
    await page.goto("/sell-order");
    const tableSellOrder = page.getByTestId("table-sell-order");
    for (const sellOrder of mockSellOrders.filter((mockSellOrder) => mockSellOrder.deletedAt === null)) {
      await expect(
        getButtonFile(getTableRowByTestId(tableSellOrder, sellOrder.id)),
        `Sell order ${sellOrder.id}`,
      ).toBeEnabled({ enabled: sellOrder.fileUploadedAt !== null });
    }
    const dialogFile = await workflowOpenSellOrderFile(
      page,
      getButtonFile(getTableRowByTestId(tableSellOrder, sellOrderWithFile.id)),
    );
    await expect(dialogFile).toContainText(`Pedido de venta ${sellOrderWithFile.id}`);
    await workflowDownloadSellOrderFile(page, dialogFile, sellOrderWithFile.id);
  });

  await test.step("in the form, where the same file keeps its URL so the browser can cache it", async () => {
    const buttonFile = getButtonFile(await workflowOpenSellOrder(page, sellOrderWithFile.id));
    const dialogFile = await workflowOpenSellOrderFile(page, buttonFile);
    await expect(dialogFile.getByTestId("button-delete-sell-order-file")).toBeVisible();
    const url = await workflowDownloadSellOrderFile(page, dialogFile, sellOrderWithFile.id);
    await page.keyboard.press("Escape");
    await expect(dialogFile).not.toBeVisible();
    expect(
      await workflowDownloadSellOrderFile(
        page,
        await workflowOpenSellOrderFile(page, buttonFile),
        sellOrderWithFile.id,
      ),
    ).toBe(url);

    for (const sellOrder of [sellOrderWithoutFile, deletedSellOrder]) {
      await expect(getButtonFile(await workflowOpenSellOrder(page, sellOrder.id))).toBeDisabled();
    }
  });
});

test(
  "delete, upload and replace the files of the sell orders",
  { annotation: TestAnnotations.ResetSellOrders },
  async ({ page, toasts, openPage }) => {
    const fileContent = fs.readFileSync((await getSellOrderFilePath(sellOrderWithFile.id))!);
    expect(fileContent.equals(fs.readFileSync(SAMPLE_PDF_PATH)), "Wrong test set up: the files should differ").toBe(
      false,
    );

    // Another tab with the table sees every change without reloading
    const tablePage = await openPage(UserMode.Admin);
    await tablePage.goto("/sell-order");
    const getTableButtonFile = (sellOrderId: number) =>
      getButtonFile(getTableRowByTestId(tablePage.getByTestId("table-sell-order"), sellOrderId));

    const buttonFile = getButtonFile(await workflowOpenSellOrder(page, sellOrderWithFile.id));
    const dialogFile = await workflowOpenSellOrderFile(page, buttonFile);

    await test.step("cancelling the deletion keeps the file", async () => {
      const dialogDelete = page.getByTestId("dialog-delete-model-content");
      await dialogFile.getByTestId("button-delete-sell-order-file").click();
      await expect(dialogDelete).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialogDelete).not.toBeVisible();
      await expect(dialogFile).toBeVisible();
      await expect(toasts).toHaveCount(0);
      expect(await getSellOrderById(sellOrderWithFile.id)).toEqual(sellOrderWithFile);
    });

    await test.step("deleting the file archives it and keeps the other files of the client", async () => {
      await workflowDeleteSellOrderFile(page, dialogFile);
      await expect(dialogFile).not.toBeVisible();

      expect((await getSellOrderById(sellOrderWithFile.id))?.fileUploadedAt).toBeNull();
      expect(await getSellOrderFilePath(sellOrderWithFile.id)).toBeNull();
      const deletedFilePaths = await getDeletedSellOrderFilePaths(sellOrderWithFile.id);
      expect(deletedFilePaths).toHaveLength(1);
      expect(fs.readFileSync(deletedFilePaths[0]).equals(fileContent)).toBe(true);
      await expect(buttonFile).toBeDisabled();
      await expect(getTableButtonFile(sellOrderWithFile.id)).toBeDisabled();

      expect(await getSellOrderById(sameClientSellOrderWithFile.id)).toEqual(sameClientSellOrderWithFile);
      expect(await getSellOrderFilePath(sameClientSellOrderWithFile.id)).not.toBeNull();
      await expect(getTableButtonFile(sameClientSellOrderWithFile.id)).toBeEnabled();
    });

    await test.step("a picked file can be cleared before saving", async () => {
      const inputSellOrderFile = getFormInputByLabel(page, FILE_LABEL, InputElementType.File);
      const buttonClearFile = inputSellOrderFile.getByTestId("button-clear");
      await expect(inputSellOrderFile).toHaveText(DROP_FILE_PLACEHOLDER);
      await expect(buttonClearFile).toHaveCount(0);
      await setInputFiles(page, inputSellOrderFile, SAMPLE_PDF_PATH);
      await expect(inputSellOrderFile).toContainText(path.basename(SAMPLE_PDF_PATH));
      await buttonClearFile.click();
      await expect(inputSellOrderFile).toHaveText(DROP_FILE_PLACEHOLDER);
      await expect(buttonClearFile).toHaveCount(0);
    });

    await test.step("uploading a file when there is none archives nothing", async () => {
      await workflowUploadSellOrderFile(page, SAMPLE_PDF_PATH);

      expect((await getSellOrderById(sellOrderWithFile.id))?.fileUploadedAt).not.toBeNull();
      expect(await getDeletedSellOrderFilePaths(sellOrderWithFile.id)).toHaveLength(1);
      await expect(getTableButtonFile(sellOrderWithFile.id)).toBeEnabled();
      await workflowDownloadSellOrderFile(
        page,
        await workflowOpenSellOrderFile(page, buttonFile),
        sellOrderWithFile.id,
      );
    });

    await test.step("replacing a file archives the old one and changes only the file", async () => {
      const replacedButtonFile = getButtonFile(await workflowOpenSellOrder(page, sameClientSellOrderWithFile.id));
      const oldContent = fs.readFileSync((await getSellOrderFilePath(sameClientSellOrderWithFile.id))!);
      const oldUrl = await workflowDownloadSellOrderFile(
        page,
        await workflowOpenSellOrderFile(page, replacedButtonFile),
        sameClientSellOrderWithFile.id,
      );
      await page.keyboard.press("Escape");

      await workflowUploadSellOrderFile(page, SAMPLE_PDF_PATH);

      const { fileUploadedAt, ...dbSellOrder } = (await getSellOrderById(sameClientSellOrderWithFile.id))!;
      const { fileUploadedAt: oldFileUploadedAt, ...mockSellOrder } = sameClientSellOrderWithFile;
      expect(fileUploadedAt!.getTime()).not.toBe(oldFileUploadedAt!.getTime());
      expect(dbSellOrder).toEqual(mockSellOrder);
      const deletedFilePaths = await getDeletedSellOrderFilePaths(sameClientSellOrderWithFile.id);
      expect(deletedFilePaths).toHaveLength(1);
      expect(fs.readFileSync(deletedFilePaths[0]).equals(oldContent)).toBe(true);
      // A new file gets a new URL, so the browser cannot show the cached old one
      expect(
        await workflowDownloadSellOrderFile(
          page,
          await workflowOpenSellOrderFile(page, replacedButtonFile),
          sameClientSellOrderWithFile.id,
        ),
      ).not.toBe(oldUrl);
    });

    await test.step("editing a sell order without uploading a file keeps it", async () => {
      for (const sellOrderId of [sellOrderWithFile.id, sellOrderWithoutFile.id]) {
        const { fileUploadedAt } = (await getSellOrderById(sellOrderId))!;
        const deletedFilePaths = await getDeletedSellOrderFilePaths(sellOrderId);
        const formSellOrder = await workflowOpenSellOrder(page, sellOrderId);
        await getFormInputByLabel(page, NOTES_LABEL, InputElementType.Textarea).fill(`Notas ${sellOrderId}`);
        await workflowSubmitSellOrder(page);

        expect(await getSellOrderById(sellOrderId)).toMatchObject({ fileUploadedAt, notes: `Notas ${sellOrderId}` });
        expect((await getSellOrderFilePath(sellOrderId)) !== null).toBe(fileUploadedAt !== null);
        expect(await getDeletedSellOrderFilePaths(sellOrderId)).toEqual(deletedFilePaths);
        await expect(getButtonFile(formSellOrder)).toBeEnabled({ enabled: fileUploadedAt !== null });
      }
    });

    await test.step("a sell order created without a file has none", async () => {
      const client = getMockClientById(sellOrderWithFile.clientId)!;
      const newSellOrderId = Math.max(...mockSellOrders.map((sellOrder) => sellOrder.id)) + 1;
      await page.goto("/create-sell-order");
      const comboboxClient = getFormInputByLabel(page, CLIENT_LABEL, InputElementType.Combobox);
      await openCombobox(comboboxClient);
      await fillComboboxFilter(page, client.name);
      await clickInComboboxOption(page, client.name);
      await workflowSubmitSellOrder(page);
      await expect(page).toHaveURL(`/sell-order/${newSellOrderId}`);

      expect((await getSellOrderById(newSellOrderId))?.fileUploadedAt).toBeNull();
      expect(await getSellOrderFilePath(newSellOrderId)).toBeNull();
      await expect(getButtonFile(await workflowOpenSellOrder(page, newSellOrderId))).toBeDisabled();
    });
  },
);

test(
  "the files changed outside the app do not match the sell orders",
  { annotation: [TestAnnotations.ResetSellOrders, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page }) => {
    await test.step("a file copied by hand is not shown until it is uploaded", async () => {
      fs.copyFileSync(SAMPLE_PDF_PATH, (await getSellOrderPath({ sellOrderId: sellOrderWithoutFile.id }))!);
      await expect(getButtonFile(await workflowOpenSellOrder(page, sellOrderWithoutFile.id))).toBeDisabled();
    });

    await test.step("deleting a file removed by hand fails and keeps reporting it", async () => {
      fs.rmSync((await getSellOrderFilePath(sellOrderWithFile.id))!);
      const dialogFile = await workflowOpenSellOrderFile(
        page,
        getButtonFile(await workflowOpenSellOrder(page, sellOrderWithFile.id)),
      );
      await workflowDeleteSellOrderFile(page, dialogFile, ToastType.Error);

      expect(await getSellOrderById(sellOrderWithFile.id)).toEqual(sellOrderWithFile);
      expect(await getDeletedSellOrderFilePaths(sellOrderWithFile.id)).toEqual([]);
    });
  },
);
