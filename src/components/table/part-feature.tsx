import { useDbClient } from "@tanstack/react-db";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import partFeatureCollection from "@/collections/part-feature";
import DialogCreatePartFeature from "@/components/dialog/create-part-feature";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { serializePartFeature } from "@/lib/serializers";
import { ACTIONS_LABEL } from "@/messages/common";
import {
  PART_FEATURE_DELETE_MESSAGE,
  PART_FEATURE_DELETE_TITLE,
  PART_FEATURE_DELETED_MESSAGE,
  PART_FEATURE_EDIT_VALIDATION_ERROR_MESSAGE,
  PART_FEATURE_EDITED_MESSAGE,
  PART_FEATURE_CREATE_TITLE,
  PART_FEATURE_LABEL,
  PART_FEATURE_MAX_VALUE_LABEL,
  PART_FEATURE_MIN_VALUE_LABEL,
} from "@/messages/part";
import type { TPartFormPartFeature } from "@/queries/part";
import { updatePartFeatureSchema } from "@/schemas/part-feature";
import type { TTablePartFeatureState } from "@/schemas/part-feature";
import { CellDataType, TableMode } from "@/types";

const DEFAULT_STATE: TTablePartFeatureState = { sorts: [{ desc: false, id: "feature" }] };

interface TablePartFeaturesProps extends PublicBaseTableProps<TPartFormPartFeature, TTablePartFeatureState> {
  partFeatures?: Array<TPartFormPartFeature>;
  createPartFeature?: boolean;
  partId?: number;
}

const columnHelper = createTableColumnHelper<TPartFormPartFeature>();

export default function TablePartFeatures({
  tableMode,
  partFeatures,
  createPartFeature,
  partId,
  ...props
}: TablePartFeaturesProps) {
  const dbClient = useDbClient();
  const { toaster, showToastOnTransaction } = useAppContext();

  const columns = useMemo(
    () => [
      columnHelper.accessor("feature", {
        header: PART_FEATURE_LABEL,
        id: "feature",
        meta: { dataType: CellDataType.String, editable: true },
      }),
      columnHelper.accessor("minValue", {
        header: PART_FEATURE_MIN_VALUE_LABEL,
        id: "minValue",
        meta: { dataType: CellDataType.Decimal, editable: true, min: -Infinity },
      }),
      columnHelper.accessor("maxValue", {
        header: PART_FEATURE_MAX_VALUE_LABEL,
        id: "maxValue",
        meta: { dataType: CellDataType.Decimal, editable: true, min: -Infinity },
      }),
      ...(tableMode === TableMode.Editable
        ? [
            columnHelper.display({
              cell: ({ row }) => (
                <ModelActions
                  deleteButton={{
                    dialogTitle: PART_FEATURE_DELETE_TITLE,
                    dialogDescription: PART_FEATURE_DELETE_MESSAGE,
                    serializedModel: serializePartFeature(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(partFeatureCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: {
                          title: PART_FEATURE_DELETED_MESSAGE,
                        },
                      }),
                  }}
                />
              ),
              header: ACTIONS_LABEL,
              id: "actions",
            }),
          ]
        : []),
    ],
    [tableMode, dbClient, showToastOnTransaction],
  );

  return (
    <>
      <BaseTable
        testId="table-part-features"
        columns={columns}
        rows={partFeatures}
        defaultState={DEFAULT_STATE}
        tableMode={tableMode}
        headerExtraComponents={
          tableMode === TableMode.Editable ? (
            <ButtonLink
              testId="button-create-part-feature"
              variant="success"
              to="."
              search={(prev) => ({ ...prev, createPartFeature: true })}
            >
              <PlusIcon /> {PART_FEATURE_CREATE_TITLE}
            </ButtonLink>
          ) : undefined
        }
        onRowEdit={async (cell, value) => {
          const input = updatePartFeatureSchema.safeParse({ ...cell.row.original, [cell.column.id]: value });
          if (!input.success) {
            toaster.error({ title: PART_FEATURE_EDIT_VALIDATION_ERROR_MESSAGE });
            return;
          }
          await showToastOnTransaction({
            transaction: () =>
              dbClient.collection(partFeatureCollection).update(input.data.id, (draft) => {
                draft.feature = input.data.feature;
                draft.minValue = input.data.minValue;
                draft.maxValue = input.data.maxValue;
              }),
            onSuccess: { title: PART_FEATURE_EDITED_MESSAGE },
          });
        }}
        {...props}
      />
      <DialogCreatePartFeature open={createPartFeature} partId={partId} />
    </>
  );
}
