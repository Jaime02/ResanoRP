import { useMemo } from "react";

import DialogQualityCheck from "@/components/dialog/quality-check";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipQualityCheckIssue from "@/components/tooltip/quality-check-issue";
import ButtonLink from "@/components/ui/button-link";
import { Checkbox } from "@/components/ui/checkbox";
import { OPEN_PART_LABEL, PART_FEATURE_LABEL } from "@/messages/part";
import { NO_PART_FEATURES_MESSAGE, QUALITY_CONTROL_LABEL } from "@/messages/production-order";
import type { TActiveProductionOrder } from "@/queries/production-order";

type TQualityControlRow = NonNullable<TActiveProductionOrder["part"]>["features"][number];

const columnHelper = createTableColumnHelper<TQualityControlRow>();

export default function TableQualityControl({
  productionOrder,
  readOnly = false,
}: {
  productionOrder: TActiveProductionOrder;
  readOnly?: boolean;
}) {
  const { id: productionOrderId, qualityChecks } = productionOrder;
  const partId = productionOrder.part?.id;
  const features = useMemo(() => productionOrder.part?.features ?? [], [productionOrder.part?.features]);

  const columns = useMemo(() => {
    // Ordered by checkedAt, so the columns follow the order the checks were made
    const checks = new Map<
      number,
      { producedQuantity: number; results: Map<number, { notes: string | null; ok: boolean; value: string | null }> }
    >();
    for (const qualityCheck of qualityChecks) {
      const checkedAt = qualityCheck.checkedAt.getTime();
      const check = checks.get(checkedAt) ?? { producedQuantity: qualityCheck.producedQuantity, results: new Map() };
      check.results.set(qualityCheck.partFeatureId, {
        notes: qualityCheck.notes,
        ok: qualityCheck.ok,
        value: qualityCheck.value,
      });
      checks.set(checkedAt, check);
    }
    return [
      columnHelper.accessor("feature", { header: PART_FEATURE_LABEL, id: "feature" }),
      ...Array.from(checks, ([checkedAt, check]) =>
        columnHelper.display({
          cell: ({ row }) => {
            const result = check.results.get(row.original.id);
            if (result === undefined) return null;
            if (result.value !== null) {
              return (
                <span className="inline-flex items-center gap-1">
                  <span data-testid="quality-check-value" className={result.ok ? undefined : "text-destructive"}>
                    {result.value}
                  </span>
                  {result.notes !== null && <TooltipQualityCheckIssue notes={result.notes} />}
                </span>
              );
            }
            return result.notes !== null ? (
              <TooltipQualityCheckIssue notes={result.notes} />
            ) : (
              <Checkbox checked={result.ok} readOnly />
            );
          },
          header: String(check.producedQuantity),
          id: `check-${checkedAt}`,
        }),
      ),
    ];
  }, [qualityChecks]);

  return (
    <BaseTable
      testId="table-quality-control"
      title={QUALITY_CONTROL_LABEL}
      columns={columns}
      rows={features}
      noDataMessage={
        <div className="flex flex-col items-center gap-2">
          {NO_PART_FEATURES_MESSAGE}
          {partId !== undefined && (
            <ButtonLink
              testId="button-quality-control-open-part"
              to="/part/$id"
              params={{ id: partId }}
              search={{ tab: "blueprints" }}
              target="_blank"
            >
              {OPEN_PART_LABEL}
            </ButtonLink>
          )}
        </div>
      }
      headerExtraComponents={
        readOnly ? undefined : <DialogQualityCheck productionOrderId={productionOrderId} partFeatures={features} />
      }
    />
  );
}
