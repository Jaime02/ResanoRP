import path from "node:path";

import { Fragment } from "react";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Separator } from "@/components/ui/separator";
import { renderPdf } from "@/files";
import { AutoFitText } from "@/files";
import { formatDate, formatPartUnits } from "@/lib/formatters";
import { allocateTagSellOrders } from "@/lib/part-tag";
import type { TTagSellOrder } from "@/lib/part-tag";
import { cn } from "@/lib/utils";
import { CLIENT_LABEL, COATING_LABEL, QUANTITY_LABEL, TOTAL_LABEL } from "@/messages/common";
import { DELIVERY_LABEL, SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TDeliveryNoteLineTagGroup } from "@/schemas/delivery-note-line";
import type { TTagLabelSize } from "@/schemas/printer";

if (process.env.TAGS_ROOT_PATH === undefined) {
  throw new Error("Environment variable TAGS_ROOT_PATH is not set");
}

// 6 × 4 in, the size the layout is designed at
const TAG_WIDTH_MM = 152.4;
const TAG_HEIGHT_MM = 101.6;
// Rounds the layout down, so its scaled size never exceeds the page and starts a blank one
const LAYOUT_MM_PRECISION = 100;

export function getPartTagPath(tagName: string) {
  return path.join(process.env.TAGS_ROOT_PATH!, `${tagName}.pdf`);
}

interface TTagPage {
  widthMm: number;
  heightMm: number;
  scale: number;
}

// The tag is landscape, so the longer side of the labels runs across it. The layout is scaled to the side that fits and
// stretches along the other one, so it fills the label
function getTagPage(labelSize: TTagLabelSize): TTagPage {
  if (labelSize === null) return { heightMm: TAG_HEIGHT_MM, scale: 1, widthMm: TAG_WIDTH_MM };
  const widthMm = Math.max(labelSize.labelWidthMm, labelSize.labelLengthMm);
  const heightMm = Math.min(labelSize.labelWidthMm, labelSize.labelLengthMm);
  return { heightMm, scale: Math.min(widthMm / TAG_WIDTH_MM, heightMm / TAG_HEIGHT_MM), widthMm };
}

const toLayoutMm = (pageMm: number, scale: number) =>
  `${Math.floor((pageMm / scale) * LAYOUT_MM_PRECISION) / LAYOUT_MM_PRECISION}mm`;

interface TagPartProps {
  reference?: string;
  partDescription?: string;
  coatingName?: string;
}

function TagPart({ reference, partDescription, coatingName }: TagPartProps) {
  const heading = reference ?? partDescription;
  const description = reference !== undefined ? partDescription : undefined;
  const coating = coatingName !== undefined ? `${COATING_LABEL}: ${coatingName}` : undefined;
  const details = [description, coating].filter((detail) => detail !== undefined);
  return (
    // Safe, so a part too long for the tag is cut at the bottom and its label stays
    <div className="flex min-h-0 flex-1 flex-col justify-center-safe gap-1 overflow-hidden">
      {heading !== undefined && (
        <AutoFitText
          className="leading-none font-extrabold"
          idealChars={14}
          maxLines={2}
          maxPt={38}
          minPt={22}
          value={heading}
        />
      )}
      {details.length > 0 && (
        <AutoFitText className="flex flex-col gap-1" idealChars={60} maxPt={20} minPt={16} value={details.join(" ")}>
          {description !== undefined && <span className="max-w-full truncate font-bold">{description}</span>}
          {coating !== undefined && <span className="max-w-full truncate">{coating}</span>}
        </AutoFitText>
      )}
    </div>
  );
}

interface TagSellOrdersProps {
  sellOrders: Array<{ reference: string; quantity: number }>;
  partQuantity: number;
}

// The more Pedidos share the box, the less height each row has, so its text shrinks
const TAG_SELL_ORDER_SIZES = [
  { idealChars: 20, maxPt: 22, minPt: 19 },
  { idealChars: 24, maxPt: 20, minPt: 16 },
  { idealChars: 24, maxPt: 18, minPt: 15 },
  { idealChars: 24, maxPt: 15, minPt: 13 },
] as const;

// Bigger than the rows of the Pedidos it adds up, yet not so tall that it stretches them
const TAG_TOTAL_SIZE = { idealChars: 6, maxPt: 24, minPt: 18 };

// One row per Pedido in the box, and a mixed box shows the total of its units at the right
function TagSellOrders({ sellOrders, partQuantity }: TagSellOrdersProps) {
  const size = TAG_SELL_ORDER_SIZES[Math.min(sellOrders.length, TAG_SELL_ORDER_SIZES.length) - 1];
  // Every reference and quantity is sized by the longest reference, so the Pedidos share one font size
  const isSingle = sellOrders.length === 1;
  const getReferenceText = (reference: string) => (isSingle ? `${SELL_ORDER_LABEL}: ${reference}` : reference);
  const longestReference = sellOrders.reduce((longest, { reference }) => {
    const text = getReferenceText(reference);
    return text.length > longest.length ? text : longest;
  }, "");
  return (
    <div className="flex items-end gap-3">
      <div className="grid min-w-0 grid-cols-[minmax(0,max-content)_auto_auto] items-baseline gap-x-2">
        {sellOrders.map((sellOrder, index) => (
          <Fragment key={index}>
            <AutoFitText
              className="leading-tight font-bold text-ellipsis"
              wrap={false}
              value={longestReference}
              {...size}
            >
              {getReferenceText(sellOrder.reference)}
            </AutoFitText>
            {sellOrders.length > 1 && (
              <>
                <Separator className="bg-black" orientation="vertical" thickness="thin" />
                <AutoFitText
                  className="text-right leading-tight font-bold"
                  wrap={false}
                  value={longestReference}
                  {...size}
                >
                  {formatPartUnits(sellOrder.quantity)}
                </AutoFitText>
              </>
            )}
          </Fragment>
        ))}
      </div>
      {sellOrders.length === 1 ? (
        <AutoFitText className="ml-auto leading-tight font-bold" wrap={false} value={longestReference} {...size}>
          {formatPartUnits(sellOrders[0].quantity)}
        </AutoFitText>
      ) : (
        <>
          <Separator className="bg-black" orientation="vertical" thickness="thin" />
          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
            <TagLabel>{TOTAL_LABEL}</TagLabel>
            <AutoFitText
              className="leading-none font-extrabold"
              value={partQuantity}
              wrap={false}
              {...TAG_TOTAL_SIZE}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TagLabel({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 text-[14pt] leading-none font-semibold tracking-wider uppercase">{children}</span>;
}

// A value too long for one line takes a second one in a slightly smaller font
const TAG_HEADER_VALUE_SIZE = { idealChars: 30, maxPt: 18, minPt: 16 };

function TagHeaderField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col items-end gap-1 text-right", className)}>
      <TagLabel>{label}</TagLabel>
      <AutoFitText className="leading-tight font-bold" maxLines={2} value={value} {...TAG_HEADER_VALUE_SIZE} />
    </div>
  );
}

interface PartTagTemplateProps extends TagPartProps {
  // Not known for an Orden de producción without Pedido
  clientName?: string;
  sellOrders: Array<TTagSellOrder>;
  partQuantity: number;
  isLast: boolean;
  page: TTagPage;
}

function getEarliestDeliveryDate(sellOrders: Array<TTagSellOrder>) {
  const dates = sellOrders.flatMap((sellOrder) => sellOrder.requestedDeliveryDate ?? []);
  return dates.length > 0 ? formatDate(new Date(Math.min(...dates.map((date) => date.getTime())))) : null;
}

function PartTagTemplate({ clientName, sellOrders, partQuantity, isLast, page, ...partProps }: PartTagTemplateProps) {
  const requestedDeliveryDate = getEarliestDeliveryDate(sellOrders);
  return (
    <div
      className="flex flex-col gap-2 overflow-hidden p-[0.24in] text-black"
      style={{
        breakAfter: isLast ? undefined : "page",
        height: toLayoutMm(page.heightMm, page.scale),
        width: toLayoutMm(page.widthMm, page.scale),
        zoom: page.scale,
      }}
    >
      <div className="flex items-stretch justify-between gap-5">
        <ResanoLogo className="h-12 shrink-0 [&_g:first-child]:fill-black" />
        {clientName !== undefined && <TagHeaderField className="grow" label={CLIENT_LABEL} value={clientName} />}
        {requestedDeliveryDate !== null && (
          <TagHeaderField className="shrink-0" label={DELIVERY_LABEL} value={requestedDeliveryDate} />
        )}
      </div>
      <Separator className="bg-black" orientation="horizontal" thickness="thin" />
      <TagPart {...partProps} />
      <Separator className="bg-black" orientation="horizontal" thickness="thin" />
      {sellOrders.length > 0 ? (
        <TagSellOrders sellOrders={sellOrders} partQuantity={partQuantity} />
      ) : (
        <div className="flex shrink-0 flex-col gap-1">
          <TagLabel>{QUANTITY_LABEL}</TagLabel>
          <AutoFitText
            className="font-extrabold"
            idealChars={8}
            maxPt={28}
            minPt={22}
            value={partQuantity}
            wrap={false}
          />
        </div>
      )}
    </div>
  );
}

// The heading of the tag is the reference or, without it, the description, so one of them is always needed
type TTagArticle = { reference: string; partDescription?: string } | { reference?: undefined; partDescription: string };

type PrintTagPartProps = TTagArticle &
  Omit<PartTagTemplateProps, "reference" | "partDescription" | "partQuantity" | "isLast" | "page"> & {
    tagGroups: TDeliveryNoteLineTagGroup;
    tagName: string;
    labelSize: TTagLabelSize;
    saveHtml?: boolean;
  };

export async function printTagPart({
  sellOrders,
  tagGroups,
  tagName,
  labelSize,
  saveHtml = false,
  ...props
}: PrintTagPartProps) {
  const partQuantities = tagGroups.flatMap((tagGroup) =>
    Array.from({ length: tagGroup.tagQuantity }, () => tagGroup.partQuantity),
  );
  if (partQuantities.length === 0) return;

  const tagsSellOrders = allocateTagSellOrders(partQuantities, sellOrders);
  const page = getTagPage(labelSize);
  await renderPdf({
    document: partQuantities.map((partQuantity, index) => (
      <PartTagTemplate
        isLast={index === partQuantities.length - 1}
        key={index}
        page={page}
        partQuantity={partQuantity}
        sellOrders={tagsSellOrders[index]}
        {...props}
      />
    )),
    path: getPartTagPath(tagName),
    height: `${page.heightMm}mm`,
    saveHtml,
    width: `${page.widthMm}mm`,
  });
}
