import path from "node:path";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Separator } from "@/components/ui/separator";
import { renderPdf } from "@/files";
import { AutoFitText } from "@/files";
import { cn } from "@/lib/utils";
import { COATING_LABEL, PART_LABEL, QUANTITY_LABEL } from "@/messages/common";
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

function TagPart({ reference, partDescription }: { reference?: string; partDescription?: string }) {
  const heading = reference ?? partDescription;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
      <TagLabel>{PART_LABEL}</TagLabel>
      {heading !== undefined && (
        <AutoFitText
          className="leading-tight font-extrabold"
          idealChars={14}
          maxLines={2}
          maxPt={38}
          minPt={22}
          value={heading}
        />
      )}
      {reference !== undefined && partDescription !== undefined && (
        <AutoFitText
          className="leading-snug"
          idealChars={50}
          maxLines={2}
          maxPt={16}
          minPt={12}
          value={partDescription}
        />
      )}
    </div>
  );
}

function TagLabel({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 leading-none font-semibold tracking-wider uppercase">{children}</span>;
}

const TAG_FIELD_VARIANTS = {
  default: { className: "font-bold", idealChars: 20, maxPt: 18, minPt: 15 },
  strong: { className: "font-extrabold", idealChars: 8, maxPt: 26, minPt: 20 },
} as const;

interface TagFieldProps {
  label: string;
  value: string | number;
  className?: string;
  align?: "left" | "right";
  variant?: keyof typeof TAG_FIELD_VARIANTS;
  wrap?: boolean;
}

function TagField({ label, value, className, align = "left", variant = "default", wrap }: TagFieldProps) {
  const { className: textClassName, ...size } = TAG_FIELD_VARIANTS[variant];
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", align === "right" && "items-end text-right", className)}>
      <TagLabel>{label}</TagLabel>
      <AutoFitText className={textClassName} maxLines={2} value={value} wrap={wrap} {...size} />
    </div>
  );
}

interface PartTagTemplateProps {
  reference?: string;
  partDescription?: string;
  coatingName?: string;
  sellOrderReference?: string;
  requestedDeliveryDate?: string;
  partQuantity: number;
  isLast: boolean;
  page: TTagPage;
}

function PartTagTemplate({
  reference,
  partDescription,
  coatingName,
  sellOrderReference,
  requestedDeliveryDate,
  partQuantity,
  isLast,
  page,
}: PartTagTemplateProps) {
  return (
    <div
      className="flex flex-col gap-4 overflow-hidden p-[0.24in] text-black"
      style={{
        breakAfter: isLast ? undefined : "page",
        height: toLayoutMm(page.heightMm, page.scale),
        width: toLayoutMm(page.widthMm, page.scale),
        zoom: page.scale,
      }}
    >
      <div className="flex items-stretch justify-between gap-4">
        <ResanoLogo className="h-12 shrink-0 [&_g:first-child]:fill-black" />
        <div className="flex min-w-0 flex-1 justify-end gap-3">
          {sellOrderReference !== undefined && (
            <TagField className="flex-1" label={SELL_ORDER_LABEL} value={sellOrderReference} />
          )}
          {requestedDeliveryDate !== undefined && (
            <TagField
              align="right"
              className="shrink-0"
              label={DELIVERY_LABEL}
              value={requestedDeliveryDate}
              wrap={false}
            />
          )}
        </div>
      </div>
      <Separator className="bg-black" orientation="horizontal" />
      <TagPart reference={reference} partDescription={partDescription} />
      <Separator className="bg-black" orientation="horizontal" />
      <div className="flex items-stretch justify-between gap-4">
        <TagField className="shrink-0" label={QUANTITY_LABEL} value={partQuantity} variant="strong" wrap={false} />
        {coatingName !== undefined && <TagField className="flex-1" label={COATING_LABEL} value={coatingName} />}
      </div>
    </div>
  );
}

interface PrintTagPartProps extends Omit<PartTagTemplateProps, "partQuantity" | "isLast" | "page"> {
  tagGroups: TDeliveryNoteLineTagGroup;
  tagName: string;
  labelSize: TTagLabelSize;
  saveHtml?: boolean;
}

export async function printTagPart({ tagGroups, tagName, labelSize, saveHtml = false, ...props }: PrintTagPartProps) {
  const partQuantities = tagGroups.flatMap((tagGroup) =>
    Array.from({ length: tagGroup.tagQuantity }, () => tagGroup.partQuantity),
  );
  if (partQuantities.length === 0) return;

  const page = getTagPage(labelSize);
  await renderPdf({
    document: partQuantities.map((partQuantity, index) => (
      <PartTagTemplate
        isLast={index === partQuantities.length - 1}
        key={index}
        page={page}
        partQuantity={partQuantity}
        {...props}
      />
    )),
    path: getPartTagPath(tagName),
    height: `${page.heightMm}mm`,
    saveHtml,
    width: `${page.widthMm}mm`,
  });
}
