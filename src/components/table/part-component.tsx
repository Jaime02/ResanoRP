import { useDbClient } from "@tanstack/react-db";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import partComponentCollection, { getPartComponentKey } from "@/collections/part-component";
import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import DialogCreatePartComponent from "@/components/dialog/create-part-component";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import TooltipDeleted from "@/components/tooltip/deleted";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { serializePart } from "@/lib/serializers";
import { BLUEPRINTS_OF_PART_TITLE } from "@/messages/blueprint";
import { ACTIONS_LABEL, DESCRIPTION_LABEL, QUANTITY_LABEL } from "@/messages/common";
import {
  PART_COMPONENT_CREATE_TITLE,
  PART_COMPONENT_DELETE_MESSAGE,
  PART_COMPONENT_DELETE_TITLE,
  PART_COMPONENT_DELETED_MESSAGE,
  PART_COMPONENT_EDIT_VALIDATION_ERROR_MESSAGE,
  PART_COMPONENT_EDITED_MESSAGE,
  PART_DELETED_TOOLTIP_MESSAGE,
  PART_NO_COMPONENTS_MESSAGE,
} from "@/messages/part";
import type { TPartFormPartComponent } from "@/queries/part";
import { partComponentSchema } from "@/schemas/part-component";
import { CellDataType, TableMode } from "@/types";

interface TablePartComponentsProps extends PublicBaseTableProps<TPartFormPartComponent> {
  partComponents?: Array<TPartFormPartComponent>;
  createPartComponent?: boolean;
  showCreatePartComponent: boolean;
  partId?: number;
}

const columnHelper = createTableColumnHelper<TPartFormPartComponent>();

export default function TablePartComponents({
  tableMode,
  partComponents,
  createPartComponent,
  showCreatePartComponent,
  partId,
  ...props
}: TablePartComponentsProps) {
  const dbClient = useDbClient();
  const { toaster, showToastOnTransaction } = useAppContext();

  const columns = useMemo(
    () => [
      columnHelper.accessor((partComponent) => partComponent.part.description, {
        cell: ({ row }) => (
          <div className="flex flex-row items-center gap-1">
            <ButtonLink to="/part/$id" params={{ id: row.original.componentPartId }}>
              {row.original.part.description}
            </ButtonLink>
            {row.original.part.deletedAt !== null && <TooltipDeleted>{PART_DELETED_TOOLTIP_MESSAGE}</TooltipDeleted>}
          </div>
        ),
        header: DESCRIPTION_LABEL,
        id: "description",
      }),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
        id: "quantity",
        meta: { dataType: CellDataType.Number, editable: true },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            extraComponentsStart={
              <DialogBlueprintViewer
                testId="dialog-part-component-blueprints"
                title={`${BLUEPRINTS_OF_PART_TITLE} "${row.original.part.description}"`}
                blueprints={row.original.blueprints}
              />
            }
            {...(tableMode === TableMode.Editable && {
              deleteButton: {
                dialogTitle: PART_COMPONENT_DELETE_TITLE,
                dialogDescription: PART_COMPONENT_DELETE_MESSAGE,
                serializedModel: serializePart(row.original.part),
                onConfirm: () =>
                  void showToastOnTransaction({
                    transaction: () =>
                      dbClient.collection(partComponentCollection).delete(getPartComponentKey(row.original), {
                        optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                      }),
                    onSuccess: { title: PART_COMPONENT_DELETED_MESSAGE },
                  }),
              },
            })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [tableMode, dbClient, showToastOnTransaction],
  );

  return (
    <>
      <BaseTable
        testId="table-part-components"
        columns={columns}
        rows={partComponents}
        tableMode={tableMode}
        noDataMessage={PART_NO_COMPONENTS_MESSAGE}
        headerExtraComponents={
          tableMode === TableMode.Editable && showCreatePartComponent ? (
            <ButtonLink
              testId="button-create-part-component"
              variant="success"
              to="."
              search={(prev) => ({ ...prev, createPartComponent: true })}
            >
              <PlusIcon /> {PART_COMPONENT_CREATE_TITLE}
            </ButtonLink>
          ) : undefined
        }
        onRowEdit={async (cell, value) => {
          const input = partComponentSchema.safeParse({ ...cell.row.original, [cell.column.id]: value });
          if (!input.success) {
            toaster.error({ title: PART_COMPONENT_EDIT_VALIDATION_ERROR_MESSAGE });
            return;
          }
          await showToastOnTransaction({
            transaction: () =>
              dbClient.collection(partComponentCollection).update(getPartComponentKey(input.data), (draft) => {
                draft.quantity = input.data.quantity;
              }),
            onSuccess: { title: PART_COMPONENT_EDITED_MESSAGE },
          });
        }}
        {...props}
      />
      <DialogCreatePartComponent open={showCreatePartComponent && createPartComponent} partId={partId} />
    </>
  );
}
