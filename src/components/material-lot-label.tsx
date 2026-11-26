import ShapeIcon from "@/components/icons/shape";
import { MATERIAL_LOT_LABEL_SEPARATOR } from "@/lib/formatters";
import { MATERIAL_LOT_QUANTITY_MESSAGE } from "@/messages/material-lot";
import type { TQueryMaterialLot } from "@/queries/material-lot";

export default function MaterialLotLabel({ materialLot }: { materialLot: TQueryMaterialLot }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {materialLot.heat !== null && (
        <span>
          {materialLot.heat}
          {MATERIAL_LOT_LABEL_SEPARATOR}
        </span>
      )}
      <ShapeIcon shapeName={materialLot.material?.shape?.name} />
      <span className="min-w-0 truncate">
        {materialLot.materialName}
        {MATERIAL_LOT_LABEL_SEPARATOR}
        {MATERIAL_LOT_QUANTITY_MESSAGE(materialLot.remaining, materialLot.unit)}
      </span>
    </span>
  );
}
