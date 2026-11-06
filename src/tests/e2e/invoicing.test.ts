import fs from "node:fs/promises";

import { expect } from "@playwright/test";
import type { Download, Locator } from "@playwright/test";
import { differenceInHours } from "date-fns";
import { eq, inArray } from "drizzle-orm";

import { getDeliveryNote } from "@/db/functions/delivery-note";
import { getDeliveryNoteLinesByDeliveryNoteId } from "@/db/functions/delivery-note-line";
import { getInvoiceById, getInvoices } from "@/db/functions/invoice";
import { dbTableClient, dbTableDeliveryNote, dbTableDeliveryNoteLine, dbTableInvoice } from "@/db/schema";
import { endOfAppDay, isSameAppDay, startOfAppDay } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents } from "@/lib/prices";
import { NEXT_PAGE_LABEL, CLIENT_LABEL, DATE_LABEL, FROM_LABEL, TO_LABEL } from "@/messages/common";
import { INVOICE_CREATE_TITLE } from "@/messages/invoice";
import {
  MOCK_INITIAL_DATE,
  mockClientInvoiceEmails,
  mockClients,
  mockConfigurations,
  mockDeliveryNoteLines,
  mockDeliveryNotes,
  mockInvoices,
  mockPaymentMethods,
  mockPendingDeliveryNotes,
  mockSellOrderLines,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { getClearComboboxButton } from "@/tests/utils/components/combobox";
import { selectDateInputDate } from "@/tests/utils/components/date-input";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  getTablePagerButton,
  getTableRowByTestId,
  getTableRows,
  getTableSubrowById,
} from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  getMockClientById,
  getMockDeliveryNoteById,
  getMockDeliveryNoteLines,
  getMockPartReferenceById,
  getMockPaymentMethodById,
  getMockSellOrderById,
  getMockSellOrderLineById,
} from "@/tests/utils/mock-data-utils";
import {
  workflowDeleteDeliveryNote,
  workflowEditDeliveryNoteLineQuantity,
  workflowFillCustomDeliveryNoteLine,
  workflowOpenEditDeliveryNote,
} from "@/tests/workflows/delivery-note";
import {
  assertDateRangeOfDeliveryNotes,
  assertTableInvoiceTotals,
  assertTablePendingDeliveryNotes,
  getDeliveryDatesRange,
  getDeliveryNoteTotalInCents,
  selectInvoiceClient,
  workflowCreateInvoice,
  workflowDeleteInvoice,
  workflowPickInvoiceClient,
} from "@/tests/workflows/invoice";
import { ToastType } from "@/types";
import { PENDING_DELIVERY_NOTES_PAGE_SIZE } from "@/types/invoice";

let tableInvoices: Locator;
let dialogCreateInvoice: Locator;
let tablePendingDeliveryNotes: Locator;

test.beforeEach(({ page }) => {
  tableInvoices = page.getByTestId("table-invoice");
  dialogCreateInvoice = page.getByTestId("dialog-create-invoice");
  tablePendingDeliveryNotes = dialogCreateInvoice.getByTestId("table-pending-delivery-note");
});

function getTableInvoiceDeliveryNotes(table: Locator, invoiceId: number): Locator {
  return getTableSubrowById(table, invoiceId).getByTestId("table-invoice-delivery-note");
}

function getClientDeliveryNotes(clientId: number) {
  return mockPendingDeliveryNotes
    .filter((deliveryNote) => deliveryNote.clientId === clientId)
    .sort((a, b) => a.deliveryDate!.getTime() - b.deliveryDate!.getTime());
}

test("create, change and delete invoices", async ({ page, db, toasts }) => {
  const client = mockClients[0];
  const clientDeliveryNotes = getClientDeliveryNotes(client.id);
  // The range ends on an Albarán of another Cliente, which is not invoiced, and leaves the last Albarán of the
  // Cliente out
  const otherClientDeliveryNote = mockPendingDeliveryNotes.find((deliveryNote) => deliveryNote.clientId !== client.id);
  expect(otherClientDeliveryNote).toBeDefined();
  const endDate = otherClientDeliveryNote!.deliveryDate!;
  const invoicedDeliveryNotes = clientDeliveryNotes.filter(
    (deliveryNote) => deliveryNote.deliveryDate! <= endOfAppDay(endDate),
  );
  expect(invoicedDeliveryNotes.length).toBeGreaterThan(0);
  expect(invoicedDeliveryNotes.length).toBeLessThan(clientDeliveryNotes.length);

  await test.step("the invoices table displays every kind of invoice", async () => {
    expect(mockInvoices.some((invoice) => invoice.accounted)).toBe(true);
    expect(mockInvoices.some((invoice) => !invoice.accounted)).toBe(true);
    expect(mockInvoices.some((invoice) => invoice.sent)).toBe(true);
    expect(mockInvoices.some((invoice) => !invoice.sent)).toBe(true);
    expect(mockInvoices.some((invoice) => invoice.paymentMethodId === null)).toBe(true);

    await page.goto("/invoicing");
    await assertTableRowCount(tableInvoices, mockInvoices.length);

    for (const invoice of mockInvoices) {
      const invoiceDeliveryNotes = mockDeliveryNotes.filter((deliveryNote) => deliveryNote.invoiceId === invoice.id);
      const rowInvoice = getTableRowByTestId(tableInvoices, invoice.id);
      await expect(rowInvoice.getByTestId("client")).toHaveText(getMockClientById(invoice.clientId)!.name);
      await expect(rowInvoice.getByTestId("deliveryNotesCount")).toHaveText(String(invoiceDeliveryNotes.length));
      await expect(rowInvoice.getByTestId("createdAt")).toHaveText(formatDate(invoice.createdAt)!);
      await expect(rowInvoice.getByTestId("dueDate")).toHaveText(formatDate(invoice.dueDate)!);
      if (invoice.accounted) {
        await expect(rowInvoice.getByTestId("checkbox-accounted")).toBeChecked();
        // It has to be unaccounted before, as Prisma already has it
        await expect(rowInvoice.getByTestId("button-delete")).toBeDisabled();
      } else {
        await expect(rowInvoice.getByTestId("checkbox-accounted")).not.toBeChecked();
        await expect(rowInvoice.getByTestId("button-delete")).toBeEnabled();
      }
      if (invoice.sent) {
        await expect(rowInvoice.getByTestId("checkbox-sent")).toBeChecked();
      } else {
        await expect(rowInvoice.getByTestId("checkbox-sent")).not.toBeChecked();
      }
      await assertTableInvoiceTotals(tableInvoices, invoice.id);

      await rowInvoice.getByTestId("button-expander").click();
      const tableInvoiceDeliveryNotes = getTableInvoiceDeliveryNotes(tableInvoices, invoice.id);
      await assertTableRowCount(tableInvoiceDeliveryNotes, invoiceDeliveryNotes.length);
      for (const deliveryNote of invoiceDeliveryNotes) {
        const rowDeliveryNote = getTableRowByTestId(tableInvoiceDeliveryNotes, deliveryNote.id);
        await expect(rowDeliveryNote.getByTestId("linesCount")).toHaveText(
          String(getMockDeliveryNoteLines(deliveryNote.id).length),
        );
        await expect(rowDeliveryNote.getByTestId("total")).toHaveText(
          formatCents(await getDeliveryNoteTotalInCents(deliveryNote.id)),
        );
      }
    }
  });

  await test.step("sending an invoice marks it as sent", async () => {
    const invoice = mockInvoices.find((mockInvoice) => !mockInvoice.sent)!;
    const rowInvoice = getTableRowByTestId(tableInvoices, invoice.id);
    const downloadPromise = page.waitForEvent("download");
    await rowInvoice.getByTestId("button-send-invoice").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`Factura ${invoice.id}.eml`);
    const email = await fs.readFile(await download.path(), "utf8");
    expect(email).toContain("X-Unsent: 1");
    expect(email).toContain(`From: ${mockConfigurations[0].invoiceSenderEmail}`);
    for (const { email: address } of mockClientInvoiceEmails.filter(({ clientId }) => clientId === invoice.clientId)) {
      expect(email).toContain(address);
    }
    expect(email).toContain(`filename="Factura ${invoice.id}.pdf"`);
    await expect(rowInvoice.getByTestId("checkbox-sent")).toBeChecked();
    expect((await getInvoiceById(invoice.id))?.sent).toBe(true);
  });

  await test.step("deleting a line of an invoiced delivery note marks its invoice to be accounted and sent again", async () => {
    const invoice = mockInvoices.find((mockInvoice) => mockInvoice.accounted && mockInvoice.sent)!;
    const deliveryNote = mockDeliveryNotes.find((mockDeliveryNote) => mockDeliveryNote.invoiceId === invoice.id)!;
    const deliveryNoteLine = getMockDeliveryNoteLines(deliveryNote.id)[0];

    const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(page, deliveryNote.id);

    await openAndConfirmAlertDialog(
      page,
      getTableRowByTestId(
        dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
        deliveryNoteLine.id,
      ).getByTestId("button-delete"),
      "dialog-delete-model-content",
    );
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);

    expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: false, sent: false });

    await page.goto("/invoicing");
    await expect(getTableRowByTestId(tableInvoices, invoice.id).getByTestId("checkbox-accounted")).not.toBeChecked();
    await assertTableInvoiceTotals(tableInvoices, invoice.id);
  });

  await test.step("changing the quantity of or adding a line to an invoiced delivery note marks its invoice to be accounted and sent again", async () => {
    // The previous and next steps take the first accounted and sent Factura
    const accountedSentInvoices = mockInvoices.filter((mockInvoice) => mockInvoice.accounted && mockInvoice.sent);
    expect(accountedSentInvoices.length).toBeGreaterThan(1);
    const invoice = accountedSentInvoices.at(-1)!;
    const deliveryNote = mockDeliveryNotes.find((mockDeliveryNote) => mockDeliveryNote.invoiceId === invoice.id)!;
    const deliveryNoteLine = getMockDeliveryNoteLines(deliveryNote.id)[0];

    await workflowOpenEditDeliveryNote(page, deliveryNote.id);
    await workflowEditDeliveryNoteLineQuantity(page, deliveryNoteLine.id, deliveryNoteLine.quantity + 1);
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: false, sent: false });

    await page.goto("/invoicing");
    await expect(getTableRowByTestId(tableInvoices, invoice.id).getByTestId("checkbox-accounted")).not.toBeChecked();
    await assertTableInvoiceTotals(tableInvoices, invoice.id);

    await db.update(dbTableInvoice).set({ accounted: true, sent: true }).where(eq(dbTableInvoice.id, invoice.id));
    await workflowOpenEditDeliveryNote(page, deliveryNote.id);
    const buttonSubmitLine = await workflowFillCustomDeliveryNoteLine(page, {
      description: deliveryNoteLine.description,
      quantity: 1,
      unitPrice: "1",
    });
    await buttonSubmitLine.click();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);
    expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: false, sent: false });
  });

  await test.step("deleting an invoiced delivery note marks its invoice to be accounted and sent again", async () => {
    // A Factura with several Albaranes, already accounted
    const invoice = mockInvoices.find(
      (mockInvoice) => mockDeliveryNotes.filter((deliveryNote) => deliveryNote.invoiceId === mockInvoice.id).length > 1,
    )!;
    const [deletedDeliveryNote, ...keptDeliveryNotes] = mockDeliveryNotes.filter(
      (deliveryNote) => deliveryNote.invoiceId === invoice.id,
    );
    await db.update(dbTableInvoice).set({ accounted: true, sent: true }).where(eq(dbTableInvoice.id, invoice.id));

    await workflowDeleteDeliveryNote(page, deletedDeliveryNote.id);

    const dbInvoice = await getInvoiceById(invoice.id);
    expect(dbInvoice).toMatchObject({ accounted: false, sent: false });
    expect(dbInvoice?.deliveryNotes.map((deliveryNote) => deliveryNote.id)).toEqual(
      keptDeliveryNotes.map((deliveryNote) => deliveryNote.id),
    );

    await page.goto("/invoicing");
    const rowInvoice = getTableRowByTestId(tableInvoices, invoice.id);
    await expect(rowInvoice.getByTestId("checkbox-accounted")).not.toBeChecked();
    await expect(rowInvoice.getByTestId("deliveryNotesCount")).toHaveText(String(keptDeliveryNotes.length));
    await assertTableInvoiceTotals(tableInvoices, invoice.id);

    // A Factura whose only Albarán is deleted is kept, empty and not accounted
    const accountedInvoice = mockInvoices.find(
      (mockInvoice) =>
        mockInvoice.accounted &&
        mockDeliveryNotes.filter((deliveryNote) => deliveryNote.invoiceId === mockInvoice.id).length === 1,
    )!;
    const onlyDeliveryNote = mockDeliveryNotes.find((deliveryNote) => deliveryNote.invoiceId === accountedInvoice.id)!;
    await db
      .update(dbTableInvoice)
      .set({ accounted: true, sent: true })
      .where(eq(dbTableInvoice.id, accountedInvoice.id));

    await workflowDeleteDeliveryNote(page, onlyDeliveryNote.id);

    expect(await getInvoiceById(accountedInvoice.id)).toMatchObject({
      accounted: false,
      deliveryNotes: [],
      sent: false,
    });

    await page.goto("/invoicing");
    const rowAccountedInvoice = getTableRowByTestId(tableInvoices, accountedInvoice.id);
    await expect(rowAccountedInvoice.getByTestId("checkbox-accounted")).not.toBeChecked();
    await expect(rowAccountedInvoice.getByTestId("deliveryNotesCount")).toHaveText("0");
    await assertTableInvoiceTotals(tableInvoices, accountedInvoice.id);
  });

  await test.step("the create invoice dialog displays the pending delivery notes of the picked client", async () => {
    expect(clientDeliveryNotes.length).toBeGreaterThan(1);
    expect(clientDeliveryNotes.length).toBeLessThan(mockPendingDeliveryNotes.length);

    await page.goto("/invoicing");
    await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
    await expect(dialogCreateInvoice).toBeVisible();

    // Every pending Albarán is displayed until a Cliente is picked
    await assertTablePendingDeliveryNotes(dialogCreateInvoice, mockPendingDeliveryNotes);
    await assertDateRangeOfDeliveryNotes(dialogCreateInvoice, mockPendingDeliveryNotes);
    for (const deliveryNote of mockPendingDeliveryNotes) {
      const rowDeliveryNote = getTableRowByTestId(tablePendingDeliveryNotes, deliveryNote.id);
      await expect(rowDeliveryNote.getByTestId("client")).toHaveText(getMockClientById(deliveryNote.clientId)!.name);
      await expect(rowDeliveryNote.getByTestId("deliveryDate")).toHaveText(formatDate(deliveryNote.deliveryDate)!);
      await expect(rowDeliveryNote.getByTestId("linesCount")).toHaveText(
        String(getMockDeliveryNoteLines(deliveryNote.id).length),
      );
    }
    // The dates filled in from the Albaranes are not a change made to the form
    await expect(dialogCreateInvoice.getByTestId("button-submit")).toBeDisabled();

    await workflowPickInvoiceClient(page, dialogCreateInvoice, client);
    await expect(dialogCreateInvoice.getByTestId("button-submit")).toBeEnabled();

    // The lines of an Albarán are displayed with their prices
    const [firstDeliveryNote] = clientDeliveryNotes;
    const firstDeliveryNoteLines = getMockDeliveryNoteLines(firstDeliveryNote.id);
    await getTableRowByTestId(tablePendingDeliveryNotes, firstDeliveryNote.id).getByTestId("button-expander").click();
    const tablePendingDeliveryNoteLines = getTableSubrowById(
      tablePendingDeliveryNotes,
      firstDeliveryNote.id,
    ).getByTestId("table-pending-delivery-note-line");
    await assertTableRowCount(tablePendingDeliveryNoteLines, firstDeliveryNoteLines.length);
    for (const deliveryNoteLine of firstDeliveryNoteLines) {
      const unitPrice = getMockSellOrderLineById(deliveryNoteLine.sellOrderLineId!)!.partPrice;
      const rowDeliveryNoteLine = getTableRowByTestId(tablePendingDeliveryNoteLines, deliveryNoteLine.id);
      await expect(rowDeliveryNoteLine.getByTestId("partReference")).toHaveText(
        getMockPartReferenceById(deliveryNoteLine.partReferenceId)!.reference,
      );
      await expect(rowDeliveryNoteLine.getByTestId("description")).toHaveText(deliveryNoteLine.description);
      await expect(rowDeliveryNoteLine.getByTestId("quantity")).toHaveText(String(deliveryNoteLine.quantity));
      await expect(rowDeliveryNoteLine.getByTestId("unitPrice")).toHaveText(formatPrice(unitPrice));
      await expect(rowDeliveryNoteLine.getByTestId("total")).toHaveText(
        formatCents(getLineTotalInCents({ quantity: deliveryNoteLine.quantity, unitPrice })),
      );
    }

    // Narrowing the range takes out of the table the Albaranes that would not be invoiced
    await selectDateInputDate(
      page,
      getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date),
      firstDeliveryNote.deliveryDate!,
    );
    await assertTablePendingDeliveryNotes(dialogCreateInvoice, [firstDeliveryNote]);

    // Clearing the Cliente displays the pending Albaranes of every Cliente again. The date picked by hand is kept,
    // while the other one is filled in from all of them.
    await getClearComboboxButton(
      getFormInputByLabel(dialogCreateInvoice, CLIENT_LABEL, InputElementType.Combobox),
    ).click();
    await assertTablePendingDeliveryNotes(
      dialogCreateInvoice,
      mockPendingDeliveryNotes.filter(
        (deliveryNote) => deliveryNote.deliveryDate! <= endOfAppDay(firstDeliveryNote.deliveryDate!),
      ),
    );
    await expect(getFormInputByLabel(dialogCreateInvoice, FROM_LABEL, InputElementType.Date)).toHaveAttribute(
      "data-value",
      startOfAppDay(getDeliveryDatesRange(mockPendingDeliveryNotes).startDate).toISOString(),
    );
    await expect(getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date)).toHaveAttribute(
      "data-value",
      startOfAppDay(firstDeliveryNote.deliveryDate!).toISOString(),
    );
  });

  await test.step("an invoice cannot be created without pending delivery notes in the range", async () => {
    const { startDate, endDate: clientEndDate } = getDeliveryDatesRange(clientDeliveryNotes);
    const dateWithoutDeliveryNotes = MOCK_INITIAL_DATE;
    expect(
      mockPendingDeliveryNotes.some((deliveryNote) =>
        isSameAppDay(deliveryNote.deliveryDate!, dateWithoutDeliveryNotes),
      ),
    ).toBe(false);

    await page.goto("/invoicing");
    await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
    await expect(dialogCreateInvoice).toBeVisible();
    const buttonSubmit = dialogCreateInvoice.getByTestId("button-submit");
    const inputStartDate = getFormInputByLabel(dialogCreateInvoice, FROM_LABEL, InputElementType.Date);
    const inputEndDate = getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date);

    await workflowPickInvoiceClient(page, dialogCreateInvoice, client);
    await expect(buttonSubmit).toBeEnabled();

    await selectDateInputDate(page, inputStartDate, dateWithoutDeliveryNotes);
    await selectDateInputDate(page, inputEndDate, dateWithoutDeliveryNotes);
    await assertTablePendingDeliveryNotes(dialogCreateInvoice, []);
    await expect(buttonSubmit).toBeDisabled();

    // Picking a range with Albaranes again allows the Factura to be created
    await selectDateInputDate(page, inputStartDate, startDate);
    await selectDateInputDate(page, inputEndDate, clientEndDate);
    await assertTablePendingDeliveryNotes(dialogCreateInvoice, clientDeliveryNotes);
    await expect(buttonSubmit).toBeEnabled();

    expect(await getInvoices()).toHaveLength(mockInvoices.length);
  });

  const createdInvoice = await test.step("create an invoice for the pending delivery notes of a client", async () => {
    const paymentMethod = mockPaymentMethods.find((pm) => pm.paymentDeadlineDays !== null);
    expect(paymentMethod).toBeDefined();
    await db
      .update(dbTableClient)
      .set({ defaultPaymentMethodId: paymentMethod!.id })
      .where(eq(dbTableClient.id, client.id));

    const pendingDeliveryNotes = mockPendingDeliveryNotes.filter(
      (deliveryNote) => !invoicedDeliveryNotes.includes(deliveryNote),
    );

    const invoice = await workflowCreateInvoice(page, { client, endDate });

    expect(invoice.accounted).toBe(false);
    expect(invoice.paymentMethodId).toBe(paymentMethod!.id);
    // The days are added in Spain, where a daylight saving change in between makes one of them an hour longer or shorter
    expect(Math.round(differenceInHours(invoice.dueDate, invoice.createdAt) / 24)).toBe(
      getMockPaymentMethodById(paymentMethod!.id)!.paymentDeadlineDays,
    );
    expect(invoice.deliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b)).toEqual(
      invoicedDeliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b),
    );

    await assertTableRowCount(tableInvoices, mockInvoices.length + 1);
    const rowInvoice = getTableRowByTestId(tableInvoices, invoice.id);
    await expect(rowInvoice.getByTestId("id")).toHaveText(String(invoice.id));
    await expect(rowInvoice.getByTestId("client")).toHaveText(client.name);
    await expect(rowInvoice.getByTestId("deliveryNotesCount")).toHaveText(String(invoicedDeliveryNotes.length));
    await expect(rowInvoice.getByTestId("createdAt")).toHaveText(formatDate(invoice.createdAt)!);
    await expect(rowInvoice.getByTestId("dueDate")).toHaveText(formatDate(invoice.dueDate)!);
    await expect(rowInvoice.getByTestId("checkbox-accounted")).not.toBeChecked();

    await rowInvoice.getByTestId("button-expander").click();
    const tableInvoiceDeliveryNotes = getTableInvoiceDeliveryNotes(tableInvoices, invoice.id);
    await assertTableRowCount(tableInvoiceDeliveryNotes, invoicedDeliveryNotes.length);
    for (const deliveryNote of invoicedDeliveryNotes) {
      const rowDeliveryNote = getTableRowByTestId(tableInvoiceDeliveryNotes, deliveryNote.id);
      await expect(rowDeliveryNote.getByTestId("deliveryDate")).toHaveText(formatDate(deliveryNote.deliveryDate)!);
      await expect(rowDeliveryNote.getByTestId("linesCount")).toHaveText(
        String(getMockDeliveryNoteLines(deliveryNote.id).length),
      );
      await expect(rowDeliveryNote.getByTestId("total")).toHaveText(
        formatCents(await getDeliveryNoteTotalInCents(deliveryNote.id)),
      );
    }

    for (const deliveryNote of pendingDeliveryNotes) {
      const dbDeliveryNote = await getDeliveryNote({ id: deliveryNote.id });
      expect(dbDeliveryNote).toBeDefined();
      expect(dbDeliveryNote!.invoiceId).toBeNull();
    }
    return invoice;
  });

  const invoiceCreatedByDates =
    await test.step("the dates picked before the client keep filtering its delivery notes", async () => {
      // The Albaranes of the previous Factura are pending again
      await workflowDeleteInvoice(page, createdInvoice.id);

      await page.goto("/invoicing");
      await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
      await expect(dialogCreateInvoice).toBeVisible();
      await assertDateRangeOfDeliveryNotes(dialogCreateInvoice, mockPendingDeliveryNotes);

      await selectDateInputDate(
        page,
        getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date),
        endDate,
      );
      await assertTablePendingDeliveryNotes(
        dialogCreateInvoice,
        mockPendingDeliveryNotes.filter((deliveryNote) => deliveryNote.deliveryDate! <= endOfAppDay(endDate)),
      );

      // Picking the Cliente fills in the start of the range from its Albaranes, but keeps the picked end
      await selectInvoiceClient(page, dialogCreateInvoice, client);
      await assertTablePendingDeliveryNotes(dialogCreateInvoice, invoicedDeliveryNotes);
      await expect(getFormInputByLabel(dialogCreateInvoice, FROM_LABEL, InputElementType.Date)).toHaveAttribute(
        "data-value",
        startOfAppDay(getDeliveryDatesRange(clientDeliveryNotes).startDate).toISOString(),
      );
      await expect(getFormInputByLabel(dialogCreateInvoice, TO_LABEL, InputElementType.Date)).toHaveAttribute(
        "data-value",
        startOfAppDay(endDate).toISOString(),
      );

      // The Factura is created with the same Albaranes displayed
      const previousInvoicesCount = (await getInvoices()).length;
      await dialogCreateInvoice.getByTestId("button-submit").click();
      await expect(dialogCreateInvoice).not.toBeVisible();
      const newInvoices = await getInvoices();
      expect(newInvoices).toHaveLength(previousInvoicesCount + 1);
      const newInvoice = newInvoices.at(-1)!;
      expect(newInvoice.deliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b)).toEqual(
        invoicedDeliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b),
      );
      await clearToasts(page);
      return newInvoice;
    });

  await test.step("changes to an invoiced delivery note are shown in its invoice", async () => {
    // The Albaranes of the previous Factura are pending again
    await workflowDeleteInvoice(page, invoiceCreatedByDates.id);

    const deliveryNote = mockPendingDeliveryNotes[0];
    const deliveryNoteLines = getMockDeliveryNoteLines(deliveryNote.id);
    expect(deliveryNoteLines.length).toBeGreaterThan(1);
    const deletedDeliveryNoteLine = deliveryNoteLines[0];
    const deletedLineTotalInCents = getLineTotalInCents({
      quantity: deletedDeliveryNoteLine.quantity,
      unitPrice: getMockSellOrderLineById(deletedDeliveryNoteLine.sellOrderLineId!)!.partPrice,
    });
    expect(deletedLineTotalInCents).toBeGreaterThan(0);
    const newTotalInCents = (await getDeliveryNoteTotalInCents(deliveryNote.id)) - deletedLineTotalInCents!;
    // The new date is outside of the invoiced range, and the Albarán must stay in its Factura anyway
    const newDeliveryDate = MOCK_INITIAL_DATE;

    const invoice = await workflowCreateInvoice(page, {
      client: getMockClientById(deliveryNote.clientId)!,
      endDate: deliveryNote.deliveryDate!,
      startDate: deliveryNote.deliveryDate!,
    });
    expect(invoice.deliveryNotes.map((invoiceDeliveryNote) => invoiceDeliveryNote.id)).toEqual([deliveryNote.id]);

    const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(page, deliveryNote.id);

    const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
    await openAndConfirmAlertDialog(
      page,
      getTableRowByTestId(tableDeliveryNoteLines, deletedDeliveryNoteLine.id).getByTestId("button-delete"),
      "dialog-delete-model-content",
    );
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);

    await selectDateInputDate(
      page,
      getFormInputByLabel(dialogCreateEditDeliveryNote, DATE_LABEL, InputElementType.Date),
      newDeliveryDate,
    );
    await dialogCreateEditDeliveryNote.getByTestId("button-submit").click();
    await expect(dialogCreateEditDeliveryNote).not.toBeVisible();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);

    await page.goto("/invoicing");
    const rowInvoice = getTableRowByTestId(tableInvoices, invoice.id);
    await expect(rowInvoice.getByTestId("deliveryNotesCount")).toHaveText("1");
    await rowInvoice.getByTestId("button-expander").click();

    const rowDeliveryNote = getTableRowByTestId(
      getTableInvoiceDeliveryNotes(tableInvoices, invoice.id),
      deliveryNote.id,
    );
    await expect(rowDeliveryNote.getByTestId("deliveryDate")).toHaveText(formatDate(newDeliveryDate)!);
    await expect(rowDeliveryNote.getByTestId("linesCount")).toHaveText(String(deliveryNoteLines.length - 1));
    await expect(rowDeliveryNote.getByTestId("total")).toHaveText(formatCents(newTotalInCents));
    await expect(rowInvoice.getByTestId("taxableBase")).toHaveText(formatCents(newTotalInCents));
    await assertTableInvoiceTotals(tableInvoices, invoice.id);

    const dbDeliveryNote = await getDeliveryNote({ id: deliveryNote.id });
    expect(dbDeliveryNote).toBeDefined();
    expect(dbDeliveryNote!.invoiceId).toBe(invoice.id);
  });

  await test.step("deleting an invoice leaves its delivery notes pending to be invoiced", async () => {
    const clientsWithDeliveryNotes = mockClients.filter(
      (mockClient) => getClientDeliveryNotes(mockClient.id).length > 0,
    );
    expect(clientsWithDeliveryNotes.length).toBeGreaterThan(1);

    const invoices: Array<Awaited<ReturnType<typeof workflowCreateInvoice>>> = [];
    for (const clientWithDeliveryNotes of clientsWithDeliveryNotes) {
      invoices.push(await workflowCreateInvoice(page, { client: clientWithDeliveryNotes }));
    }
    const [deletedInvoice, ...remainingInvoices] = invoices;

    await workflowDeleteInvoice(page, deletedInvoice.id);

    // The other Facturas keep their Albaranes
    for (const remainingInvoice of remainingInvoices) {
      await expect(getTableRowByTestId(tableInvoices, remainingInvoice.id)).toBeVisible();
      for (const deliveryNote of remainingInvoice.deliveryNotes) {
        const dbDeliveryNote = await getDeliveryNote({ id: deliveryNote.id });
        expect(dbDeliveryNote).toBeDefined();
        expect(dbDeliveryNote!.invoiceId).toBe(remainingInvoice.id);
      }
    }

    // The released Albaranes are pending again, so they are invoiced once more
    const reinvoicedInvoice = await workflowCreateInvoice(page, {
      client: getMockClientById(deletedInvoice.clientId)!,
    });
    expect(reinvoicedInvoice.deliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b)).toEqual(
      deletedInvoice.deliveryNotes.map((deliveryNote) => deliveryNote.id).sort((a, b) => a - b),
    );
  });
});

test("the pending delivery notes are paged without keeping the page in the url", async ({ page, db }) => {
  // The new Albaranes are the most recent ones, so they are displayed after the mocked ones
  const newDeliveryNotes = await db
    .insert(dbTableDeliveryNote)
    .values(
      Array.from({ length: PENDING_DELIVERY_NOTES_PAGE_SIZE }, () => ({
        clientId: mockClients[0].id,
        createdAt: MOCK_INITIAL_DATE,
        deliveryDate: MOCK_INITIAL_DATE,
      })),
    )
    .returning();
  const pendingDeliveryNotes = [
    ...[...mockPendingDeliveryNotes].sort((a, b) => a.deliveryDate!.getTime() - b.deliveryDate!.getTime()),
    ...newDeliveryNotes,
  ];
  const pageCount = Math.ceil(pendingDeliveryNotes.length / PENDING_DELIVERY_NOTES_PAGE_SIZE);
  const secondPageDeliveryNotes = pendingDeliveryNotes.slice(
    PENDING_DELIVERY_NOTES_PAGE_SIZE,
    PENDING_DELIVERY_NOTES_PAGE_SIZE * 2,
  );

  await page.goto("/invoicing");
  await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
  await expect(dialogCreateInvoice).toBeVisible();
  await expect(getTableRows(tablePendingDeliveryNotes)).toHaveCount(PENDING_DELIVERY_NOTES_PAGE_SIZE);
  await expect(dialogCreateInvoice.getByText(`Página 1 de ${pageCount}`)).toBeVisible();

  await getTablePagerButton(tablePendingDeliveryNotes, NEXT_PAGE_LABEL).click();
  await expect(dialogCreateInvoice.getByText(`Página 2 de ${pageCount}`)).toBeVisible();
  await expect(getTableRows(tablePendingDeliveryNotes)).toHaveCount(secondPageDeliveryNotes.length);
  for (const deliveryNote of secondPageDeliveryNotes) {
    await expect(getTableRowByTestId(tablePendingDeliveryNotes, deliveryNote.id)).toBeVisible();
  }
  expect(new URL(page.url()).searchParams.has("table-pending-delivery-note")).toBe(false);
});

test(
  "an invoice is not created while its delivery notes have lines without price",
  { annotation: [TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, db, toasts }) => {
    const client = mockClients[0];
    const clientDeliveryNotes = getClientDeliveryNotes(client.id);
    expect(clientDeliveryNotes.length).toBeGreaterThan(1);
    const firstDeliveryNote = clientDeliveryNotes[0];
    const lastDeliveryNote = clientDeliveryNotes.at(-1)!;
    const unpricedSellOrderLine = mockSellOrderLines.find(
      (sellOrderLine) =>
        sellOrderLine.partPrice === null &&
        sellOrderLine.partReferenceId !== null &&
        getMockSellOrderById(sellOrderLine.sellOrderId)?.clientId === client.id,
    );
    expect(unpricedSellOrderLine, "A Línea de Pedido of the Cliente should have no price").toBeDefined();

    // One Línea without Artículo added by hand without price and one from a Pedido de venta that has no price either
    await db.insert(dbTableDeliveryNoteLine).values([
      {
        deliveryNoteId: firstDeliveryNote.id,
        description: "Línea sin precio",
        quantity: 1,
        vatPercentage: 21,
      },
      {
        deliveryNoteId: lastDeliveryNote.id,
        description: "Línea de Pedido sin precio",
        partReferenceId: unpricedSellOrderLine!.partReferenceId,
        quantity: 1,
        sellOrderLineId: unpricedSellOrderLine!.id,
        vatPercentage: 21,
      },
    ]);
    const unpricedDeliveryNoteIds = [firstDeliveryNote.id, lastDeliveryNote.id].sort((a, b) => a - b);

    await page.goto("/invoicing");
    await page.getByRole("button", { name: INVOICE_CREATE_TITLE }).click();
    await expect(dialogCreateInvoice).toBeVisible();
    await workflowPickInvoiceClient(page, dialogCreateInvoice, client);
    await dialogCreateInvoice.getByTestId("button-submit").click();

    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Error);
    await expect(toasts.first()).toContainText(
      `Los Albaranes ${unpricedDeliveryNoteIds.join(", ")} tienen Líneas sin precio`,
    );
    await expect(dialogCreateInvoice).toBeVisible();

    expect(await getInvoices()).toHaveLength(mockInvoices.length);
    for (const deliveryNote of clientDeliveryNotes) {
      expect((await getDeliveryNote({ id: deliveryNote.id }))?.invoiceId).toBeNull();
    }
  },
);

test(
  "a user cannot change the lines of an accounted invoice",
  { annotation: [TestAnnotations.UserModeUser, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, toasts }) => {
    const invoice = mockInvoices.find((mockInvoice) => mockInvoice.accounted)!;
    const deliveryNote = mockDeliveryNotes.find((mockDeliveryNote) => mockDeliveryNote.invoiceId === invoice.id)!;
    const deliveryNoteLine = getMockDeliveryNoteLines(deliveryNote.id)[0];
    const forbiddenMessage = `El Albarán ${deliveryNote.id} pertenece a una Factura contabilizada, solo el Administrador puede cambiar sus líneas`;
    const assertForbidden = async () => {
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText(forbiddenMessage);
      await clearToasts(page);
    };

    await workflowOpenEditDeliveryNote(page, deliveryNote.id);
    await workflowEditDeliveryNoteLineQuantity(page, deliveryNoteLine.id, deliveryNoteLine.quantity + 1);
    await assertForbidden();

    const buttonSubmitLine = await workflowFillCustomDeliveryNoteLine(page, {
      description: deliveryNoteLine.description,
      quantity: 1,
    });
    await buttonSubmitLine.click();
    await assertForbidden();

    expect(await getDeliveryNoteLinesByDeliveryNoteId(deliveryNote.id)).toEqual(
      getMockDeliveryNoteLines(deliveryNote.id).map((line) =>
        expect.objectContaining({ id: line.id, quantity: line.quantity }),
      ),
    );
    expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: true, sent: invoice.sent });
  },
);

test("changing the price of a sell order line marks the invoices that take it to be accounted and sent again", async ({
  page,
  db,
  toasts,
}) => {
  const invoice = mockInvoices.find((mockInvoice) => mockInvoice.accounted && mockInvoice.sent)!;
  const deliveryNote = mockDeliveryNotes.find((mockDeliveryNote) => mockDeliveryNote.invoiceId === invoice.id)!;
  const sellOrderLine = getMockSellOrderLineById(
    getMockDeliveryNoteLines(deliveryNote.id).find((line) => line.sellOrderLineId !== null)!.sellOrderLineId!,
  )!;
  expect(sellOrderLine.partPrice, "The Factura should take the price of a Línea del Pedido de venta").not.toBeNull();

  const formSellOrder = page.getByTestId("form-sell-order");
  await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
  await assertFormLoaded(formSellOrder);
  const inputPartPrice = getTableRowByTestId(formSellOrder.getByTestId("table-sell-order-line"), sellOrderLine.id)
    .getByTestId("partPrice")
    .getByTestId("input-part-price");
  const changePartPrice = async (partPrice: string) => {
    await inputPartPrice.clear();
    await inputPartPrice.pressSequentially(partPrice);
    await inputPartPrice.press("Enter");
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);
  };

  // The same price typed with more trailing zeros does not change the Factura
  await changePartPrice(`${sellOrderLine.partPrice}0`);
  expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: true, sent: true });

  await changePartPrice("11.25");
  expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: false, sent: false });

  // Once the Factura is pending again there is nothing else to mark
  await changePartPrice("12");
  expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: false, sent: false });

  await page.goto("/invoicing");
  await expect(getTableRowByTestId(tableInvoices, invoice.id).getByTestId("checkbox-accounted")).not.toBeChecked();
  await assertTableInvoiceTotals(tableInvoices, invoice.id);

  // Líneas with a price of their own, like the one agreed on delivery, do not change with the Pedido de venta
  const invoiceLinkedLineIds = mockDeliveryNotes
    .filter((mockDeliveryNote) => mockDeliveryNote.invoiceId === invoice.id)
    .flatMap((mockDeliveryNote) => getMockDeliveryNoteLines(mockDeliveryNote.id))
    .filter((line) => line.sellOrderLineId === sellOrderLine.id)
    .map((line) => line.id);
  await db
    .update(dbTableDeliveryNoteLine)
    .set({ unitPrice: "10.5" })
    .where(inArray(dbTableDeliveryNoteLine.id, invoiceLinkedLineIds));
  await db.update(dbTableInvoice).set({ accounted: true, sent: true }).where(eq(dbTableInvoice.id, invoice.id));

  await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
  await assertFormLoaded(formSellOrder);
  await changePartPrice("13");
  expect(await getInvoiceById(invoice.id)).toMatchObject({ accounted: true, sent: true });

  await page.goto("/invoicing");
  await expect(getTableRowByTestId(tableInvoices, invoice.id).getByTestId("checkbox-accounted")).toBeChecked();
  await assertTableInvoiceTotals(tableInvoices, invoice.id);
});

test(
  "an invoice is not sent while its delivery notes have lines without price",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    const unpricedLine = mockDeliveryNoteLines.find((line) => {
      const invoiceId = getMockDeliveryNoteById(line.deliveryNoteId)?.invoiceId;
      const invoice = mockInvoices.find((mockInvoice) => mockInvoice.id === invoiceId);
      return invoice?.sent === false && line.sellOrderLineId === null && line.unitPrice === null;
    })!;
    expect(unpricedLine, "A Factura not sent yet should have a Línea without price").toBeDefined();
    const invoiceId = getMockDeliveryNoteById(unpricedLine.deliveryNoteId)!.invoiceId!;
    const downloads: Array<Download> = [];
    page.on("download", (download) => downloads.push(download));

    await page.goto("/invoicing");
    const rowInvoice = getTableRowByTestId(tableInvoices, invoiceId);
    await rowInvoice.getByTestId("button-send-invoice").click();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Error);
    await expect(toasts.first()).toContainText(
      `estos Albaranes tienen Líneas sin precio: ${unpricedLine.deliveryNoteId}`,
    );
    // The email is not handed over either
    expect(downloads).toHaveLength(0);
    await expect(rowInvoice.getByTestId("checkbox-sent")).not.toBeChecked();
    expect((await getInvoiceById(invoiceId))?.sent).toBe(false);
    await clearToasts(page);

    await db
      .update(dbTableDeliveryNoteLine)
      .set({ unitPrice: "3.5" })
      .where(eq(dbTableDeliveryNoteLine.id, unpricedLine.id));
    const downloadPromise = page.waitForEvent("download");
    await rowInvoice.getByTestId("button-send-invoice").click();
    expect((await downloadPromise).suggestedFilename()).toBe(`Factura ${invoiceId}.eml`);
    await expect(rowInvoice.getByTestId("checkbox-sent")).toBeChecked();
    expect((await getInvoiceById(invoiceId))?.sent).toBe(true);
  },
);
