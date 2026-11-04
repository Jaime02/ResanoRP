import { GlobeIcon, MailIcon, PhoneIcon } from "lucide-react";
import { Fragment } from "react";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPublicImageDataUri, WRAPPING_CELL_CLASS_NAME } from "@/files";
import { formatPrice } from "@/lib/formatters";
import { formatCents, getDeliveryNoteLineUnitPrice, getLineTotalInCents } from "@/lib/prices";
import { cn } from "@/lib/utils";
import { DESCRIPTION_LABEL, PART_LABEL, PRICE_LABEL, QUANTITY_LABEL, TOTAL_LABEL } from "@/messages/common";
import { SELL_ORDER_LABEL } from "@/messages/sell-order";

export interface TSalesDocumentCompany {
  legalName: string;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface TSalesDocumentClient {
  id: number;
  legalName: string;
  taxId: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
}

export interface TSalesDocumentLine {
  id: number;
  reference: string | null;
  description: string;
  sellOrderReference: string | null;
  quantity: number;
  unitPrice: string | null;
}

interface TDeliveryNoteLineWithRelations {
  id: number;
  description: string;
  quantity: number;
  partReference: { reference: string } | null;
  sellOrderLine: { partPrice: string | null; sellOrder: { clientReference: string | null } | null } | null;
  unitPrice: string | null;
}

export function getSalesDocumentLine(deliveryNoteLine: TDeliveryNoteLineWithRelations): TSalesDocumentLine {
  return {
    description: deliveryNoteLine.description,
    id: deliveryNoteLine.id,
    quantity: deliveryNoteLine.quantity,
    reference: deliveryNoteLine.partReference?.reference ?? null,
    sellOrderReference: deliveryNoteLine.sellOrderLine?.sellOrder?.clientReference ?? null,
    unitPrice: getDeliveryNoteLineUnitPrice(deliveryNoteLine),
  };
}

function LogoLabelContainer({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

interface FieldBoxProps {
  fields: Array<{ label: string; value: string }>;
  className?: string;
  valueClassName?: string;
  inline?: boolean;
}

// A grid keeps the label and value rows on the same column tracks, so a wide value (or a label
// that would otherwise wrap) widens both rows' cells together instead of leaving their dividers
// out of alignment.
export function FieldBox({ fields, className, valueClassName, inline = false }: FieldBoxProps) {
  if (inline) {
    return (
      <div className={cn("flex rounded-md border border-border", className)}>
        {fields.map((field, index) => (
          <Fragment key={field.label}>
            <span className={cn("px-2 py-1 font-semibold", index > 0 && "border-l border-border")}>{field.label}</span>
            <span className={cn("border-l border-border px-2 py-1 font-bold", valueClassName)}>{field.value}</span>
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("grid rounded-md border border-border", className)}
      style={{ gridTemplateColumns: `repeat(${fields.length}, auto)` }}
    >
      {fields.map((field, index) => (
        <span
          className={cn("border-b border-border px-2 py-1 text-center font-semibold", index > 0 && "border-l")}
          key={field.label}
        >
          {field.label}
        </span>
      ))}
      {fields.map((field, index) => (
        <span
          className={cn("border-border px-2 py-1 text-center font-bold", index > 0 && "border-l", valueClassName)}
          key={field.label}
        >
          {field.value}
        </span>
      ))}
    </div>
  );
}

interface SalesDocumentHeaderProps {
  title: string;
  fields: FieldBoxProps["fields"];
  company: TSalesDocumentCompany;
  client: TSalesDocumentClient;
}

export function SalesDocumentHeader({ title, fields, company, client }: SalesDocumentHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-center justify-between gap-4">
        <ResanoLogo className="h-14" />
        <img alt="Applus" className="w-12" src={getPublicImageDataUri("Applus.webp")} />
        <span className="flex-1 text-center text-4xl font-bold tracking-wider uppercase">{title}</span>
        <FieldBox fields={fields} />
      </div>
      <div className="flex flex-row gap-3">
        <div className="flex flex-1 shrink-0 flex-col text-sm whitespace-nowrap">
          {company.address !== null && <span>{company.address}</span>}
          <span>{[company.postalCode, company.city, company.province].filter(Boolean).join(" ")}</span>
          {company.phone !== null && (
            <LogoLabelContainer>
              <PhoneIcon size={14} />
              {company.phone}
            </LogoLabelContainer>
          )}
          {company.email !== null && (
            <LogoLabelContainer>
              <MailIcon size={14} />
              {company.email}
            </LogoLabelContainer>
          )}
          {company.website !== null && (
            <LogoLabelContainer>
              <GlobeIcon size={14} />
              {company.website}
            </LogoLabelContainer>
          )}
        </div>
        <div className="flex flex-col justify-center gap-1 overflow-hidden rounded-md border border-black p-2">
          <span className="text-xl font-bold">{client.legalName}</span>
          <div className="flex flex-col">
            {client.address !== null && <span>{client.address}</span>}
            <span>{[client.postalCode, client.city, client.province, client.country].filter(Boolean).join(" ")}</span>
            {client.taxId !== null && <span>CIF / NIF: {client.taxId}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SalesDocumentLinesTableProps {
  lines: Array<TSalesDocumentLine>;
  withPrices: boolean;
}

export function SalesDocumentLinesTable({ lines, withPrices }: SalesDocumentLinesTableProps) {
  return (
    <Table
      className="overflow-visible rounded-none border-0 text-sm"
      tableClassName="border-collapse border border-border [&_td]:border [&_td]:border-border [&_th]:border-y [&_th]:border-border"
    >
      <TableHead className="table-header-group">
        <TableRow>
          <TableHeader className="w-px text-center">#</TableHeader>
          <TableHeader>{PART_LABEL}</TableHeader>
          <TableHeader>{DESCRIPTION_LABEL}</TableHeader>
          <TableHeader>{SELL_ORDER_LABEL}</TableHeader>
          <TableHeader className="text-right">{QUANTITY_LABEL}</TableHeader>
          {withPrices && (
            <>
              <TableHeader className="text-right">{PRICE_LABEL}</TableHeader>
              <TableHeader className="text-right">{TOTAL_LABEL}</TableHeader>
            </>
          )}
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((line, index) => (
          <TableRow key={line.id} style={{ breakInside: "avoid" }}>
            <TableCell className="w-px text-right">{index + 1}</TableCell>
            <TableCell>{line.reference ?? ""}</TableCell>
            <TableCell className={WRAPPING_CELL_CLASS_NAME}>{line.description}</TableCell>
            <TableCell>{line.sellOrderReference ?? ""}</TableCell>
            <TableCell className="text-right">{line.quantity}</TableCell>
            {withPrices && (
              <>
                <TableCell className="text-right">
                  {line.unitPrice !== null ? formatPrice(line.unitPrice) : ""}
                </TableCell>
                <TableCell className="text-right">{formatCents(getLineTotalInCents(line))}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
