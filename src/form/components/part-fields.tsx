import ShapeIcon from "@/components/icons/shape";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import { Badge, BadgeList } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { formatMaterial, formatPartDimension } from "@/lib/formatters";
import { COATING_LABEL, DESCRIPTION_LABEL, SIZE_LABEL } from "@/messages/common";
import { MATERIALS_LABEL, NO_MATERIALS_ASSIGNED_MESSAGE } from "@/messages/material";
import type { TActiveProductionOrder } from "@/queries/production-order";

export default function PartFields({ part }: { part?: TActiveProductionOrder["part"] }) {
  return (
    <>
      <FieldLayoutContainer>
        <FieldLabel>{DESCRIPTION_LABEL}</FieldLabel>
        <Input value={part?.description} readOnly />
      </FieldLayoutContainer>
      <FieldLayoutContainer>
        <FieldLabel>{SIZE_LABEL}</FieldLabel>
        <span className="inline-flex items-center gap-1">
          <ShapeIcon shapeName={part?.shape?.name} />
          {formatPartDimension({
            width: part?.width,
            length: part?.length,
          })}
        </span>
      </FieldLayoutContainer>
      <FieldLayoutContainer>
        <FieldLabel>{COATING_LABEL}</FieldLabel>
        <Input value={part?.coating?.name} readOnly />
      </FieldLayoutContainer>
      <FieldLayoutContainer>
        <FieldLabel>{MATERIALS_LABEL}</FieldLabel>
        <BadgeList orientation="vertical" noChildrenText={NO_MATERIALS_ASSIGNED_MESSAGE}>
          {part?.materials.map((material) => (
            <Badge key={material.id}>
              <TooltipInactiveMaterial material={material}>
                <span className="inline-flex items-center gap-1">
                  <ShapeIcon shapeName={material.shape?.name} />
                  {formatMaterial({
                    rawMaterialName: material.rawMaterial?.name,
                    width: material.width,
                  })}
                </span>
              </TooltipInactiveMaterial>
            </Badge>
          ))}
        </BadgeList>
      </FieldLayoutContainer>
    </>
  );
}
