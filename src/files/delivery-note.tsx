import path from "node:path";

import { Separator } from "@/components/ui/separator";
import { renderPdf } from "@/files";
import { FieldBox, SalesDocumentHeader, SalesDocumentLinesTable } from "@/files/sales-document";
import type { TSalesDocumentClient, TSalesDocumentCompany, TSalesDocumentLine } from "@/files/sales-document";
import { formatCents, getLinesTotalInCents } from "@/lib/prices";
import { DATE_LABEL, TOTAL_LABEL } from "@/messages/common";
import { DELIVERY_NOTE_LABEL, DELIVERY_NOTE_PRINT_NUMBER_LABEL } from "@/messages/delivery-note";

if (process.env.DELIVERY_NOTE_ROOT_PATH === undefined) {
  throw new Error("Environment variable DELIVERY_NOTE_ROOT_PATH is not set");
}

interface DeliveryNoteDocumentProps {
  company: TSalesDocumentCompany;
  client: TSalesDocumentClient;
  deliveryNoteId: number;
  deliveryDate: string | null;
  deliveryMethodName: string | null;
  lines: Array<TSalesDocumentLine>;
  withPrices: boolean;
}

function DocumentFooter({
  deliveryMethodName,
  totalInCents,
  withPrices,
}: Pick<DeliveryNoteDocumentProps, "deliveryMethodName" | "withPrices"> & {
  totalInCents: number | null;
}) {
  return (
    <div className="flex flex-col gap-2" style={{ breakInside: "avoid" }}>
      <Separator thickness="thin" />
      <div className="flex items-start justify-between gap-4">
        {deliveryMethodName !== null && <span>Transporte: {deliveryMethodName}</span>}
        {withPrices && (
          <FieldBox
            className="ml-auto"
            fields={[{ label: TOTAL_LABEL, value: formatCents(totalInCents) }]}
            valueClassName="text-right"
          />
        )}
      </div>
    </div>
  );
}

function DeliveryNoteDocument({
  company,
  client,
  deliveryNoteId,
  deliveryDate,
  deliveryMethodName,
  lines,
  withPrices,
  totalInCents,
  isLast,
}: DeliveryNoteDocumentProps & { totalInCents: number | null; isLast: boolean }) {
  return (
    <div className="flex flex-col gap-3 p-1" style={{ breakAfter: isLast ? undefined : "page" }}>
      <SalesDocumentHeader
        title={DELIVERY_NOTE_LABEL}
        fields={[
          { label: DELIVERY_NOTE_PRINT_NUMBER_LABEL, value: String(deliveryNoteId) },
          { label: DATE_LABEL, value: deliveryDate ?? "" },
        ]}
        company={company}
        client={client}
      />
      <SalesDocumentLinesTable lines={lines} withPrices={withPrices} />
      <DocumentFooter deliveryMethodName={deliveryMethodName} totalInCents={totalInCents} withPrices={withPrices} />
    </div>
  );
}

// Each version gets its own file, so printing one never replaces another that is being previewed or printed
function getDeliveryNoteFileName(deliveryNoteId: number, copies: number, withPrices: boolean) {
  return `${deliveryNoteId}${withPrices ? "-prices" : ""}${copies > 1 ? `-x${copies}` : ""}.pdf`;
}

export function getDeliveryNotePath(deliveryNoteId: number, copies: number, withPrices: boolean) {
  return path.join(process.env.DELIVERY_NOTE_ROOT_PATH!, getDeliveryNoteFileName(deliveryNoteId, copies, withPrices));
}

interface PrintDeliveryNoteProps extends DeliveryNoteDocumentProps {
  copies?: number;
  saveHtml?: boolean;
}

export async function printDeliveryNote({ copies = 1, saveHtml = false, ...props }: PrintDeliveryNoteProps) {
  const totalInCents = props.withPrices ? getLinesTotalInCents(props.lines) : null;

  await renderPdf({
    document: Array.from({ length: copies }, (_, copyIndex) => (
      <DeliveryNoteDocument {...props} isLast={copyIndex === copies - 1} key={copyIndex} totalInCents={totalInCents} />
    )),
    path: getDeliveryNotePath(props.deliveryNoteId, copies, props.withPrices),
    margin: "1cm",
    format: "A4",
    saveHtml,
  });
}
