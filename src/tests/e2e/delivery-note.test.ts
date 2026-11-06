import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import { UserMode } from "@/contexts/app-context";
import { getDeliveryNote } from "@/db/functions/delivery-note";
import { getDeliveryNoteLine, getDeliveryNoteLinesByDeliveryNoteId } from "@/db/functions/delivery-note-line";
import { getInvoiceById } from "@/db/functions/invoice";
import { getSellOrderLineById } from "@/db/functions/sell-order-line";
import { dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice, dbTableSellOrderLine } from "@/db/schema";
import { isSameAppDay } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents, getLinesTotalInCents } from "@/lib/prices";
import { SELECT_PART_PLACEHOLDER } from "@/messages/combobox";
import {
  PRICE_LABEL,
  CLIENT_LABEL,
  DATE_LABEL,
  DELIVERY_METHOD_LABEL,
  DESCRIPTION_LABEL,
  PART_LABEL,
  QUANTITY_LABEL,
} from "@/messages/common";
import { DELIVERY_NOTE_NUMBER_LABEL } from "@/messages/delivery-note";
import { CLIENT_REFERENCE_DESCRIPTION_LABEL } from "@/messages/part";
import type { TTableDeliveryNoteState } from "@/schemas/delivery-note";
import {
  MOCK_INITIAL_DATE,
  mockClients,
  mockDeliveryMethods,
  mockDeliveryNoteLines,
  mockDeliveryNotes,
  mockPartPrices,
  mockParts,
  mockSellOrders,
} from "@/tests/mock-data";
import { countTestIdInsertions, getTestId, trackSubsetSnapshots } from "@/tests/utils/components";
import {
  assertComboboxValue,
  clickInComboboxOption,
  getClearComboboxButton,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { getDateInputValue } from "@/tests/utils/components/date-input";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertPickerPartKeepsNullClientParts,
  clearPicker,
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
  getTableSubrowById,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { TestAnnotations, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockClientParts,
  getMockDeliveryNoteLines,
  getMockDeliveryNotesOfPart,
  getMockPartReferenceById,
  getMockPartReferences,
  getMockSellOrderById,
  getMockSellOrderLineById,
} from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import {
  workflowDeleteDeliveryNote,
  workflowEditDeliveryNoteLineQuantity,
  workflowFillCustomDeliveryNoteLine,
  workflowOpenCreateDeliveryNoteLine,
  workflowOpenEditDeliveryNote,
} from "@/tests/workflows/delivery-note";
import { workflowPrintTag } from "@/tests/workflows/tag";
import { ToastType } from "@/types";

let tableDeliveryNotes: Locator;
let dialogCreateEditDeliveryNote: Locator;
let dialogCreateDeliveryNoteLine: Locator;

test.beforeEach(({ page }) => {
  tableDeliveryNotes = page.getByTestId("table-delivery-note");
  dialogCreateEditDeliveryNote = page.getByTestId("dialog-create-edit-delivery-note");
  dialogCreateDeliveryNoteLine = page.getByTestId("dialog-create-delivery-note-line");
});

test(
  "manage the delivery notes",
  { annotation: [TestAnnotations.NonEmptyErrorsLogFile, TestAnnotations.ResetTags] },
  async ({ page, db, toasts }) => {
    await test.step("show query error dialog when navigating to unexisting delivery note", async () => {
      await page.goto(`/delivery-note?editDeliveryNoteId=${mockDeliveryNotes.length + 1}`);

      await expect(dialogCreateEditDeliveryNote).not.toBeVisible();
      const dialogGetDeliveryNoteByIdQueryError = page.getByTestId("dialog-error-get-delivery-note-by-id-query");
      await expect(dialogGetDeliveryNoteByIdQueryError).toBeVisible();
      await dialogGetDeliveryNoteByIdQueryError.getByTestId("button-close").click();
      await expect(dialogGetDeliveryNoteByIdQueryError).not.toBeVisible();
      await expect(page).toHaveURL("/delivery-note");
    });

    await test.step("show query error dialog when opening the page of an unexisting delivery note", async () => {
      await page.goto(`/delivery-note/${mockDeliveryNotes.length + 1}`);

      const dialogGetDeliveryNoteByIdQueryError = page.getByTestId("dialog-error-get-delivery-note-by-id-query");
      await expect(dialogGetDeliveryNoteByIdQueryError).toBeVisible();
      await dialogGetDeliveryNoteByIdQueryError.getByTestId("button-close").click();
      await expect(dialogGetDeliveryNoteByIdQueryError).not.toBeVisible();
      await expect(page).toHaveURL("/delivery-note");
    });

    for (const deliveryNote of mockDeliveryNotes) {
      await test.step(`check the displayed data of the delivery note ${deliveryNote.id}`, async () => {
        const deliveryNoteLines = mockDeliveryNoteLines.filter((l) => l.deliveryNoteId === deliveryNote.id);
        const deliveryNoteClient = mockClients.find((c) => c.id === deliveryNote.clientId);
        expect(deliveryNoteClient).toBeDefined();
        const deliveryNoteDeliveryMethod = mockDeliveryMethods.find((m) => m.id === deliveryNote.deliveryMethodId);

        await page.goto("/delivery-note");
        await expect(tableDeliveryNotes).toBeVisible();

        const rowDeliveryNote = getTableRowByTestId(tableDeliveryNotes, deliveryNote.id);
        await expect(rowDeliveryNote).toBeVisible();

        await assertTableRowCount(tableDeliveryNotes, mockDeliveryNotes.length);

        await expect(rowDeliveryNote.getByTestId("id")).toHaveText(String(deliveryNote.id));
        await expect(rowDeliveryNote.getByTestId("client")).toHaveText(deliveryNoteClient!.name);
        await expect(rowDeliveryNote.getByTestId("linesCount")).toHaveText(String(deliveryNoteLines.length));
        await expect(rowDeliveryNote.getByTestId("deliveryDate")).toHaveText(formatDate(deliveryNote.deliveryDate)!);

        await rowDeliveryNote.getByTestId("button-expander").click();

        const subrow = getTableSubrowById(tableDeliveryNotes, deliveryNote.id);
        await expect(subrow).toBeVisible();
        await assertFormLoaded(subrow);
        await expect(getFormInputByLabel(subrow, DELIVERY_NOTE_NUMBER_LABEL, InputElementType.Number)).toHaveValue(
          String(deliveryNote.id),
        );
        await expect(getFormInputByLabel(subrow, DATE_LABEL, InputElementType.Date)).toHaveText(
          formatDate(deliveryNote.deliveryDate)!,
        );
        await expect(getFormInputByLabel(subrow, CLIENT_LABEL, InputElementType.Combobox)).toHaveText(
          deliveryNoteClient!.name,
        );
        const comboboxDeliveryMethod = getFormInputByLabel(subrow, DELIVERY_METHOD_LABEL, InputElementType.Combobox);
        await assertComboboxValue(
          comboboxDeliveryMethod,
          deliveryNote.deliveryMethodId === null ? null : String(deliveryNote.deliveryMethodId),
        );
        if (deliveryNoteDeliveryMethod !== undefined) {
          await expect(comboboxDeliveryMethod).toHaveText(deliveryNoteDeliveryMethod.name);
        }

        const tableDeliveryNoteLines = subrow.getByTestId("table-delivery-note-line");
        await expect(tableDeliveryNoteLines).toBeVisible();

        for (const line of deliveryNoteLines) {
          const lineRow = getTableRowByTestId(tableDeliveryNoteLines, line.id);
          await expect(lineRow).toBeVisible();
          if (line.partReferenceId !== null) {
            const partReference = getMockPartReferenceById(line.partReferenceId);
            expect(partReference).toBeDefined();
            await expect(lineRow.getByRole("cell", { exact: true, name: partReference!.reference })).toBeVisible();
          }
          await expect(lineRow.getByRole("cell", { exact: true, name: String(line.quantity) })).toBeVisible();
          if (line.sellOrderLineId !== null) {
            const sellOrderLine = getMockSellOrderLineById(line.sellOrderLineId);
            expect(sellOrderLine).toBeDefined();
            const sellOrder = getMockSellOrderById(sellOrderLine!.sellOrderId);
            const displayedSellOrderId = sellOrder!.clientReference ?? String(sellOrder!.id);
            await expect(lineRow.getByRole("cell", { exact: true, name: displayedSellOrderId })).toBeVisible();
          }
        }

        // The Administrador sees the amount of each Línea and of the whole Albarán
        const pricedLines = deliveryNoteLines.map((line) => ({
          id: line.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? getMockSellOrderLineById(line.sellOrderLineId!)?.partPrice ?? null,
        }));
        for (const line of pricedLines) {
          await expect(getTableRowByTestId(tableDeliveryNoteLines, line.id).getByTestId("total")).toHaveText(
            formatCents(getLineTotalInCents(line)),
          );
        }
        await expect(subrow.getByTestId("span-delivery-note-lines-total")).toHaveText(
          `Total sin IVA: ${formatCents(getLinesTotalInCents(pricedLines))}`,
        );
      });
    }

    await test.step("filter delivery note table", async () => {
      await page.goto("/delivery-note");
      await expect(tableDeliveryNotes).toBeVisible();

      const popoverTableDeliveryNotesFilters = tableDeliveryNotes.getByTestId("popover-delivery-note-filters");

      for (const part of mockParts.filter((p) => !p.deletedAt)) {
        const expectedDeliveryNotes = getMockDeliveryNotesOfPart(part.id);

        await popoverTableDeliveryNotesFilters.getByTestId("popover-trigger").click();

        const popoverContentTableDeliveryNotesFilters = getPopoverContent(page);
        await expect(popoverContentTableDeliveryNotesFilters).toBeVisible();

        const pickerPart = getFormInputByLabel(
          popoverContentTableDeliveryNotesFilters,
          PART_LABEL,
          InputElementType.Picker,
        );
        await expect(pickerPart).toBeVisible();

        const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);

        const partRow = getTableRowByTestId(tablePickerPart, part.id);
        await expect(partRow).toBeVisible();
        const buttonSelectPart = partRow.getByTestId("button-success");
        await expect(buttonSelectPart).toBeVisible();
        await buttonSelectPart.click();
        await expect(dialogPickerPartContent).not.toBeVisible();

        if (expectedDeliveryNotes.length === 0) {
          await expect(
            getTableNoDataRow(tableDeliveryNotes),
            "Expect no delivery note rows to be visible",
          ).toBeVisible();
        } else {
          await expect(
            getTableRows(tableDeliveryNotes),
            `Expected ${expectedDeliveryNotes.length} delivery notes for part ${part.id}`,
          ).toHaveCount(expectedDeliveryNotes.length);
          for (const expectedDeliveryNote of expectedDeliveryNotes) {
            await expect(getTableRowByTestId(tableDeliveryNotes, expectedDeliveryNote.id)).toBeVisible();
          }
        }

        await popoverTableDeliveryNotesFilters.getByTestId("button-clear-filters").click();
      }
    });

    await test.step("filter the delivery notes by the client of the client column", async () => {
      await page.goto("/delivery-note");
      await expect(tableDeliveryNotes).toBeVisible();
      await assertTableRowCount(tableDeliveryNotes, mockDeliveryNotes.length);

      const comboboxFilterClient = tableDeliveryNotes.getByTestId("combobox-filter-client");
      await assertComboboxValue(comboboxFilterClient, null);
      // Without a Cliente the trigger only holds its icon, so it is as wide as it is tall
      const emptyTriggerBox = await comboboxFilterClient.getByTestId("button-trigger").boundingBox();
      expect(emptyTriggerBox).not.toBeNull();
      expect(emptyTriggerBox!.width).toBeCloseTo(emptyTriggerBox!.height, 0);

      for (const client of mockClients.filter((c) => c.deletedAt === null)) {
        const expectedDeliveryNotes = mockDeliveryNotes.filter((deliveryNote) => deliveryNote.clientId === client.id);
        expect(expectedDeliveryNotes.length, `Client ${client.id} should have delivery notes`).toBeGreaterThan(0);
        expect(expectedDeliveryNotes.length).toBeLessThan(mockDeliveryNotes.length);

        await openCombobox(comboboxFilterClient);
        await clickInComboboxOption(page, client.name);
        await assertComboboxValue(comboboxFilterClient, String(client.id));

        await assertTableRowCount(tableDeliveryNotes, expectedDeliveryNotes.length);
        for (const expectedDeliveryNote of expectedDeliveryNotes) {
          await expect(getTableRowByTestId(tableDeliveryNotes, expectedDeliveryNote.id)).toBeVisible();
        }
        const tableState = new URL(page.url()).searchParams.get("table-delivery-note");
        expect((JSON.parse(tableState!) as TTableDeliveryNoteState).filters).toEqual([
          { id: "clientId", value: client.id },
        ]);
      }

      await getClearComboboxButton(comboboxFilterClient).click();
      await assertComboboxValue(comboboxFilterClient, null);
      await assertTableRowCount(tableDeliveryNotes, mockDeliveryNotes.length);
    });

    await test.step("the part filter of the delivery notes replaces itself and keeps the rest of the state", async () => {
      await page.goto("/delivery-note");
      await expect(tableDeliveryNotes).toBeVisible();
      const getTableState = () => {
        const tableState = new URL(page.url()).searchParams.get("table-delivery-note");
        return tableState !== null ? (JSON.parse(tableState) as TTableDeliveryNoteState) : undefined;
      };
      const popoverFilters = tableDeliveryNotes.getByTestId("popover-delivery-note-filters");
      const buttonClearFilters = popoverFilters.getByTestId("button-clear-filters");
      const pickerPart = getFormInputByLabel(getPopoverContent(page), PART_LABEL, InputElementType.Picker);
      const pickPartFilter = async (partId: number) => {
        if (!(await pickerPart.isVisible())) {
          await popoverFilters.getByTestId("popover-trigger").click();
        }
        const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
        await getTableRowByTestId(tablePickerPart, partId).getByTestId("button-success").click();
        await expect(dialogPickerPartContent).not.toBeVisible();
      };
      const assertDeliveryNotesOfPart = async (partId: number) => {
        const expectedDeliveryNotes = getMockDeliveryNotesOfPart(partId);
        expect(expectedDeliveryNotes.length, `Part ${partId} should have delivery notes`).toBeGreaterThan(0);
        await assertTableRowCount(tableDeliveryNotes, expectedDeliveryNotes.length);
        for (const expectedDeliveryNote of expectedDeliveryNotes) {
          await expect(getTableRowByTestId(tableDeliveryNotes, expectedDeliveryNote.id)).toBeVisible();
        }
      };

      await tableDeliveryNotes.getByTestId("button-sort-client").click();
      await expect.poll(() => getTableState()?.sorts?.[0]?.id).toBe("client");
      const sorts = getTableState()!.sorts;

      // The button only clears the Artículo, so other filters do not show it
      const inputFilterId = tableDeliveryNotes.getByTestId("input-filter-id");
      for (const deliveryNote of mockDeliveryNotes) {
        await inputFilterId.clear();
        await inputFilterId.pressSequentially(String(deliveryNote.id));
        await assertTableRowCount(tableDeliveryNotes, 1);
        await expect(getTableRowByTestId(tableDeliveryNotes, deliveryNote.id)).toBeVisible();
        await expect(buttonClearFilters).toHaveCount(0);
      }
      await inputFilterId.clear();
      await assertTableRowCount(tableDeliveryNotes, mockDeliveryNotes.length);

      // Picking another Artículo replaces the previous one instead of combining both
      const partsWithDeliveryNotes = mockParts.filter(
        (part) => part.deletedAt === null && getMockDeliveryNotesOfPart(part.id).length > 0,
      );
      expect(partsWithDeliveryNotes.length, "Wrong test set up: Some Artículos should be delivered").toBeGreaterThan(1);
      for (const part of partsWithDeliveryNotes) {
        await pickPartFilter(part.id);
        await assertDeliveryNotesOfPart(part.id);
        expect(getTableState()?.filters).toEqual([{ id: "partId", value: part.id }]);
        expect(getTableState()?.sorts).toEqual(sorts);
      }
      const firstPart = partsWithDeliveryNotes[0];
      const secondPart = partsWithDeliveryNotes.at(-1)!;

      // Reopening the filters shows the active Artículo, and clearing the picker removes it but keeps the sorting
      if (await pickerPart.isVisible()) {
        await page.keyboard.press("Escape");
        await expect(pickerPart).not.toBeVisible();
      }
      await popoverFilters.getByTestId("popover-trigger").click();
      await expect(pickerPart).toHaveAttribute("data-value", String(secondPart.id));
      await clearPicker(pickerPart);
      await expect(buttonClearFilters).toHaveCount(0);
      await expect.poll(() => getTableState()?.filters).toBeUndefined();
      expect(getTableState()?.sorts).toEqual(sorts);

      await pickPartFilter(firstPart.id);
      await assertDeliveryNotesOfPart(firstPart.id);
      await buttonClearFilters.click();
      await expect.poll(() => getTableState()?.filters).toBeUndefined();
      expect(getTableState()?.sorts).toEqual(sorts);

      // A link with the Artículo filter opens with it applied and shown in the picker
      const linkedState: TTableDeliveryNoteState = { filters: [{ id: "partId", value: secondPart.id }] };
      await page.goto(`/delivery-note?table-delivery-note=${encodeURIComponent(JSON.stringify(linkedState))}`);
      await assertDeliveryNotesOfPart(secondPart.id);
      await expect(buttonClearFilters).toBeVisible();
      await popoverFilters.getByTestId("popover-trigger").click();
      await expect(pickerPart).toHaveAttribute("data-value", String(secondPart.id));
    });

    await test.step("filter the part picker without closing it", async () => {
      await page.goto("/delivery-note");
      await expect(tableDeliveryNotes).toBeVisible();

      await tableDeliveryNotes.getByTestId("popover-delivery-note-filters").getByTestId("popover-trigger").click();
      const pickerPart = getFormInputByLabel(getPopoverContent(page), PART_LABEL, InputElementType.Picker);
      const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);

      const activeParts = mockParts.filter((part) => part.deletedAt === null);
      const firstPartById = [...activeParts].sort((a, b) => a.id - b.id)[0];
      await expect(getTableRows(tablePickerPart).first()).toHaveAttribute("data-testid", String(firstPartById.id));

      const inputFilterDescription = tablePickerPart.getByTestId("input-filter-description");
      const partToFilter = activeParts.at(-1)!;
      await inputFilterDescription.fill(partToFilter.description);
      await assertTableRowCount(tablePickerPart, 1);
      await expect(getTableRowByTestId(tablePickerPart, partToFilter.id)).toBeVisible();
      await inputFilterDescription.clear();
      await assertTableRowCount(tablePickerPart, activeParts.length);
      await expect(getTableRows(tablePickerPart).first()).toHaveAttribute("data-testid", String(firstPartById.id));

      const descriptionFilter = "shape 5";
      const descriptionParts = activeParts.filter((part) => part.description.includes(descriptionFilter));
      const getClientParts = (clientId: number) =>
        getMockClientParts({ clientId, includePartReferenceNullClientId: true });
      const getClientDescriptionParts = (clientId: number) =>
        descriptionParts.filter((part) => getClientParts(clientId).some(({ id }) => id === part.id));
      // The description filter should leave out some Artículo of the Cliente and some of other Clientes
      const filterClients = mockClients.filter(
        (client) =>
          client.deletedAt === null &&
          getClientDescriptionParts(client.id).length > 0 &&
          getClientDescriptionParts(client.id).length < descriptionParts.length &&
          getClientDescriptionParts(client.id).length < getClientParts(client.id).length,
      );
      expect(
        filterClients.length,
        "Wrong test set up: The description filter should split some Cliente",
      ).toBeGreaterThan(0);

      for (const filterClient of filterClients) {
        // Without a Cliente the picker shows every Artículo, picking one in its filters keeps the default filters
        const popoverPartFilters = tablePickerPart.getByTestId("popover-part-filters");
        const buttonClearPartFilters = popoverPartFilters.getByTestId("button-clear-filters");
        const selectFilterClient = async () => {
          const popoverTriggerPartFilters = popoverPartFilters.getByTestId("popover-trigger");
          await popoverTriggerPartFilters.click();
          // Scoped to the popover, as the Cliente column of the delivery notes table has its own client filter
          const comboboxFilterClient = getPopoverContent(page).getByTestId("combobox-filter-client");
          await openCombobox(comboboxFilterClient);
          await clickInComboboxOption(page, filterClient.name);
          // The popover stays open when the filter changes, so more filters can be set in a row
          await assertComboboxValue(comboboxFilterClient, String(filterClient.id));
          await expect(buttonClearPartFilters).toBeVisible();
          await popoverTriggerPartFilters.click();
          await expect(comboboxFilterClient).not.toBeVisible();
        };
        await selectFilterClient();
        await assertPickerPartKeepsNullClientParts(tablePickerPart, filterClient.id);

        // Changing the filter of the column or the filter of the Cliente keeps the other one
        const clientParts = getClientParts(filterClient.id);
        const clientDescriptionParts = getClientDescriptionParts(filterClient.id);

        await inputFilterDescription.fill(descriptionFilter);
        await assertTableRowCount(tablePickerPart, clientDescriptionParts.length);
        await buttonClearPartFilters.click();
        await assertTableRowCount(tablePickerPart, descriptionParts.length);
        await expect(inputFilterDescription).toHaveValue(descriptionFilter);
        await selectFilterClient();
        await assertTableRowCount(tablePickerPart, clientDescriptionParts.length);
        await inputFilterDescription.clear();
        await assertTableRowCount(tablePickerPart, clientParts.length);
        await expect(buttonClearPartFilters).toBeVisible();

        await buttonClearPartFilters.click();
        await assertTableRowCount(tablePickerPart, activeParts.length);
      }

      await expect(dialogPickerPartContent).toBeVisible();
      await expect(page).toHaveURL("/delivery-note");
    });

    const pendingDeliveryNotes = mockDeliveryNotes.filter((deliveryNote) => deliveryNote.invoiceId === null);

    await test.step("user should not be able to modify prices of the delivery note lines", async () => {
      await setUserMode(page, UserMode.User);

      for (const deliveryNote of pendingDeliveryNotes) {
        await workflowOpenEditDeliveryNote(page, deliveryNote.id);

        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
        await expect(tableDeliveryNoteLines).toBeVisible();
        await expect(tableDeliveryNoteLines.getByRole("cell", { name: PRICE_LABEL })).not.toBeVisible();
        await expect(dialogCreateEditDeliveryNote.getByTestId("span-delivery-note-lines-total")).toHaveCount(0);

        await workflowOpenCreateDeliveryNoteLine(page);

        await expect(dialogCreateDeliveryNoteLine.getByLabel(PRICE_LABEL)).not.toBeVisible();
        await expect(dialogCreateDeliveryNoteLine.getByTestId("radio-table-part-prices")).toHaveCount(0);

        // A user can still add a Línea, which is left without price for the Administrador to set before invoicing it
        const partReference = getMockPartReferences({ clientId: deliveryNote.clientId }).at(0)!;
        const pickerPart = dialogCreateDeliveryNoteLine.getByTestId("picker-part");
        const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
        await getTableRowByTestId(tablePickerPart, partReference.partId)
          .getByTestId("div-part-reference-row")
          .filter({ hasText: partReference.reference })
          .getByTestId("button-success")
          .click();
        // The closing picker gives the focus back to its trigger, which would swallow the typed quantity
        await expect(dialogPickerPartContent).not.toBeVisible();
        await getFormInputByLabel(
          dialogCreateDeliveryNoteLine,
          QUANTITY_LABEL,
          InputElementType.Number,
        ).pressSequentially("3");
        await dialogCreateDeliveryNoteLine.getByTestId("button-submit").click();
        await expect(dialogCreateDeliveryNoteLine).not.toBeVisible();
        await expect(toasts).toHaveCount(1);
        await clearToasts(page);

        const userDeliveryNoteLine = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).find(
          (line) => !mockDeliveryNoteLines.some((mockLine) => mockLine.id === line.id),
        );
        expect(userDeliveryNoteLine).toMatchObject({
          partReferenceId: partReference.id,
          quantity: 3,
          sellOrderLineId: null,
          unitPrice: null,
        });
      }

      await setUserMode(page, UserMode.Admin);
    });

    await test.step("a price sent by an admin is rejected if the session changes to user meanwhile", async () => {
      const deliveryNote = pendingDeliveryNotes[0];
      const deliveryNoteLines = await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id);
      const userDeliveryNoteLine = deliveryNoteLines.find(
        (line) => line.sellOrderLineId === null && line.unitPrice === null,
      )!;
      expect(userDeliveryNoteLine).toBeDefined();
      const assertRejected = async (message: string) => {
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Error);
        await expect(toasts.first()).toContainText(message);
        await clearToasts(page);
        await setUserMode(page, UserMode.Admin);
      };

      await workflowOpenEditDeliveryNote(page, deliveryNote.id);
      const buttonSubmitLine = await workflowFillCustomDeliveryNoteLine(page, {
        description: "Portes",
        quantity: 1,
        unitPrice: "5",
      });
      await holdRequestWhile({
        page,
        procedurePath: "deliveryNoteLine.create",
        send: async () => buttonSubmitLine.click(),
        meanwhile: async () => setUserMode(page, UserMode.User),
      });
      await assertRejected("Solo el Administrador puede poner el precio de una Línea del Albarán");
      expect(await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).toHaveLength(deliveryNoteLines.length);

      await workflowOpenEditDeliveryNote(page, deliveryNote.id);
      const inputUnitPrice = getEditableCellById(
        getTableRowByTestId(
          dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
          userDeliveryNoteLine.id,
        ),
        "unitPrice",
      );
      await inputUnitPrice.pressSequentially("5");
      await holdRequestWhile({
        page,
        procedurePath: "deliveryNoteLine.updatePrice",
        send: async () => inputUnitPrice.blur(),
        meanwhile: async () => setUserMode(page, UserMode.User),
      });
      await assertRejected("Esta acción solo la puede hacer el Administrador");
      expect((await getDeliveryNoteLine({ id: userDeliveryNoteLine.id }))?.unitPrice).toBeNull();
    });

    await test.step("an admin sets the price of the delivery note lines, over the one of their sell order line", async () => {
      expect(
        pendingDeliveryNotes.some((deliveryNote) =>
          getMockDeliveryNoteLines(deliveryNote.id).some((line) => line.sellOrderLineId !== null),
        ),
        "Wrong test set up: Some pending Albarán should serve a Pedido de venta",
      ).toBe(true);

      for (const deliveryNote of pendingDeliveryNotes) {
        const userDeliveryNoteLine = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).find(
          (line) => line.sellOrderLineId === null && line.unitPrice === null,
        )!;
        expect(userDeliveryNoteLine).toBeDefined();
        const newUnitPrice = "12.5";

        await workflowOpenEditDeliveryNote(page, deliveryNote.id);
        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");

        // A Línea from a Pedido de venta takes its price until it is given its own, like the one agreed on delivery
        for (const linkedDeliveryNoteLine of getMockDeliveryNoteLines(deliveryNote.id).filter(
          (line) => line.sellOrderLineId !== null && line.unitPrice === null,
        )) {
          const linkedSellOrderLine = getMockSellOrderLineById(linkedDeliveryNoteLine.sellOrderLineId!)!;
          const linkedUnitPrice = (Number(linkedSellOrderLine.partPrice ?? 0) + 1.25).toFixed(2);
          const inputLinkedUnitPrice = getEditableCellById(
            getTableRowByTestId(tableDeliveryNoteLines, linkedDeliveryNoteLine.id),
            "unitPrice",
          );
          await expect(inputLinkedUnitPrice).toHaveValue(
            linkedSellOrderLine.partPrice === null
              ? ""
              : formatPrice(linkedSellOrderLine.partPrice, { replaceNBSP: true }),
          );
          await inputLinkedUnitPrice.clear();
          await inputLinkedUnitPrice.pressSequentially(linkedUnitPrice);
          await inputLinkedUnitPrice.blur();
          await expect(toasts).toHaveCount(1);
          expect(await getToastType(toasts.first())).toBe(ToastType.Success);
          await clearToasts(page);
          expect(await getDeliveryNoteLine({ id: linkedDeliveryNoteLine.id })).toMatchObject({
            sellOrderLineId: linkedSellOrderLine.id,
            unitPrice: linkedUnitPrice,
          });
          await expect(inputLinkedUnitPrice).toHaveValue(formatPrice(linkedUnitPrice, { replaceNBSP: true }));
          await expect(
            getTableRowByTestId(tableDeliveryNoteLines, linkedDeliveryNoteLine.id).getByTestId("total"),
          ).toHaveText(
            formatCents(getLineTotalInCents({ quantity: linkedDeliveryNoteLine.quantity, unitPrice: linkedUnitPrice })),
          );
          expect((await getSellOrderLineById(linkedSellOrderLine.id))?.partPrice).toBe(linkedSellOrderLine.partPrice);
        }

        const inputUnitPrice = getEditableCellById(
          getTableRowByTestId(tableDeliveryNoteLines, userDeliveryNoteLine.id),
          "unitPrice",
        );
        await expect(inputUnitPrice).toHaveValue("");
        await inputUnitPrice.pressSequentially(newUnitPrice);
        await inputUnitPrice.blur();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);
        expect(Number((await getDeliveryNoteLine({ id: userDeliveryNoteLine.id }))?.unitPrice)).toBe(
          Number(newUnitPrice),
        );

        // Once set, a price can be changed but not removed
        await inputUnitPrice.clear();
        await inputUnitPrice.blur();
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Error);
        await clearToasts(page);
        expect(Number((await getDeliveryNoteLine({ id: userDeliveryNoteLine.id }))?.unitPrice)).toBe(
          Number(newUnitPrice),
        );
      }
    });

    await test.step("changing the price of a line of an invoiced delivery note marks its invoice to be sent again", async () => {
      const unpricedInvoicedLines = mockDeliveryNoteLines.filter(
        (line) =>
          line.sellOrderLineId === null &&
          line.unitPrice === null &&
          mockDeliveryNotes.find((note) => note.id === line.deliveryNoteId)?.invoiceId !== null,
      );
      expect(
        unpricedInvoicedLines.length,
        "Wrong test set up: Some invoiced Línea should have no price",
      ).toBeGreaterThan(0);

      for (const [index, unpricedMockLine] of unpricedInvoicedLines.entries()) {
        const unitPrice = 7 + index;
        const invoicedDeliveryNote = mockDeliveryNotes.find((note) => note.id === unpricedMockLine.deliveryNoteId)!;
        await db
          .update(dbTableInvoice)
          .set({ sent: true })
          .where(eq(dbTableInvoice.id, invoicedDeliveryNote.invoiceId!));

        await workflowOpenEditDeliveryNote(page, invoicedDeliveryNote.id);
        const inputUnitPrice = getEditableCellById(
          getTableRowByTestId(
            dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
            unpricedMockLine.id,
          ),
          "unitPrice",
        );
        await inputUnitPrice.pressSequentially(String(unitPrice));
        await inputUnitPrice.blur();

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);
        expect(Number((await getDeliveryNoteLine({ id: unpricedMockLine.id }))?.unitPrice)).toBe(unitPrice);
        expect(await getInvoiceById(invoicedDeliveryNote.invoiceId!)).toMatchObject({ accounted: false, sent: false });
      }
    });

    for (const deliveryNote of pendingDeliveryNotes) {
      await test.step(`edit the delivery note ${deliveryNote.id}`, async () => {
        const deliveryNoteClient = mockClients.find((c) => c.id === deliveryNote.clientId);
        expect(deliveryNoteClient).toBeDefined();
        const deliveryNoteLines = mockDeliveryNoteLines.filter((l) => l.deliveryNoteId === deliveryNote.id);

        await workflowOpenEditDeliveryNote(page, deliveryNote.id);
        await expect(dialogCreateEditDeliveryNote.getByTestId("button-submit")).toBeDisabled();

        await expect(
          getFormInputByLabel(dialogCreateEditDeliveryNote, DELIVERY_NOTE_NUMBER_LABEL, InputElementType.Number),
        ).toHaveValue(String(deliveryNote.id));
        await expect(
          getFormInputByLabel(dialogCreateEditDeliveryNote, DATE_LABEL, InputElementType.Date),
        ).toBeVisible();
        const actualDate = await getDateInputValue(
          getFormInputByLabel(dialogCreateEditDeliveryNote, DATE_LABEL, InputElementType.Date),
        );
        expect(actualDate).toBeDefined();
        expect(isSameAppDay(actualDate!, deliveryNote.deliveryDate!)).toBeTruthy();

        await assertComboboxValue(
          getFormInputByLabel(dialogCreateEditDeliveryNote, CLIENT_LABEL, InputElementType.Combobox),
          String(deliveryNoteClient!.id),
        );
        const comboboxDeliveryMethod = getFormInputByLabel(
          dialogCreateEditDeliveryNote,
          DELIVERY_METHOD_LABEL,
          InputElementType.Combobox,
        );
        await assertComboboxValue(
          comboboxDeliveryMethod,
          deliveryNote.deliveryMethodId === null ? null : String(deliveryNote.deliveryMethodId),
        );
        await expect(comboboxDeliveryMethod.getByTestId("tooltip-deleted")).toHaveCount(0);

        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
        await expect(tableDeliveryNoteLines).toBeVisible();
        // A previous step added a Línea to every pending Albarán
        await assertTableRowCount(
          tableDeliveryNoteLines,
          (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).length,
        );

        for (const deliveryNoteLine of deliveryNoteLines) {
          const existingDeliveryNoteLineRow = getTableRowByTestId(tableDeliveryNoteLines, deliveryNoteLine.id);
          await expect(existingDeliveryNoteLineRow).toBeVisible();

          const newPartQuantity = String(deliveryNoteLine.quantity + 10);
          const inputQuantity = await workflowEditDeliveryNoteLineQuantity(
            page,
            deliveryNoteLine.id,
            Number(newPartQuantity),
          );

          await expect(toasts).toHaveCount(1);
          expect(await getToastType(toasts.first())).toBe(ToastType.Success);
          await clearToasts(page);

          let updatedDeliveryNoteLine = await getDeliveryNoteLine({ id: deliveryNoteLine.id });
          expect(updatedDeliveryNoteLine).toBeDefined();
          expect(updatedDeliveryNoteLine!.quantity).toBe(Number(newPartQuantity));

          // A Línea del Albarán always carries a quantity, so clearing it is rejected and the cell shows the saved one again
          await inputQuantity.clear();
          await inputQuantity.blur();

          await expect(toasts).toHaveCount(1);
          expect(await getToastType(toasts.first())).toBe(ToastType.Error);
          await clearToasts(page);
          await expect(inputQuantity).toHaveValue(newPartQuantity);

          updatedDeliveryNoteLine = await getDeliveryNoteLine({ id: deliveryNoteLine.id });
          expect(updatedDeliveryNoteLine).toBeDefined();
          expect(updatedDeliveryNoteLine!.quantity).toBe(Number(newPartQuantity));
        }
      });
    }

    for (const deliveryNote of pendingDeliveryNotes) {
      const deliveryNoteClient = mockClients.find((c) => c.id === deliveryNote.clientId)!;
      const clientParts = getMockClientParts({
        clientId: deliveryNoteClient.id,
        includePartReferenceNullClientId: true,
      });
      // The price of the Cliente for the typed quantity is filled in, as in the Líneas of a Pedido de venta
      const getClientPartPrice = (partId: number) =>
        mockPartPrices.find(
          (partPrice) =>
            partPrice.partId === partId &&
            partPrice.clientId === deliveryNoteClient.id &&
            partPrice.price !== null &&
            partPrice.quantity !== null,
        );
      const pricedClientParts = clientParts.filter(
        (part) =>
          getClientPartPrice(part.id) !== undefined &&
          getMockPartReferences({ clientId: deliveryNoteClient.id, partId: part.id }).length > 0,
      );
      expect(pricedClientParts.length, "Some Artículo should have a price of the Cliente").toBeGreaterThan(0);

      for (const partToBeAdded of pricedClientParts) {
        await test.step(`add the article ${partToBeAdded.id} to the delivery note ${deliveryNote.id}`, async () => {
          const pickedPartReference = getMockPartReferences({
            clientId: deliveryNoteClient.id,
            partId: partToBeAdded.id,
          })[0];
          const clientPartPrice = getClientPartPrice(partToBeAdded.id)!;
          const newQuantity = clientPartPrice.quantity!;

          await workflowOpenEditDeliveryNote(page, deliveryNote.id);

          const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
          const existingDbLineIds = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).map(
            (line) => line.id,
          );
          await expect(tableDeliveryNoteLines).toBeVisible();
          await assertTableRowCount(tableDeliveryNoteLines, existingDbLineIds.length);

          await workflowOpenCreateDeliveryNoteLine(page);

          const pickerPart = dialogCreateDeliveryNoteLine.getByTestId("picker-part");
          const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
          expect(await getPickerValue(pickerPart)).toBeNull();

          expect(await getTableRows(tablePickerPart).count()).toBe(clientParts.length);

          // Assert that the part picker is displaying the client parts
          const partRowIds = await Promise.all(
            (await getTableRows(tablePickerPart).all()).map(async (row) => getTestId(row)),
          );
          expect(partRowIds.sort((a, b) => a - b)).toEqual(clientParts.map((part) => part.id).sort((a, b) => a - b));

          await assertPickerPartKeepsNullClientParts(tablePickerPart, deliveryNoteClient.id);

          // An Artículo may have several Referencias of the Cliente, each one is picked from its own row
          const pickedReferenceRow = getTableRowByTestId(tablePickerPart, partToBeAdded.id)
            .getByTestId("div-part-reference-row")
            .filter({ hasText: pickedPartReference.reference });
          await expect(pickedReferenceRow).toBeVisible();
          await pickedReferenceRow.getByTestId("button-success").click();
          await expect(dialogPickerPartContent).not.toBeVisible();

          expect(await getPickerValue(pickerPart)).toBe(String(partToBeAdded.id));
          expect(await getPickerText(pickerPart)).toEqual(pickedPartReference.reference);

          // The picked part can be cleared and picked again
          await clearPicker(pickerPart);
          expect(await getPickerValue(pickerPart)).toBeNull();
          expect(await getPickerText(pickerPart)).toBe(SELECT_PART_PLACEHOLDER);

          await openPicker(pickerPart);
          await expect(dialogPickerPartContent).toBeVisible();
          await pickedReferenceRow.getByTestId("button-success").click();
          await expect(dialogPickerPartContent).not.toBeVisible();

          expect(await getPickerValue(pickerPart)).toBe(String(partToBeAdded.id));

          // Expect that the client description input has been autofilled after picking the part
          const inputDescription = getFormInputByLabel(
            dialogCreateDeliveryNoteLine,
            CLIENT_REFERENCE_DESCRIPTION_LABEL,
            InputElementType.Input,
          );
          expect(await inputDescription.inputValue()).toBe(pickedPartReference.clientDescription);

          const inputQuantity = getFormInputByLabel(
            dialogCreateDeliveryNoteLine,
            QUANTITY_LABEL,
            InputElementType.Number,
          );
          await inputQuantity.clear();
          await inputQuantity.pressSequentially(String(newQuantity));
          await inputQuantity.blur();

          await expect(
            getFormInputByLabel(dialogCreateDeliveryNoteLine, PRICE_LABEL, InputElementType.Number),
          ).toHaveValue(formatPrice(clientPartPrice.price, { replaceNBSP: true }));
          await expect(
            getTableRowByTestId(
              dialogCreateDeliveryNoteLine.getByTestId("radio-table-part-prices"),
              clientPartPrice.id,
            ),
          ).toBeVisible();

          await dialogCreateDeliveryNoteLine.getByTestId("button-submit").click();

          await expect(dialogCreateDeliveryNoteLine).not.toBeVisible();
          await expect(toasts).toHaveCount(1);
          await clearToasts(page);
          const newDbLines = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).filter(
            (line) => !existingDbLineIds.includes(line.id),
          );
          expect(newDbLines).toHaveLength(1);
          expect(newDbLines[0]).toMatchObject({
            deliveryNoteId: deliveryNote.id,
            partReferenceId: pickedPartReference.id,
            sellOrderLineId: null,
          });
          expect(Number(newDbLines[0].unitPrice)).toBe(Number(clientPartPrice.price));

          // A line added by hand belongs to no Pedido de venta and can still be tagged
          const addedDeliveryNoteLineRow = getTableRowByTestId(tableDeliveryNoteLines, newDbLines[0].id);
          await expect(addedDeliveryNoteLineRow.getByTestId("button-print-tag")).toBeVisible();

          await page.goto(`/delivery-note?editDeliveryNoteId=${deliveryNote.id}&createDeliveryNoteLine=true`);
          await expect(dialogCreateDeliveryNoteLine).toBeVisible();
        });
      }
    }

    // A reference without Cliente of an Artículo that has no Referencia of the Cliente of the Albarán, but has one of
    // another Cliente
    const nullClientReferenceCases = pendingDeliveryNotes.flatMap((deliveryNote) =>
      getMockPartReferences({ includeNullClientId: true })
        .filter(
          (partReference) =>
            getMockPartReferences({ clientId: deliveryNote.clientId, partId: partReference.partId }).length === 0 &&
            getMockPartReferences({ partId: partReference.partId }).some(
              (otherPartReference) =>
                otherPartReference.clientId !== null && otherPartReference.clientId !== deliveryNote.clientId,
            ),
        )
        .map((nullClientPartReference) => ({ deliveryNote, nullClientPartReference })),
    );
    expect(nullClientReferenceCases.length, "Wrong test set up: Some reference without client").toBeGreaterThan(0);

    for (const { deliveryNote, nullClientPartReference } of nullClientReferenceCases) {
      await test.step(`add the reference without client ${nullClientPartReference.id} to the delivery note ${deliveryNote.id}`, async () => {
        const part = mockParts.find((mockPart) => mockPart.id === nullClientPartReference.partId)!;
        const otherClientPartReference = getMockPartReferences({ partId: part.id }).find(
          (partReference) => partReference.clientId !== null && partReference.clientId !== deliveryNote.clientId,
        )!;
        expect(otherClientPartReference, "The Artículo should also have a reference of another client").toBeDefined();
        const quantity = 1234;

        await workflowOpenEditDeliveryNote(page, deliveryNote.id);
        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
        const existingDbLineIds = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).map((line) => line.id);

        await workflowOpenCreateDeliveryNoteLine(page);

        const pickerPart = dialogCreateDeliveryNoteLine.getByTestId("picker-part");
        const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(page, pickerPart);
        // The Cliente is fixed by the Albarán, so the picker has no part filters to change
        await expect(tablePickerPart.getByTestId("popover-part-filters")).toHaveCount(0);

        // Only the reference without Cliente can be picked, the one of the other Cliente is just shown
        const referenceRows = getTableRowByTestId(tablePickerPart, part.id).getByTestId("div-part-reference-row");
        const otherClientReferenceRow = referenceRows.filter({ hasText: otherClientPartReference.reference });
        await expect(otherClientReferenceRow).toBeVisible();
        await expect(otherClientReferenceRow.getByTestId("button-success")).toHaveCount(0);
        await referenceRows
          .filter({ hasText: nullClientPartReference.reference })
          .getByTestId("button-success")
          .click();

        await expect(dialogPickerPartContent).not.toBeVisible();
        expect(await getPickerValue(pickerPart)).toBe(String(part.id));
        expect(await getPickerText(pickerPart)).toEqual(nullClientPartReference.reference);

        // Without a client description, the description of the Artículo is used
        const inputDescription = getFormInputByLabel(
          dialogCreateDeliveryNoteLine,
          CLIENT_REFERENCE_DESCRIPTION_LABEL,
          InputElementType.Input,
        );
        await expect(inputDescription).toHaveValue(nullClientPartReference.clientDescription);

        const inputQuantity = getFormInputByLabel(
          dialogCreateDeliveryNoteLine,
          QUANTITY_LABEL,
          InputElementType.Number,
        );
        await inputQuantity.clear();
        await inputQuantity.pressSequentially(String(quantity));
        await dialogCreateDeliveryNoteLine.getByTestId("button-submit").click();
        await expect(dialogCreateDeliveryNoteLine).not.toBeVisible();

        const newDbLines = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).filter(
          (line) => !existingDbLineIds.includes(line.id),
        );
        expect(newDbLines).toHaveLength(1);
        // No price of the Artículo matches the quantity, so the Administrador leaves the price for later
        expect(newDbLines[0]).toMatchObject({
          description: nullClientPartReference.clientDescription,
          partReferenceId: nullClientPartReference.id,
          quantity,
          sellOrderLineId: null,
          unitPrice: null,
        });

        const rowDeliveryNoteLine = getTableRowByTestId(tableDeliveryNoteLines, newDbLines[0].id);
        await expect(rowDeliveryNoteLine.getByTestId("partReference")).toHaveText(nullClientPartReference.reference);
        await expect(rowDeliveryNoteLine.getByTestId("description")).toContainText(
          nullClientPartReference.clientDescription,
        );
      });
    }

    for (const deliveryNote of pendingDeliveryNotes) {
      await test.step(`add a custom line without article to the delivery note ${deliveryNote.id}`, async () => {
        const customLine = { description: "Portes", quantity: 2, unitPrice: "15.5" };

        await workflowOpenEditDeliveryNote(page, deliveryNote.id);
        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
        const existingDbLineIds = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).map((line) => line.id);

        await workflowOpenCreateDeliveryNoteLine(page);
        const checkboxCustomLine = dialogCreateDeliveryNoteLine.getByTestId("checkbox-custom-line");
        const pickerPart = dialogCreateDeliveryNoteLine.getByTestId("picker-part");
        const inputDescription = getFormInputByLabel(dialogCreateDeliveryNoteLine, DESCRIPTION_LABEL);
        const buttonSubmit = dialogCreateDeliveryNoteLine.getByTestId("button-submit");
        const requiredFieldErrors = dialogCreateDeliveryNoteLine.getByText("Campo obligatorio");

        await checkboxCustomLine.click();
        await expect(checkboxCustomLine).toBeChecked();
        await expect(pickerPart).toHaveCount(0);
        // Without an Artículo there are no prices to pick from
        await expect(getDivDisabledMessage(dialogCreateDeliveryNoteLine.getByTestId("card-part-prices"))).toBeVisible();

        // The description and the price are typed by hand, and they are dropped when switching to a line with Artículo
        const inputUnitPrice = getFormInputByLabel(dialogCreateDeliveryNoteLine, PRICE_LABEL, InputElementType.Number);
        await inputDescription.fill(customLine.description);
        await inputUnitPrice.pressSequentially(customLine.unitPrice);
        await checkboxCustomLine.click();
        await expect(pickerPart).toBeVisible();
        await expect(inputUnitPrice).toHaveValue("");
        await checkboxCustomLine.click();
        await expect(inputDescription).toHaveValue("");

        await getFormInputByLabel(
          dialogCreateDeliveryNoteLine,
          QUANTITY_LABEL,
          InputElementType.Number,
        ).pressSequentially(String(customLine.quantity));
        await buttonSubmit.click();
        await expect(requiredFieldErrors).toHaveCount(1);

        await inputDescription.fill(customLine.description);
        await inputUnitPrice.pressSequentially(customLine.unitPrice);
        await buttonSubmit.click();
        await expect(dialogCreateDeliveryNoteLine).not.toBeVisible();
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);

        const newDbLines = (await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).filter(
          (line) => !existingDbLineIds.includes(line.id),
        );
        expect(newDbLines).toHaveLength(1);
        expect(newDbLines[0]).toMatchObject({
          description: customLine.description,
          partReferenceId: null,
          quantity: customLine.quantity,
          sellOrderLineId: null,
        });
        expect(Number(newDbLines[0].unitPrice)).toBe(Number(customLine.unitPrice));

        const rowCustomLine = getTableRowByTestId(tableDeliveryNoteLines, newDbLines[0].id);
        await expect(rowCustomLine.getByTestId("partReference")).toHaveText("");
        await expect(rowCustomLine.getByTestId("description")).toContainText(customLine.description);
        await expect(getEditableCellById(rowCustomLine, "unitPrice")).toBeVisible();

        // The tag of a line without Artículo is printed with its description
        await workflowPrintTag(
          page,
          rowCustomLine,
          path.join(process.env.TAGS_ROOT_PATH!, `delivery-note-line-${newDbLines[0].id}.pdf`),
        );
      });
    }

    for (const deliveryNoteLine of pendingDeliveryNotes.flatMap((deliveryNote) =>
      getMockDeliveryNoteLines(deliveryNote.id),
    )) {
      await test.step(`print the tags of the delivery note line ${deliveryNoteLine.id}`, async () => {
        const deliveryNote = mockDeliveryNotes.find(
          (mockDeliveryNote) => mockDeliveryNote.id === deliveryNoteLine.deliveryNoteId,
        )!;
        const tagFilePath = path.join(process.env.TAGS_ROOT_PATH!, `delivery-note-line-${deliveryNoteLine.id}.pdf`);

        await workflowOpenEditDeliveryNote(page, deliveryNote.id);

        const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
        await expect(tableDeliveryNoteLines).toBeVisible();

        await workflowPrintTag(page, getTableRowByTestId(tableDeliveryNoteLines, deliveryNoteLine.id), tagFilePath);
      });
    }

    const activeDeliveryMethods = mockDeliveryMethods.filter((deliveryMethod) => deliveryMethod.deletedAt === null);
    for (const [index, deliveryNoteClient] of mockClients.filter((client) => client.deletedAt === null).entries()) {
      const deliveryMethod = activeDeliveryMethods[index % activeDeliveryMethods.length];
      await test.step(`create a new delivery note of ${deliveryNoteClient.name}, numbered by the database after a deleted one`, async () => {
        // The identity never reuses a deleted id, so the number after it is shown instead of the gap it leaves
        const [deletedDeliveryNote] = await db
          .insert(dbTableDeliveryNote)
          .values({ clientId: deliveryNoteClient.id, createdAt: MOCK_INITIAL_DATE })
          .returning();
        await db.delete(dbTableDeliveryNote).where(eq(dbTableDeliveryNote.id, deletedDeliveryNote.id));

        const waitForSubsetSnapshots = trackSubsetSnapshots(page);
        await page.goto("/delivery-note?createDeliveryNote=true");
        await expect(dialogCreateEditDeliveryNote).toBeVisible();
        // The dialog reopened after creating it must not take the new Albarán for a missing one while it syncs
        const countGetDeliveryNoteByIdQueryErrors = await countTestIdInsertions(
          page,
          "dialog-error-get-delivery-note-by-id-query",
        );

        const cardTableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("card-table-delivery-note-line");
        await expect(getDivDisabledMessage(cardTableDeliveryNoteLines)).toBeVisible();
        await expect(cardTableDeliveryNoteLines).toHaveAttribute("inert");

        const inputDeliveryNoteId = getFormInputByLabel(
          dialogCreateEditDeliveryNote,
          DELIVERY_NOTE_NUMBER_LABEL,
          InputElementType.Number,
        );
        await expect(inputDeliveryNoteId).toHaveValue(String(deletedDeliveryNote.id + 1));

        // Another user takes the shown number while the dialog is open
        await waitForSubsetSnapshots();
        const [otherUserDeliveryNote] = await db
          .insert(dbTableDeliveryNote)
          .values({ clientId: deliveryNoteClient.id, createdAt: MOCK_INITIAL_DATE })
          .returning();
        expect(otherUserDeliveryNote.id).toBe(deletedDeliveryNote.id + 1);
        const newDeliveryNoteId = otherUserDeliveryNote.id + 1;
        await expect(inputDeliveryNoteId).toHaveValue(String(newDeliveryNoteId));
        await db.delete(dbTableDeliveryNote).where(eq(dbTableDeliveryNote.id, otherUserDeliveryNote.id));
        await expect(
          getFormInputByLabel(dialogCreateEditDeliveryNote, DATE_LABEL, InputElementType.Date),
        ).toBeVisible();
        const actualDate = await getDateInputValue(
          getFormInputByLabel(dialogCreateEditDeliveryNote, DATE_LABEL, InputElementType.Date),
        );
        expect(actualDate).toBeTruthy();
        expect(isSameAppDay(actualDate!, MOCK_INITIAL_DATE)).toBeTruthy();

        const clientCombobox = getFormInputByLabel(
          dialogCreateEditDeliveryNote,
          CLIENT_LABEL,
          InputElementType.Combobox,
        );
        await assertComboboxValue(clientCombobox, null);

        await selectComboboxOption(page, clientCombobox, deliveryNoteClient.name, String(deliveryNoteClient.id));

        const deliveryMethodCombobox = getFormInputByLabel(
          dialogCreateEditDeliveryNote,
          DELIVERY_METHOD_LABEL,
          InputElementType.Combobox,
        );

        await selectComboboxOption(page, deliveryMethodCombobox, deliveryMethod.name, String(deliveryMethod.id));

        await dialogCreateEditDeliveryNote.getByTestId("button-submit").click();

        await expect(page).toHaveURL(`/delivery-note?editDeliveryNoteId=${newDeliveryNoteId}`);
        await expect(inputDeliveryNoteId).toHaveValue(String(newDeliveryNoteId));

        await expect(getDivDisabledMessage(cardTableDeliveryNoteLines)).not.toBeVisible();
        expect(await countGetDeliveryNoteByIdQueryErrors()).toBe(0);

        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);

        const dbDeliveryNote = await getDeliveryNote({ id: newDeliveryNoteId });
        expect(dbDeliveryNote).toBeDefined();
        expect(dbDeliveryNote!.id).toBe(newDeliveryNoteId);
        expect(dbDeliveryNote!.clientId).toBe(deliveryNoteClient.id);
        expect(dbDeliveryNote!.deliveryMethodId).toBe(deliveryMethod.id);
        expect(isSameAppDay(dbDeliveryNote!.deliveryDate!, MOCK_INITIAL_DATE)).toBeTruthy();
        await clearToasts(page);
      });
    }

    await test.step("delete all the delivery notes, giving the delivered quantity back to the sell order lines", async () => {
      const deliveryNoteWithCustomLines = mockDeliveryNotes.find(
        (mockDeliveryNote) => mockDeliveryNote.invoiceId === null,
      )!;
      const sellOrder = mockSellOrders.find(
        (mockSellOrder) =>
          mockSellOrder.clientId === deliveryNoteWithCustomLines.clientId && mockSellOrder.deletedAt === null,
      )!;
      const [customSellOrderLine, almostPendingCustomSellOrderLine] = await db
        .insert(dbTableSellOrderLine)
        .values([
          {
            description: "Línea sin Referencia",
            partPrice: "2.5",
            pendingQuantity: 4,
            quantity: 10,
            sellOrderId: sellOrder.id,
          },
          {
            description: "Otra línea sin Referencia",
            partPrice: "1",
            pendingQuantity: 9,
            quantity: 10,
            sellOrderId: sellOrder.id,
          },
        ])
        .returning();
      await db.insert(dbTableDeliveryNoteLine).values([
        {
          deliveryNoteId: deliveryNoteWithCustomLines.id,
          description: customSellOrderLine.description!,
          quantity: 3,
          sellOrderLineId: customSellOrderLine.id,
          vatPercentage: 21,
        },
        {
          deliveryNoteId: deliveryNoteWithCustomLines.id,
          description: almostPendingCustomSellOrderLine.description!,
          quantity: 5,
          sellOrderLineId: almostPendingCustomSellOrderLine.id,
          vatPercentage: 21,
        },
      ]);

      // From the last one, so an Albarán serving a Línea twice is deleted before the one that served it first
      const remainingDeliveryNoteIds = (await db.query.dbTableDeliveryNote.findMany()).map(({ id }) => id);
      for (const deliveryNote of [...mockDeliveryNotes].reverse()) {
        await workflowDeleteDeliveryNote(page, deliveryNote.id);
        await clearToasts(page);
        remainingDeliveryNoteIds.splice(remainingDeliveryNoteIds.indexOf(deliveryNote.id), 1);
        expect((await db.query.dbTableDeliveryNote.findMany()).map(({ id }) => id).sort((a, b) => a - b)).toEqual(
          remainingDeliveryNoteIds.sort((a, b) => a - b),
        );
      }

      // The delivered quantity is pending again, up to the ordered quantity
      expect((await getSellOrderLineById(customSellOrderLine.id))?.pendingQuantity).toBe(7);
      expect((await getSellOrderLineById(almostPendingCustomSellOrderLine.id))?.pendingQuantity).toBe(10);
    });
  },
);
