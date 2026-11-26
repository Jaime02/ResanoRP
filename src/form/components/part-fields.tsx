import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import DialogMaterialLotMovement from "@/components/dialog/material-lot-movement";
import ShapeIcon from "@/components/icons/shape";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import { Badge, BadgeList } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import {
  formatInactiveMaterialMessage,
  formatMaterial,
  formatPartDimension,
  formatUsedMaterialLot,
} from "@/lib/formatters";
import { COATING_LABEL, DESCRIPTION_LABEL, SIZE_LABEL } from "@/messages/common";
import { MATERIALS_LABEL, NO_MATERIALS_ASSIGNED_MESSAGE } from "@/messages/material";
import { useQueryMaterialLotMovements, useQueryMaterialLots } from "@/queries/material-lot";
import type { TActiveProductionOrder } from "@/queries/production-order";
import { MaterialLotMovementMode } from "@/types/material-lot";

function ButtonTakeMaterialLot({ materialId, productionOrderId }: { materialId: number; productionOrderId: number }) {
  const { data: materialLots, isLoading } = useQueryMaterialLots({ materialIds: [materialId] });
  const availableMaterialLots = useMemo(
    () => materialLots.filter((materialLot) => materialLot.remaining > 0),
    [materialLots],
  );

  return (
    <DialogMaterialLotMovement
      mode={MaterialLotMovementMode.Take}
      materialLots={availableMaterialLots}
      productionOrderId={productionOrderId}
      disabled={isLoading}
      icon={PlusIcon}
      variant="success"
      iconOnly
    />
  );
}

function MaterialLotsUsed({ materialId, productionOrderId }: { materialId: number; productionOrderId: number }) {
  const { data: movements } = useQueryMaterialLotMovements({ productionOrderId });
  const usedMaterialLots = useMemo(() => {
    const takenOf = new Map<
      number,
      { materialLot: NonNullable<(typeof movements)[number]["materialLot"]>; taken: number }
    >();
    for (const { materialLot, quantity } of movements) {
      if (materialLot?.materialId !== materialId) continue;
      takenOf.set(materialLot.id, { materialLot, taken: (takenOf.get(materialLot.id)?.taken ?? 0) - quantity });
    }
    return [...takenOf.values()];
  }, [movements, materialId]);

  return usedMaterialLots.map(({ materialLot, taken }) => (
    <Badge key={materialLot.id} variant="secondary" testId={`used-material-lot-${materialLot.id}`}>
      {formatUsedMaterialLot(materialLot, taken)}
    </Badge>
  ));
}

interface PartFieldsProps {
  part?: TActiveProductionOrder["part"];
  // The Orden de producción whose used Lotes are shown next to each Material
  productionOrderId?: number;
  canTakeMaterial?: boolean;
}

export default function PartFields({ part, productionOrderId, canTakeMaterial = false }: PartFieldsProps) {
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
        <BadgeList
          className="grid auto-cols-max grid-flow-col items-start"
          noChildrenText={NO_MATERIALS_ASSIGNED_MESSAGE}
        >
          {part?.materials.map((material) => (
            <div
              key={material.id}
              data-testid={`part-material-${material.id}`}
              className="flex flex-col items-start gap-2"
            >
              <div className="flex items-center gap-2">
                <Badge>
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
                {canTakeMaterial &&
                  productionOrderId !== undefined &&
                  formatInactiveMaterialMessage(material) === null && (
                    <ButtonTakeMaterialLot materialId={material.id} productionOrderId={productionOrderId} />
                  )}
              </div>
              {productionOrderId !== undefined && (
                <MaterialLotsUsed materialId={material.id} productionOrderId={productionOrderId} />
              )}
            </div>
          ))}
        </BadgeList>
      </FieldLayoutContainer>
    </>
  );
}
