import { FileTextIcon } from "lucide-react";

import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper, DEFAULT_DATETIME_COLUMN_SIZE } from "@/components/table/column-helper";
import { buttonVariants } from "@/components/ui/button-variants";
import { DateFormat, formatDate } from "@/lib/formatters";
import { DATE_LABEL, QUANTITY_LABEL } from "@/messages/common";
import {
  MATERIAL_LOT_CERTIFICATE_LABEL,
  MATERIAL_LOT_MOVEMENTS_TITLE,
  MATERIAL_LOT_QUANTITY_MESSAGE,
  NO_MATERIAL_USED_MESSAGE,
} from "@/messages/material-lot";
import { PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import type { TQueryMaterialLotMovement } from "@/queries/material-lot";

export function MaterialCertificateLink({ materialLot }: { materialLot?: { id: number; hasCertificate: boolean } }) {
  if (materialLot?.hasCertificate !== true) return null;
  return (
    <a
      data-testid="link-material-certificate"
      href={`/api/files/material-certificate/${materialLot.id}`}
      target="_blank"
      rel="noreferrer"
      aria-label={MATERIAL_LOT_CERTIFICATE_LABEL}
      className={buttonVariants({ size: "icon", variant: "secondary" })}
    >
      <FileTextIcon />
    </a>
  );
}

const columnHelper = createTableColumnHelper<TQueryMaterialLotMovement>();

const dateColumn = columnHelper.accessor((movement) => formatDate(movement.date, DateFormat.Datetime), {
  header: DATE_LABEL,
  id: "date",
  size: DEFAULT_DATETIME_COLUMN_SIZE,
});
const quantityColumn = columnHelper.accessor(
  (movement) =>
    movement.materialLot !== undefined
      ? MATERIAL_LOT_QUANTITY_MESSAGE(movement.quantity, movement.materialLot.unit)
      : "",
  { header: QUANTITY_LABEL, id: "quantity" },
);

const COLUMNS = [
  dateColumn,
  quantityColumn,
  columnHelper.accessor("productionOrderId", { header: PRODUCTION_ORDER_LABEL, id: "productionOrderId" }),
];

interface TableMaterialLotMovementsProps {
  rows: Array<TQueryMaterialLotMovement>;
  isLoading?: boolean;
}

export default function TableMaterialLotMovements({ rows, isLoading }: TableMaterialLotMovementsProps) {
  return (
    <BaseTable
      testId="table-material-lot-movements"
      title={MATERIAL_LOT_MOVEMENTS_TITLE}
      columns={COLUMNS}
      rows={rows}
      isLoading={isLoading}
      noDataMessage={NO_MATERIAL_USED_MESSAGE}
    />
  );
}
