import { FunnelIcon, XIcon } from "lucide-react";

import ComboboxRawMaterial from "@/components/combobox/raw-material";
import ComboboxShape from "@/components/combobox/shape";
import { Button } from "@/components/ui/button";
import NumberInput from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { CLEAR_FILTERS_LABEL, SEARCH_PLACEHOLDER, SHAPE_LABEL, SIZE_LABEL } from "@/messages/common";
import { RAW_MATERIAL_LABEL } from "@/messages/material";
import type { TFilterValue } from "@/schemas";

type TMaterialFilterIds = Record<"width" | "rawMaterialId" | "shapeId", string>;

const MATERIAL_FILTER_IDS: TMaterialFilterIds = {
  width: "materialWidth",
  rawMaterialId: "materialRawMaterialId",
  shapeId: "materialShapeId",
};

interface PopoverPartMaterialFiltersProps {
  getFilterValue: (filterId: string) => TFilterValue | undefined;
  setFilterValues: (filterValues: Record<string, TFilterValue>) => void;
  filterIds?: TMaterialFilterIds;
}

export default function PopoverPartMaterialFilters({
  getFilterValue,
  setFilterValues,
  filterIds = MATERIAL_FILTER_IDS,
}: PopoverPartMaterialFiltersProps) {
  const widthValue = getFilterValue(filterIds.width);
  const width = typeof widthValue === "string" ? widthValue : null;
  const rawMaterialIdValue = getFilterValue(filterIds.rawMaterialId);
  const rawMaterialId = typeof rawMaterialIdValue === "number" ? rawMaterialIdValue : null;
  const shapeIdValue = getFilterValue(filterIds.shapeId);
  const shapeId = typeof shapeIdValue === "number" ? shapeIdValue : null;

  return (
    <div data-testid="popover-part-material-filters" className="flex flex-row gap-1">
      <Popover>
        <PopoverTrigger variant="secondary" size="icon">
          <FunnelIcon />
        </PopoverTrigger>
        <PopoverContent>
          <FieldLayoutContainer>
            <FieldLabel>{SIZE_LABEL}</FieldLabel>
            <NumberInput
              testId="input-filter-material-width"
              value={width}
              onValueChange={(value) => setFilterValues({ [filterIds.width]: value })}
              decimalScale={1}
              placeholder={SEARCH_PLACEHOLDER}
            />
          </FieldLayoutContainer>
          <FieldLayoutContainer>
            <FieldLabel>{RAW_MATERIAL_LABEL}</FieldLabel>
            <ComboboxRawMaterial
              testId="combobox-filter-material-raw-material"
              activeItemId={rawMaterialId ?? undefined}
              onValueChange={(rawMaterial) => setFilterValues({ [filterIds.rawMaterialId]: rawMaterial?.id ?? null })}
              nullable
            />
          </FieldLayoutContainer>
          <FieldLayoutContainer>
            <FieldLabel>{SHAPE_LABEL}</FieldLabel>
            <ComboboxShape
              testId="combobox-filter-material-shape"
              activeItemId={shapeId ?? undefined}
              onValueChange={(shape) => setFilterValues({ [filterIds.shapeId]: shape?.id ?? null })}
              nullable
            />
          </FieldLayoutContainer>
        </PopoverContent>
      </Popover>
      {(width !== null || rawMaterialId !== null || shapeId !== null) && (
        <Button
          testId="button-clear-filters"
          aria-label={CLEAR_FILTERS_LABEL}
          size="icon"
          variant="destructive"
          onClick={() =>
            setFilterValues(Object.fromEntries(Object.values(filterIds).map((filterId) => [filterId, null])))
          }
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
