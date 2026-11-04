import { expect } from "@playwright/test";
import type { Download, Locator, Page } from "@playwright/test";
import { eq, ne } from "drizzle-orm";

import { getDeliveryNoteWithLinesForDocument } from "@/db/functions/delivery-note";
import { getInvoiceById, getInvoices } from "@/db/functions/invoice";
import {
  dbTableClient,
  dbTableDeliveryNote,
  dbTableDeliveryNoteLine,
  dbTableInvoice,
  dbTableSellOrderLine,
} from "@/db/schema";
import type { TAccountingExportInvoice } from "@/files/accounting-export";
import {
  encodeAccountingExportCsv,
  getAccountingExportCsv,
  hasAmountTooLarge,
  MAX_AMOUNT_IN_CENTS,
} from "@/files/accounting-export";
import { formatCents, getDeliveryNoteLineUnitPrice, getVatBreakdown } from "@/lib/prices";
import {
  MOCK_INITIAL_DATE,
  mockClients,
  mockDeliveryNoteLines,
  mockDeliveryNotes,
  mockInvoices,
  mockSellOrderLines,
  mockSellOrders,
} from "@/tests/mock-data";
import { getFormInputByLabel, assertFormLoaded } from "@/tests/utils/components/form";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import { getMockClientById, getMockPaymentMethodById, getMockSellOrderLineById } from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import { workflowOpenEditDeliveryNote } from "@/tests/workflows/delivery-note";
import {
  confirmAccountInvoices,
  getDeliveryNoteTotalInCents,
  workflowAccountInvoices,
  workflowCreateInvoice,
  workflowUnaccountInvoice,
} from "@/tests/workflows/invoice";
import { ToastType } from "@/types";

const MOCK_INVOICES: Array<TAccountingExportInvoice> = [
  {
    client: {
      accountingAccountId: "4300001",
      address: "CALLE FICTICIA 1, NAVE 2",
      city: "CIUDAD UNO",
      legalName: "EMPRESA EJEMPLO UNO S.L.U.",
      postalCode: "00001",
      taxId: "B12345678",
    },
    createdAt: new Date("2026-09-30T10:00:00Z"),
    dueDate: new Date("2027-01-25T10:00:00Z"),
    generatesReceipt: true,
    id: 4600,
    vatBreakdown: [{ taxableBaseInCents: 12000, vatInCents: 2520, vatPercentage: 21 }],
  },
  {
    client: {
      accountingAccountId: "4300002",
      address: "AVDA. DE PRUEBA, 2",
      city: "VILLA DOS",
      legalName: "TALLERES PRUEBA DOS, S.L.",
      postalCode: "00002",
      taxId: "B23456789",
    },
    createdAt: new Date("2026-09-30T10:00:00Z"),
    dueDate: new Date("2026-09-30T10:00:00Z"),
    generatesReceipt: false,
    id: 4601,
    vatBreakdown: [{ taxableBaseInCents: 1234567, vatInCents: 259259, vatPercentage: 21 }],
  },
  {
    client: {
      accountingAccountId: "4300003",
      address: "POL. IND. IMAGINARIO, C/E, 3",
      city: "CIUDAD TRES",
      legalName: "FABRICA IMAGINARIA DE RECUBRIMIENTOS, S.L.",
      postalCode: "00003",
      taxId: "B34567890",
    },
    createdAt: new Date("2026-09-30T10:00:00Z"),
    dueDate: new Date("2026-11-30T10:00:00Z"),
    generatesReceipt: true,
    id: 4605,
    vatBreakdown: [{ taxableBaseInCents: 12345, vatInCents: 2592, vatPercentage: 21 }],
  },
  {
    client: {
      accountingAccountId: "4300004",
      address: "POL. IND. DEMO",
      city: "VILLA CUATRO",
      legalName: "TALLER DEMO, S.L.U.",
      postalCode: "00004",
      taxId: "B45678901",
    },
    createdAt: new Date("2026-09-30T10:00:00Z"),
    dueDate: new Date("2026-10-15T10:00:00Z"),
    generatesReceipt: true,
    id: 4606,
    vatBreakdown: [{ taxableBaseInCents: 5875, vatInCents: 1234, vatPercentage: 21 }],
  },
];

const MOCK_CSV = [
  '"1",260930,"4300001  ","N/FACTURA 004600                   ","004600         ","D",0000014520,"EMPRESA EJEMPLO UNO S.L.U.    ","B12345678      ","CALLE FICTICIA 1, NAVE 2           ","00001","CIUDAD UNO                        "',
  '"2",260930,"4300001  ","EMPRESA EJEMPLO UNO S.L.U.    ","B12345678      ",2100,0500,0000012000,0000002520,0000000000,0000014520,"004600         "," ","R"',
  '"3",260930,270125,"4300001  ",0000014520,"004600         ","C","               "',
  '"1",260930,"4770000  ","N/FACTURA 004600                   ","004600         ","H",0000002520,"EMPRESA EJEMPLO UNO S.L.U.    ","B12345678      ","CALLE FICTICIA 1, NAVE 2           ","00001","CIUDAD UNO                        "',
  '"1",260930,"7050001  ","N/FACTURA 004600                   ","004600         ","H",0000012000,"PRES SERV EMPRESA EJEMPLO UNO S.L.U.","B12345678      ","CALLE FICTICIA 1, NAVE 2           ","00001","CIUDAD UNO                        "',
  '"1",260930,"4300002  ","N/FACTURA 004601                   ","004601         ","D",0001493826,"TALLERES PRUEBA DOS, S.L.     ","B23456789      ","AVDA. DE PRUEBA, 2                 ","00002","VILLA DOS                         "',
  '"2",260930,"4300002  ","TALLERES PRUEBA DOS, S.L.     ","B23456789      ",2100,0500,0001234567,0000259259,0000000000,0001493826,"004601         "," ","R"',
  '"1",260930,"4770000  ","N/FACTURA 004601                   ","004601         ","H",0000259259,"TALLERES PRUEBA DOS, S.L.     ","B23456789      ","AVDA. DE PRUEBA, 2                 ","00002","VILLA DOS                         "',
  '"1",260930,"7050002  ","N/FACTURA 004601                   ","004601         ","H",0001234567,"PRES SERV TALLERES PRUEBA DOS, S.L.","B23456789      ","AVDA. DE PRUEBA, 2                 ","00002","VILLA DOS                         "',
  '"1",260930,"4300003  ","N/FACTURA 004605                   ","004605         ","D",0000014937,"FABRICA IMAGINARIA DE RECUBRIM","B34567890      ","POL. IND. IMAGINARIO, C/E, 3       ","00003","CIUDAD TRES                       "',
  '"2",260930,"4300003  ","FABRICA IMAGINARIA DE RECUBRIM","B34567890      ",2100,0500,0000012345,0000002592,0000000000,0000014937,"004605         "," ","R"',
  '"3",260930,261130,"4300003  ",0000014937,"004605         ","C","               "',
  '"1",260930,"4770000  ","N/FACTURA 004605                   ","004605         ","H",0000002592,"FABRICA IMAGINARIA DE RECUBRIM","B34567890      ","POL. IND. IMAGINARIO, C/E, 3       ","00003","CIUDAD TRES                       "',
  '"1",260930,"7050003  ","N/FACTURA 004605                   ","004605         ","H",0000012345,"PRES SERV FABRICA IMAGINARIA DE RECUBR","B34567890      ","POL. IND. IMAGINARIO, C/E, 3       ","00003","CIUDAD TRES                       "',
  '"1",260930,"4300004  ","N/FACTURA 004606                   ","004606         ","D",0000007109,"TALLER DEMO, S.L.U.           ","B45678901      ","POL. IND. DEMO                     ","00004","VILLA CUATRO                      "',
  '"2",260930,"4300004  ","TALLER DEMO, S.L.U.           ","B45678901      ",2100,0500,0000005875,0000001234,0000000000,0000007109,"004606         "," ","R"',
  '"3",260930,261015,"4300004  ",0000007109,"004606         ","C","               "',
  '"1",260930,"4770000  ","N/FACTURA 004606                   ","004606         ","H",0000001234,"TALLER DEMO, S.L.U.           ","B45678901      ","POL. IND. DEMO                     ","00004","VILLA CUATRO                      "',
  '"1",260930,"7050004  ","N/FACTURA 004606                   ","004606         ","H",0000005875,"PRES SERV TALLER DEMO, S.L.U. ","B45678901      ","POL. IND. DEMO                     ","00004","VILLA CUATRO                      "',
].join("\r\n");

// Quoted fields may hold commas, like the addresses
function parseRecords(csv: string): Array<Array<string>> {
  return csv
    .split("\r\n")
    .filter((line) => line !== "")
    .map((line) => (line.match(/"[^"]*"|[^,]+/g) ?? []).map((field) => field.replace(/^"|"$/g, "")));
}

function toExportDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Madrid",
    year: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}${part("month")}${part("day")}`;
}

async function getExpectedVatBreakdown(invoiceId: number) {
  const invoice = await getInvoiceById(invoiceId);
  expect(invoice).toBeDefined();
  const lines = [];
  for (const { id } of invoice!.deliveryNotes) {
    const deliveryNote = await getDeliveryNoteWithLinesForDocument(id);
    expect(deliveryNote).toBeDefined();
    lines.push(
      ...deliveryNote!.deliveryNoteLines.map((deliveryNoteLine) => ({
        quantity: deliveryNoteLine.quantity,
        unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
        vatPercentage: deliveryNoteLine.vatPercentage,
      })),
    );
  }
  return getVatBreakdown(lines);
}

function trackDownloads(page: Page) {
  const downloads: Array<Download> = [];
  page.on("download", (download) => downloads.push(download));
  return downloads;
}

async function assertTableInvoicesAccounted(tableInvoices: Locator, invoiceIds: Array<number>, accounted: boolean) {
  for (const invoiceId of invoiceIds) {
    const checkbox = getTableRowByTestId(tableInvoices, invoiceId).getByTestId("checkbox-accounted");
    await (accounted ? expect(checkbox).toBeChecked() : expect(checkbox).not.toBeChecked());
  }
}

test(
  "account the invoices into the file for Prisma",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    await test.step("the export format", () => {
      // It reproduces the file exported by the old program, byte for byte
      const csv = getAccountingExportCsv(MOCK_INVOICES);
      expect(csv).toBe(`${MOCK_CSV}\r\n`);
      expect(encodeAccountingExportCsv(csv).toString("latin1")).toBe(csv);

      // It holds the records of every VAT rate of an invoice
      const [invoice] = MOCK_INVOICES;
      const vatBreakdown = [
        { taxableBaseInCents: 10000, vatInCents: 2100, vatPercentage: 21 },
        { taxableBaseInCents: 5000, vatInCents: 500, vatPercentage: 10 },
        { taxableBaseInCents: 3000, vatInCents: 0, vatPercentage: 0 },
      ];
      const records = parseRecords(getAccountingExportCsv([{ ...invoice, vatBreakdown }]));

      const vatLedgerRecords = records.filter((record) => record[0] === "2");
      expect(vatLedgerRecords.map((record) => [record[5], record[7], record[8], record[10]])).toEqual([
        ["2100", "0000010000", "0000002100", "0000012100"],
        ["1000", "0000005000", "0000000500", "0000005500"],
        ["0000", "0000003000", "0000000000", "0000003000"],
      ]);

      // The output VAT is credited once for each rate that charges it, the income once for the whole taxable base,
      // and the Cliente is debited with the total
      const journalLines = records
        .filter((record) => record[0] === "1")
        .map((record) => [record[2].trim(), record[5], Number(record[6])]);
      expect(journalLines).toEqual([
        ["4300001", "D", 20600],
        ["4770000", "H", 2100],
        ["4770000", "H", 500],
        ["7050001", "H", 18000],
      ]);
      expect(records.filter((record) => record[0] === "3").map((record) => Number(record[4]))).toEqual([20600]);

      // It is encoded in ISO-8859-1: Prisma cannot read the characters out of it, and the quotes inside a field
      // would end it
      const encoded = encodeAccountingExportCsv(
        getAccountingExportCsv([
          { ...invoice, client: { ...invoice.client, address: 'C/ ESPAÑA, Nº 5 "€"', legalName: "PEÑA Ⅳ, S.L." } },
        ]),
      );
      expect(encoded.toString("latin1")).toContain(`"C/ ESPAÑA, Nº 5 '?'`);
      expect(encoded.toString("latin1")).toContain(`"PEÑA ?, S.L.`);
      expect(encoded.includes(Buffer.from([0xd1]))).toBe(true);

      // An amount longer than its fixed-width field is detected before the file is written
      expect(MOCK_INVOICES.some(hasAmountTooLarge)).toBe(false);
      const largestInvoice = {
        ...invoice,
        vatBreakdown: [{ taxableBaseInCents: 8_264_462_809, vatInCents: 1_735_537_190, vatPercentage: 21 }],
      };
      expect(hasAmountTooLarge(largestInvoice)).toBe(false);
      expect(parseRecords(getAccountingExportCsv([largestInvoice]))[0][6]).toBe(String(MAX_AMOUNT_IN_CENTS));
      expect(
        hasAmountTooLarge({
          ...invoice,
          vatBreakdown: [{ taxableBaseInCents: 8_264_462_810, vatInCents: 1_735_537_190, vatPercentage: 21 }],
        }),
      ).toBe(true);
      // The total fits, but a negative line hides a VAT rate that does not
      expect(
        hasAmountTooLarge({
          ...invoice,
          vatBreakdown: [
            { taxableBaseInCents: -100, vatInCents: -21, vatPercentage: 21 },
            { taxableBaseInCents: MAX_AMOUNT_IN_CENTS + 1, vatInCents: 0, vatPercentage: 0 },
          ],
        }),
      ).toBe(true);
    });

    await test.step("account the pending invoices into the file for Prisma", async () => {
      const pendingInvoices = mockInvoices.filter((invoice) => !invoice.accounted);
      const accountedInvoices = mockInvoices.filter((invoice) => invoice.accounted);
      expect(pendingInvoices.length).toBeGreaterThan(1);
      expect(accountedInvoices.length).toBeGreaterThan(0);
      // The pending Facturas cover a payment method with receipts, one without them, and several VAT rates
      expect(
        pendingInvoices.map((invoice) => getMockPaymentMethodById(invoice.paymentMethodId!)!.generatesReceipt),
      ).toEqual(expect.arrayContaining([true, false]));
      const vatRatesCounts = await Promise.all(
        pendingInvoices.map(async (invoice) => (await getExpectedVatBreakdown(invoice.id)).length),
      );
      expect(vatRatesCounts.some((vatRatesCount) => vatRatesCount > 1)).toBe(true);

      // Nothing is accounted while a Cliente has no Prisma accounting account
      const clientWithoutAccount = mockClients.find((client) =>
        pendingInvoices.some((invoice) => invoice.clientId === client.id),
      )!;
      await db
        .update(dbTableClient)
        .set({ prismaAccountingAccountId: null })
        .where(eq(dbTableClient.id, clientWithoutAccount.id));

      await page.goto("/invoicing");
      const tableInvoices = page.getByTestId("table-invoice");
      await assertTableInvoicesAccounted(
        tableInvoices,
        pendingInvoices.map((invoice) => invoice.id),
        false,
      );

      const downloads = trackDownloads(page);
      await confirmAccountInvoices(page);
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText(
        `estos Clientes no tienen cuenta contable de Prisma: ${clientWithoutAccount.name}`,
      );
      expect(downloads).toHaveLength(0);
      for (const invoice of await getInvoices()) {
        expect(invoice.accounted, `Factura ${invoice.id}`).toBe(
          mockInvoices.find(({ id }) => id === invoice.id)!.accounted,
        );
      }

      // Once the Cliente has its account the pending Facturas are accounted
      await clearToasts(page);
      await page.goto(`/client/${clientWithoutAccount.id}`);
      const formClient = page.getByTestId("form-client");
      await assertFormLoaded(formClient);
      await getFormInputByLabel(formClient, "Cuenta contable Prisma").fill(
        clientWithoutAccount.prismaAccountingAccountId!,
      );
      await formClient.getByTestId("button-submit").click();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      // Nothing is accounted while an Albarán has a Línea without price, added by hand or from a Pedido de venta,
      // as it would be exported at 0 €
      const pendingDeliveryNoteIds = mockDeliveryNotes
        .filter((deliveryNote) => pendingInvoices.some((invoice) => invoice.id === deliveryNote.invoiceId))
        .map((deliveryNote) => deliveryNote.id);
      const unpricedLine = mockDeliveryNoteLines.find(
        (line) =>
          pendingDeliveryNoteIds.includes(line.deliveryNoteId) &&
          line.sellOrderLineId === null &&
          line.unitPrice === null,
      )!;
      expect(unpricedLine, "A pending Factura should have a Línea without price").toBeDefined();
      const linkedLine = mockDeliveryNoteLines.find(
        (line) =>
          pendingDeliveryNoteIds.includes(line.deliveryNoteId) &&
          line.deliveryNoteId !== unpricedLine.deliveryNoteId &&
          line.sellOrderLineId !== null,
      )!;
      expect(linkedLine, "Another Albarán of a pending Factura should have a Línea of a Pedido de venta").toBeDefined();
      const linkedSellOrderLine = getMockSellOrderLineById(linkedLine.sellOrderLineId!)!;
      expect(linkedSellOrderLine.partPrice).not.toBeNull();
      await db
        .update(dbTableSellOrderLine)
        .set({ partPrice: null })
        .where(eq(dbTableSellOrderLine.id, linkedSellOrderLine.id));

      await page.goto("/invoicing");
      await confirmAccountInvoices(page);
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText(
        `estos Albaranes tienen Líneas sin precio: ${[unpricedLine.deliveryNoteId, linkedLine.deliveryNoteId].sort((a, b) => a - b).join(", ")}`,
      );
      expect(downloads).toHaveLength(0);
      for (const invoice of await getInvoices()) {
        expect(invoice.accounted, `Factura ${invoice.id}`).toBe(
          mockInvoices.find(({ id }) => id === invoice.id)!.accounted,
        );
      }

      await db
        .update(dbTableDeliveryNoteLine)
        .set({ unitPrice: "3.5" })
        .where(eq(dbTableDeliveryNoteLine.id, unpricedLine.id));
      await db
        .update(dbTableSellOrderLine)
        .set({ partPrice: linkedSellOrderLine.partPrice })
        .where(eq(dbTableSellOrderLine.id, linkedSellOrderLine.id));
      await clearToasts(page);

      // Nothing is accounted while an amount does not fit in its field of the file
      const [invoiceWithAmountTooLarge] = pendingInvoices;
      const deliveryNote = await getDeliveryNoteWithLinesForDocument(
        (await getInvoiceById(invoiceWithAmountTooLarge.id))!.deliveryNotes[0].id,
      );
      const sellOrderLine = deliveryNote!.deliveryNoteLines
        .map((deliveryNoteLine) => deliveryNoteLine.sellOrderLine)
        .find((line) => line !== null)!;
      await db
        .update(dbTableSellOrderLine)
        .set({ partPrice: String(MAX_AMOUNT_IN_CENTS) })
        .where(eq(dbTableSellOrderLine.id, sellOrderLine.id));

      await page.goto("/invoicing");
      await confirmAccountInvoices(page);
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText(`no caben en el fichero de Prisma: ${invoiceWithAmountTooLarge.id}`);
      expect(downloads).toHaveLength(0);
      for (const invoice of await getInvoices()) {
        expect(invoice.accounted, `Factura ${invoice.id}`).toBe(
          mockInvoices.find(({ id }) => id === invoice.id)!.accounted,
        );
      }

      await db
        .update(dbTableSellOrderLine)
        .set({ partPrice: sellOrderLine.partPrice })
        .where(eq(dbTableSellOrderLine.id, sellOrderLine.id));
      await clearToasts(page);

      await page.goto("/invoicing");
      const { content, fileName } = await workflowAccountInvoices(page);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      expect(fileName).toBe(`facturas-${pendingInvoices.at(0)!.id}-${pendingInvoices.at(-1)!.id}.csv`);
      const csv = content.toString("latin1");
      expect(csv.endsWith("\r\n")).toBe(true);
      const records = parseRecords(csv);

      // Only the Facturas that were pending are exported, in order
      const exportedInvoiceNumbers = [
        ...new Set(
          records.map((record) => (record[0] === "2" ? record[11] : record[0] === "3" ? record[5] : record[4])),
        ),
      ];
      expect(exportedInvoiceNumbers.map((invoiceNumber) => invoiceNumber.trim())).toEqual(
        pendingInvoices.map((invoice) => String(invoice.id).padStart(6, "0")),
      );

      for (const invoice of pendingInvoices) {
        const invoiceNumber = String(invoice.id).padStart(6, "0").padEnd(15);
        const invoiceRecords = records.filter((record) => [record[4], record[5], record[11]].includes(invoiceNumber));
        const client = getMockClientById(invoice.clientId)!;
        const clientAccount = client.prismaAccountingAccountId!;
        const vatBreakdown = await getExpectedVatBreakdown(invoice.id);
        const taxableBaseInCents = vatBreakdown.reduce((total, item) => total + item.taxableBaseInCents, 0);
        const vatInCents = vatBreakdown.reduce((total, item) => total + item.vatInCents, 0);

        const journalLines = invoiceRecords.filter((record) => record[0] === "1");
        for (const record of journalLines) {
          expect(record[1]).toBe(toExportDate(invoice.createdAt));
          expect(record[3]).toBe(`N/FACTURA ${String(invoice.id).padStart(6, "0")}`.padEnd(35));
          expect(record.slice(8)).toEqual([
            client.taxId.padEnd(15),
            client.address.slice(0, 35).padEnd(35),
            client.postalCode.padEnd(5),
            client.city.padEnd(34),
          ]);
        }
        expect(journalLines.map((record) => [record[2].trim(), record[5], Number(record[6])])).toEqual([
          [clientAccount, "D", taxableBaseInCents + vatInCents],
          ...vatBreakdown.filter((item) => item.vatInCents !== 0).map((item) => ["4770000", "H", item.vatInCents]),
          [`705${clientAccount.slice(3, 7)}`, "H", taxableBaseInCents],
        ]);

        expect(
          invoiceRecords
            .filter((record) => record[0] === "2")
            .map((record) => [record[5], Number(record[7]), Number(record[8])]),
        ).toEqual(
          vatBreakdown.map((item) => [
            String(item.vatPercentage * 100).padStart(4, "0"),
            item.taxableBaseInCents,
            item.vatInCents,
          ]),
        );

        const receiptRecords = invoiceRecords.filter((record) => record[0] === "3");
        if (getMockPaymentMethodById(invoice.paymentMethodId!)!.generatesReceipt) {
          expect(receiptRecords.map((record) => [record[2], record[3].trim(), Number(record[4])])).toEqual([
            [toExportDate(invoice.dueDate), clientAccount, taxableBaseInCents + vatInCents],
          ]);
        } else {
          expect(receiptRecords).toHaveLength(0);
        }
      }

      // Every Factura is accounted now
      for (const invoice of await getInvoices()) {
        expect(invoice.accounted, `Factura ${invoice.id}`).toBe(true);
      }
      await assertTableInvoicesAccounted(
        tableInvoices,
        mockInvoices.map((invoice) => invoice.id),
        true,
      );

      // ...so a new export has nothing to download
      await clearToasts(page);
      downloads.length = 0;
      await confirmAccountInvoices(page);
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("No hay Facturas pendientes de contabilizar");
      expect(downloads).toHaveLength(0);
    });

    await test.step("an accounted invoice can be marked as not accounted and is exported again", async () => {
      await clearToasts(page);
      for (const invoice of mockInvoices) {
        await db.update(dbTableInvoice).set({ accounted: invoice.accounted }).where(eq(dbTableInvoice.id, invoice.id));
      }
      const accountedInvoices = mockInvoices.filter((invoice) => invoice.accounted);
      const pendingInvoices = mockInvoices.filter((invoice) => !invoice.accounted);
      expect(accountedInvoices.length).toBeGreaterThan(1);
      const [invoiceToUnaccount, otherAccountedInvoice] = accountedInvoices;

      await page.goto("/invoicing");
      const tableInvoices = page.getByTestId("table-invoice");

      // Only the accounted invoices have the action enabled
      for (const invoice of mockInvoices) {
        await expect(
          getTableRowByTestId(tableInvoices, invoice.id).getByTestId("button-unaccount-invoice"),
        ).toBeEnabled({
          enabled: invoice.accounted,
        });
      }

      // An invoice that is no longer accounted cannot be marked as not accounted
      const setOtherAccounted = async (accounted: boolean) => {
        await db.update(dbTableInvoice).set({ accounted }).where(eq(dbTableInvoice.id, otherAccountedInvoice.id));
      };
      await holdRequestWhile({
        page,
        procedurePath: "invoice.unaccount",
        send: async () =>
          workflowUnaccountInvoice(
            page,
            otherAccountedInvoice.id,
            `Factura contabilizada con ID ${otherAccountedInvoice.id} no encontrada`,
          ),
        meanwhile: async () => setOtherAccounted(false),
      });
      await setOtherAccounted(true);

      // Cancelling the confirmation changes nothing
      const rowInvoice = getTableRowByTestId(tableInvoices, invoiceToUnaccount.id);
      await rowInvoice.getByTestId("button-unaccount-invoice").click();
      const dialog = page.getByTestId("dialog-unaccount-invoice-content");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(`Factura ${invoiceToUnaccount.id}`);
      await dialog.getByRole("button", { name: "Cerrar" }).click();
      await expect(dialog).not.toBeVisible();
      expect((await getInvoiceById(invoiceToUnaccount.id))?.accounted).toBe(true);

      await workflowUnaccountInvoice(page, invoiceToUnaccount.id);
      await assertTableInvoicesAccounted(tableInvoices, [invoiceToUnaccount.id], false);
      await expect(rowInvoice.getByTestId("button-unaccount-invoice")).toBeDisabled();
      expect((await getInvoiceById(invoiceToUnaccount.id))?.accounted).toBe(false);

      // The other invoices are not touched
      await assertTableInvoicesAccounted(tableInvoices, [otherAccountedInvoice.id], true);
      expect((await getInvoiceById(otherAccountedInvoice.id))?.accounted).toBe(true);

      // The invoice is exported again along with the invoices that were pending
      const { content, fileName } = await workflowAccountInvoices(page);
      const exportedInvoiceIds = [...pendingInvoices, invoiceToUnaccount]
        .map((invoice) => invoice.id)
        .sort((a, b) => a - b);
      // The unaccounted invoice has a lower id but is updated last, so its row is no longer in id order
      expect(fileName).toBe(`facturas-${exportedInvoiceIds.at(0)}-${exportedInvoiceIds.at(-1)}.csv`);
      const exportedInvoiceNumbers = new Set(
        parseRecords(content.toString("latin1")).map((record) =>
          (record[0] === "2" ? record[11] : record[0] === "3" ? record[5] : record[4]).trim(),
        ),
      );
      expect([...exportedInvoiceNumbers]).toEqual(exportedInvoiceIds.map((id) => String(id).padStart(6, "0")));
      await assertTableInvoicesAccounted(tableInvoices, [invoiceToUnaccount.id], true);
    });
  },
);

// The expected amounts are written by hand, as the helpers of the tests share the price logic of the app
test("every kind of delivery note line is invoiced and accounted with its price", async ({ page, db }) => {
  const client = mockClients[1];
  const sellOrder = mockSellOrders.find(
    (mockSellOrder) => mockSellOrder.clientId === client.id && mockSellOrder.deletedAt === null,
  )!;
  const partReferenceId = mockSellOrderLines.find(
    (line) => line.sellOrderId === sellOrder.id && line.partReferenceId !== null,
  )!.partReferenceId!;
  const [partSellOrderLine, customSellOrderLine] = await db
    .insert(dbTableSellOrderLine)
    .values([
      { partPrice: "25.75", partReferenceId, pendingQuantity: 0, quantity: 3, sellOrderId: sellOrder.id },
      {
        description: "Línea sin Referencia",
        partPrice: "2.345",
        pendingQuantity: 0,
        quantity: 5,
        sellOrderId: sellOrder.id,
      },
    ])
    .returning();
  // No other Albarán of the Cliente is delivered that day, so the Factura holds this one alone
  const [deliveryNote] = await db
    .insert(dbTableDeliveryNote)
    .values({ clientId: client.id, createdAt: MOCK_INITIAL_DATE, deliveryDate: MOCK_INITIAL_DATE })
    .returning();

  const expectedLines = [
    // Takes the price of its Línea del Pedido de venta
    {
      line: { partReferenceId, quantity: 2, sellOrderLineId: partSellOrderLine.id, unitPrice: null, vatPercentage: 21 },
      totalInCents: 5150,
    },
    // Its own price wins over the one of its Línea del Pedido de venta
    {
      line: { partReferenceId, quantity: 1, sellOrderLineId: partSellOrderLine.id, unitPrice: "20", vatPercentage: 21 },
      totalInCents: 2000,
    },
    // Without Artículo, from a Línea del Pedido de venta without Artículo. 7.035 is rounded half up
    {
      line: { quantity: 3, sellOrderLineId: customSellOrderLine.id, unitPrice: null, vatPercentage: 10 },
      totalInCents: 704,
    },
    {
      line: { quantity: 2, sellOrderLineId: customSellOrderLine.id, unitPrice: "1.5", vatPercentage: 10 },
      totalInCents: 300,
    },
    // Without Artículo nor Pedido de venta
    { line: { quantity: 4, unitPrice: "0.125", vatPercentage: 4 }, totalInCents: 50 },
    // With Artículo but without Pedido de venta. 9.999 is rounded up
    { line: { partReferenceId, quantity: 3, unitPrice: "3.333", vatPercentage: 0 }, totalInCents: 1000 },
  ];
  const taxableBaseInCents = 9204;
  const totalInCents = 10808;
  expect(expectedLines.reduce((total, expectedLine) => total + expectedLine.totalInCents, 0)).toBe(taxableBaseInCents);

  const deliveryNoteLines = await db
    .insert(dbTableDeliveryNoteLine)
    .values(
      expectedLines.map(({ line }, index) => ({
        ...line,
        deliveryNoteId: deliveryNote.id,
        description: `Línea ${index + 1}`,
      })),
    )
    .returning();

  expect(await getDeliveryNoteTotalInCents(deliveryNote.id)).toBe(taxableBaseInCents);

  const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(page, deliveryNote.id);
  const tableDeliveryNoteLines = dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line");
  for (const [index, deliveryNoteLine] of deliveryNoteLines.entries()) {
    await expect(getTableRowByTestId(tableDeliveryNoteLines, deliveryNoteLine.id).getByTestId("total")).toHaveText(
      formatCents(expectedLines[index].totalInCents),
    );
  }
  await expect(dialogCreateEditDeliveryNote.getByTestId("span-delivery-note-lines-total")).toHaveText(
    `Total sin IVA: ${formatCents(taxableBaseInCents)}`,
  );

  const invoice = await workflowCreateInvoice(page, {
    client,
    endDate: MOCK_INITIAL_DATE,
    startDate: MOCK_INITIAL_DATE,
  });
  expect(invoice.deliveryNotes.map((invoiceDeliveryNote) => invoiceDeliveryNote.id)).toEqual([deliveryNote.id]);
  const rowInvoice = getTableRowByTestId(page.getByTestId("table-invoice"), invoice.id);
  await expect(rowInvoice.getByTestId("taxableBase")).toHaveText(formatCents(taxableBaseInCents));
  await expect(rowInvoice.getByTestId("total")).toHaveText(formatCents(totalInCents));

  // Only this Factura is exported. The VAT is rounded once for each rate: 21 % of 71.50 is 15.015
  await db.update(dbTableInvoice).set({ accounted: true }).where(ne(dbTableInvoice.id, invoice.id));
  const { content } = await workflowAccountInvoices(page);
  const records = parseRecords(content.toString("latin1"));
  expect(
    records.filter((record) => record[0] === "2").map((record) => [record[5], Number(record[7]), Number(record[8])]),
  ).toEqual([
    ["2100", 7150, 1502],
    ["1000", 1004, 100],
    ["0400", 50, 2],
    ["0000", 1000, 0],
  ]);
  expect(records.filter((record) => record[0] === "1" && record[5] === "D").map((record) => Number(record[6]))).toEqual(
    [totalInCents],
  );
});
