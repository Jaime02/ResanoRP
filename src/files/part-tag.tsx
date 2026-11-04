import path from "node:path";

import ResanoLogo from "@/components/images/ResanoLogo";
import { Separator } from "@/components/ui/separator";
import { renderPdf } from "@/files";
import { AutoFitText } from "@/files";
import { cn } from "@/lib/utils";
import { COATING_LABEL, PART_LABEL, QUANTITY_LABEL } from "@/messages/common";
import { DELIVERY_LABEL, SELL_ORDER_LABEL } from "@/messages/sell-order";
import type { TDeliveryNoteLineTagGroup } from "@/schemas/delivery-note-line";

if (process.env.TAGS_ROOT_PATH === undefined) {
  throw new Error("Environment variable TAGS_ROOT_PATH is not set");
}

const TAG_WIDTH = "6in";
const TAG_HEIGHT = "4in";

function getTagPath(tagName: string) {
  return path.join(process.env.TAGS_ROOT_PATH!, `${tagName}.pdf`);
}

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
          maxPt={36}
          minPt={20}
          value={heading}
        />
      )}
      {reference !== undefined && partDescription !== undefined && (
        <AutoFitText
          className="leading-snug text-neutral-800"
          idealChars={50}
          maxLines={2}
          maxPt={14}
          minPt={9}
          value={partDescription}
        />
      )}
    </div>
  );
}

function TagLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-[10pt] leading-none font-semibold tracking-widest text-neutral-600 uppercase">
      {children}
    </span>
  );
}

const TAG_FIELD_VARIANTS = {
  default: { className: "font-bold", idealChars: 16, maxPt: 16, minPt: 10 },
  strong: { className: "font-extrabold", idealChars: 8, maxPt: 26, minPt: 12 },
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
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between gap-1",
        align === "right" && "items-end text-right",
        className,
      )}
    >
      <TagLabel>{label}</TagLabel>
      <AutoFitText className={cn("leading-tight", textClassName)} maxLines={2} value={value} wrap={wrap} {...size} />
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
}

function PartTagTemplate({
  reference,
  partDescription,
  coatingName,
  sellOrderReference,
  requestedDeliveryDate,
  partQuantity,
  isLast,
}: PartTagTemplateProps) {
  return (
    <div
      className="flex flex-col gap-2 overflow-hidden px-[0.22in] py-[0.18in] text-black"
      style={{ breakAfter: isLast ? undefined : "page", height: TAG_HEIGHT, width: TAG_WIDTH }}
    >
      <div className="flex items-stretch justify-between gap-2">
        <ResanoLogo className="h-12 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-end gap-4">
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
      <Separator orientation="horizontal" />
      <TagPart reference={reference} partDescription={partDescription} />
      <Separator orientation="horizontal" />
      <div className="flex items-stretch justify-between gap-4">
        <TagField className="shrink-0" label={QUANTITY_LABEL} value={partQuantity} variant="strong" wrap={false} />
        {coatingName !== undefined && <TagField className="flex-1" label={COATING_LABEL} value={coatingName} />}
      </div>
    </div>
  );
}

interface PrintTagPartProps extends Omit<PartTagTemplateProps, "partQuantity" | "isLast"> {
  tagGroups: TDeliveryNoteLineTagGroup;
  tagName: string;
  saveHtml?: boolean;
}

export async function printTagPart({ tagGroups, tagName, saveHtml = false, ...props }: PrintTagPartProps) {
  const partQuantities = tagGroups.flatMap((tagGroup) =>
    Array.from({ length: tagGroup.tagQuantity }, () => tagGroup.partQuantity),
  );
  if (partQuantities.length === 0) return;

  await renderPdf({
    document: partQuantities.map((partQuantity, index) => (
      <PartTagTemplate
        isLast={index === partQuantities.length - 1}
        key={index}
        partQuantity={partQuantity}
        {...props}
      />
    )),
    path: getTagPath(tagName),
    height: TAG_HEIGHT,
    saveHtml,
    width: TAG_WIDTH,
  });
}
