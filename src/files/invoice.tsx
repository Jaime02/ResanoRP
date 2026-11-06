import path from "node:path";

import { renderPdf } from "@/files";
import { FieldBox, SalesDocumentHeader, SalesDocumentLinesTable } from "@/files/sales-document";
import type { TSalesDocumentClient, TSalesDocumentCompany, TSalesDocumentLine } from "@/files/sales-document";
import { maskBankAccount } from "@/lib/formatters";
import { formatCents, getLinesTotalInCents, getVatBreakdown } from "@/lib/prices";
import { DATE_LABEL } from "@/messages/common";
import {
  DELIVERY_NOTE_TOTAL_LABEL,
  INVOICE_LABEL,
  INVOICE_NUMBER_LABEL,
  INVOICE_TOTAL_LABEL,
  TAXABLE_BASE_LABEL,
} from "@/messages/invoice";

if (process.env.INVOICE_ROOT_PATH === undefined) {
  throw new Error("Environment variable INVOICE_ROOT_PATH is not set");
}

interface TInvoiceDocumentLine extends TSalesDocumentLine {
  vatPercentage: number;
}

interface TInvoiceDocumentDeliveryNote {
  id: number;
  deliveryDate: string | null;
  lines: Array<TInvoiceDocumentLine>;
}

interface InvoiceDocumentProps {
  company: TSalesDocumentCompany;
  client: TSalesDocumentClient;
  invoiceId: number;
  date: string | null;
  dueDate: string | null;
  paymentMethodName: string | null;
  bankAccount: string | null;
  footnote: string | null;
  deliveryNotes: Array<TInvoiceDocumentDeliveryNote>;
}

function InvoiceDeliveryNote({ deliveryNote }: { deliveryNote: TInvoiceDocumentDeliveryNote }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-bold" style={{ breakAfter: "avoid" }}>
        Albarán Nº {deliveryNote.id}
        {deliveryNote.deliveryDate !== null && ` - ${deliveryNote.deliveryDate}`}
      </span>
      <SalesDocumentLinesTable lines={deliveryNote.lines} withPrices />
      <div className="flex justify-end" style={{ breakInside: "avoid" }}>
        <FieldBox
          fields={[{ label: DELIVERY_NOTE_TOTAL_LABEL, value: formatCents(getLinesTotalInCents(deliveryNote.lines)) }]}
          valueClassName="text-right"
          inline
        />
      </div>
    </div>
  );
}

function InvoiceFooter({
  dueDate,
  paymentMethodName,
  bankAccount,
  footnote,
  lines,
}: Pick<InvoiceDocumentProps, "dueDate" | "paymentMethodName" | "bankAccount" | "footnote"> & {
  lines: Array<TInvoiceDocumentLine>;
}) {
  const vatBreakdown = getVatBreakdown(lines);
  const taxableBaseInCents = getLinesTotalInCents(lines);
  const totalVatInCents = vatBreakdown.reduce((accumulated, item) => accumulated + item.vatInCents, 0);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-2" style={{ breakInside: "avoid" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col text-sm">
          {dueDate !== null && <span>Vencimiento: {dueDate}</span>}
          {paymentMethodName !== null && <span>Forma de pago: {paymentMethodName}</span>}
          {bankAccount !== null && <span>Cuenta bancaria: {maskBankAccount(bankAccount)}</span>}
        </div>
        <FieldBox
          fields={[
            { label: TAXABLE_BASE_LABEL, value: formatCents(taxableBaseInCents) },
            ...vatBreakdown
              .filter((item) => item.vatPercentage !== 0)
              .map((item) => ({
                label: `IVA ${item.vatPercentage}%`,
                value: formatCents(item.vatInCents),
              })),
            { label: INVOICE_TOTAL_LABEL, value: formatCents(taxableBaseInCents + totalVatInCents) },
          ]}
          valueClassName="text-right"
        />
      </div>
      {footnote !== null && <p className="text-sm whitespace-pre-line">{footnote}</p>}
    </div>
  );
}

function InvoiceDocument({ company, client, invoiceId, date, deliveryNotes, ...footerProps }: InvoiceDocumentProps) {
  const lines = deliveryNotes.flatMap((deliveryNote) => deliveryNote.lines);

  return (
    <div className="flex flex-col gap-3 p-1">
      <SalesDocumentHeader
        title={INVOICE_LABEL}
        fields={[
          { label: INVOICE_NUMBER_LABEL, value: String(invoiceId) },
          { label: DATE_LABEL, value: date ?? "" },
        ]}
        company={company}
        client={client}
      />
      {deliveryNotes.map((deliveryNote) => (
        <InvoiceDeliveryNote key={deliveryNote.id} deliveryNote={deliveryNote} />
      ))}
      <InvoiceFooter {...footerProps} lines={lines} />
    </div>
  );
}

export function getInvoicePath(invoiceId: number) {
  return path.join(process.env.INVOICE_ROOT_PATH!, `${invoiceId}.pdf`);
}

export function getAccountingExportPath(fileName: string) {
  return path.join(process.env.INVOICE_ROOT_PATH!, fileName);
}

interface GetInvoiceEmailProps {
  invoiceId: number;
  from: string | null;
  to: Array<string>;
  pdf: Buffer;
}

// X-Unsent makes eM Client and Outlook open the file as a draft ready to send instead of as a received message,
// and they pick the sending account whose address matches From.
// The boundary contains "-", which base64 never does, so it cannot collide with the attachment content
export function getInvoiceEmail({ invoiceId, from, to, pdf }: GetInvoiceEmailProps) {
  const boundary = "invoice-attachment";
  return [
    "X-Unsent: 1",
    ...(from !== null ? [`From: ${from}`] : []),
    ...(to.length > 0 ? [`To: ${to.join(", ")}`] : []),
    `Subject: Factura ${invoiceId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="Factura ${invoiceId}.pdf"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="Factura ${invoiceId}.pdf"`,
    "",
    ...(pdf.toString("base64").match(/.{1,76}/g) ?? []),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

interface PrintInvoiceProps extends InvoiceDocumentProps {
  saveHtml?: boolean;
}

export async function printInvoice({ saveHtml = false, ...props }: PrintInvoiceProps) {
  await renderPdf({
    document: <InvoiceDocument {...props} />,
    path: getInvoicePath(props.invoiceId),
    margin: "1cm",
    format: "A4",
    saveHtml,
  });
}
