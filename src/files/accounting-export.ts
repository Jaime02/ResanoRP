import { formatAppDate } from "@/lib/dates";
import type { TVatBreakdownItem } from "@/lib/prices";

// The format reproduces the CSV that is exported to Prisma, the accounting program: every field is fixed
// width, text fields are quoted and padded with spaces, and amounts are written in cents padded with zeros.
// Every Factura becomes a journal entry ("1" lines), a record of the VAT ledger for each VAT rate ("2") and, when
// its payment method generates one, the receipt with its due date ("3").

const OUTPUT_VAT_ACCOUNT = "4770000";
const CLIENT_ACCOUNT_GROUP = "430";
const SERVICES_INCOME_ACCOUNT_GROUP = "705";
const VAT_LEDGER_CONSTANT = "0500";
const AMOUNT_DIGITS = 10;
export const MAX_AMOUNT_IN_CENTS = 10 ** AMOUNT_DIGITS - 1;

export interface TAccountingExportInvoice {
  id: number;
  createdAt: Date;
  dueDate: Date;
  generatesReceipt: boolean;
  vatBreakdown: Array<TVatBreakdownItem>;
  client: {
    accountingAccountId: string;
    legalName: string;
    taxId: string;
    address: string;
    postalCode: string;
    city: string;
  };
}

function text(value: string, width: number, maxWidth = width) {
  return `"${value.replaceAll('"', "'").slice(0, maxWidth).padEnd(width)}"`;
}

function amount(cents: number) {
  return (cents < 0 ? "-" : "") + String(Math.abs(cents)).padStart(AMOUNT_DIGITS, "0");
}

function getTotalsInCents(vatBreakdown: Array<TVatBreakdownItem>) {
  const taxableBaseInCents = vatBreakdown.reduce((total, item) => total + item.taxableBaseInCents, 0);
  const vatInCents = vatBreakdown.reduce((total, item) => total + item.vatInCents, 0);
  return { taxableBaseInCents, totalInCents: taxableBaseInCents + vatInCents };
}

// A longer amount would shift every field after it. Each VAT rate is checked on its own, because with negative
// lines one rate can be larger than the total
export function hasAmountTooLarge(invoice: TAccountingExportInvoice): boolean {
  const { taxableBaseInCents, totalInCents } = getTotalsInCents(invoice.vatBreakdown);
  return [
    taxableBaseInCents,
    totalInCents,
    ...invoice.vatBreakdown.flatMap((item) => [
      item.taxableBaseInCents,
      item.vatInCents,
      item.taxableBaseInCents + item.vatInCents,
    ]),
  ].some((cents) => Math.abs(cents) > MAX_AMOUNT_IN_CENTS);
}

function date(value: Date) {
  return formatAppDate(value, "yyMMdd");
}

function getInvoiceRecords(invoice: TAccountingExportInvoice): Array<string> {
  const { client } = invoice;
  const invoiceNumber = text(String(invoice.id).padStart(6, "0"), 15);
  const invoiceDate = date(invoice.createdAt);
  const clientAccount = text(client.accountingAccountId, 9);
  // The system cut the account to 7 digits, so the clients with 9 digit accounts share the same one
  const servicesIncomeAccount = text(
    SERVICES_INCOME_ACCOUNT_GROUP + client.accountingAccountId.slice(CLIENT_ACCOUNT_GROUP.length, 7),
    9,
  );
  const concept = text(`N/FACTURA ${String(invoice.id).padStart(6, "0")}`, 35);
  const clientFields = [
    text(client.taxId, 15),
    text(client.address, 35),
    // The system wrote the postal codes as they were stored, so the longer ones are not cut
    text(client.postalCode, 5, Infinity),
    text(client.city, 34),
  ];

  const { taxableBaseInCents, totalInCents } = getTotalsInCents(invoice.vatBreakdown);

  const journalLine = (account: string, side: "D" | "H", cents: number, name: string) =>
    ['"1"', invoiceDate, account, concept, invoiceNumber, `"${side}"`, amount(cents), name, ...clientFields].join(",");

  return [
    journalLine(clientAccount, "D", totalInCents, text(client.legalName, 30)),
    ...invoice.vatBreakdown.map((item) =>
      [
        '"2"',
        invoiceDate,
        clientAccount,
        text(client.legalName, 30),
        text(client.taxId, 15),
        String(item.vatPercentage * 100).padStart(4, "0"),
        VAT_LEDGER_CONSTANT,
        amount(item.taxableBaseInCents),
        amount(item.vatInCents),
        amount(0),
        amount(item.taxableBaseInCents + item.vatInCents),
        invoiceNumber,
        '" "',
        '"R"',
      ].join(","),
    ),
    ...(invoice.generatesReceipt
      ? [
          [
            '"3"',
            invoiceDate,
            date(invoice.dueDate),
            clientAccount,
            amount(totalInCents),
            invoiceNumber,
            '"C"',
            text("", 15),
          ].join(","),
        ]
      : []),
    ...invoice.vatBreakdown
      .filter((item) => item.vatInCents !== 0)
      .map((item) => journalLine(text(OUTPUT_VAT_ACCOUNT, 9), "H", item.vatInCents, text(client.legalName, 30))),
    journalLine(
      servicesIncomeAccount,
      "H",
      taxableBaseInCents,
      text(`PRES SERV ${client.legalName.slice(0, 30).trimEnd()}`, 30, 38),
    ),
  ];
}

export function getAccountingExportCsv(invoices: Array<TAccountingExportInvoice>): string {
  return invoices.flatMap(getInvoiceRecords).join("\r\n") + "\r\n";
}

// Prisma reads the file as ISO-8859-1, so the characters it cannot hold are replaced instead of being written
// as other characters
export function encodeAccountingExportCsv(csv: string): Buffer {
  return Buffer.from(csv.replace(/[\u{100}-\u{10ffff}]/gu, "?"), "latin1");
}
