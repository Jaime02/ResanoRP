import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import deliveryMethodCollection from "@/collections/delivery-method";
import CreateEditDeliveryMethodDialog from "@/components/dialog/create-edit-delivery-method";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TDeliveryMethodForm } from "@/form/hooks/use-delivery-method";
import { serializeDeliveryMethod } from "@/lib/serializers";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import {
  DELIVERY_METHOD_DELETE_MESSAGE,
  DELIVERY_METHOD_DELETE_TITLE,
  DELIVERY_METHOD_DELETED_MESSAGE,
  DELIVERY_METHOD_RESTORE_MESSAGE,
  DELIVERY_METHOD_RESTORE_TITLE,
  DELIVERY_METHOD_RESTORED_MESSAGE,
  DELIVERY_METHOD_CREATE_TITLE,
  SHOW_DELETED_DELIVERY_METHODS_LABEL,
} from "@/messages/delivery-method";
import { useQueryDeliveryMethods } from "@/queries/delivery-method";
import type { TTableDeliveryMethodState } from "@/schemas/delivery-method";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTableDeliveryMethodState = { sorts: [{ desc: false, id: "name" }] };

interface DeliveryMethodsTableProps extends PublicBaseTableProps<TDeliveryMethodForm, TTableDeliveryMethodState> {
  editDeliveryMethodId?: number;
  createDeliveryMethod?: boolean;
}

const columnHelper = createTableColumnHelper<TDeliveryMethodForm>();

export default function TableMaintenanceDeliveryMethod({
  editDeliveryMethodId,
  createDeliveryMethod,
  ...props
}: DeliveryMethodsTableProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: deliveryMethods, isLoading: isLoadingDeliveryMethods } = useQueryDeliveryMethods({
    filters: props.state?.filters ?? DEFAULT_STATE.filters,
    sorts: props.state?.sorts ?? DEFAULT_STATE.sorts,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        enableColumnFilter: true,
        header: NAME_LABEL,
        id: "name",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingDeliveryMethods}
            {...(row.original.deletedAt === null
              ? {
                  onEdit: () =>
                    void navigate({
                      search: (prev) => ({ ...prev, editDeliveryMethodId: row.original.id }),
                      to: ".",
                    }),
                  deleteButton: {
                    dialogTitle: DELIVERY_METHOD_DELETE_TITLE,
                    dialogDescription: DELIVERY_METHOD_DELETE_MESSAGE,
                    serializedModel: serializeDeliveryMethod(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(deliveryMethodCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: DELIVERY_METHOD_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: DELIVERY_METHOD_RESTORE_TITLE,
                    dialogDescription: DELIVERY_METHOD_RESTORE_MESSAGE,
                    serializedModel: serializeDeliveryMethod(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.deliveryMethod.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: DELIVERY_METHOD_RESTORED_MESSAGE },
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingDeliveryMethods, navigate, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-delivery-method"
        columns={columns}
        rows={deliveryMethods}
        isLoading={props.isLoading === true || isLoadingDeliveryMethods}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_DELIVERY_METHODS_LABEL}
            filters={props.state?.filters}
            tableName="table-delivery-method"
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createDeliveryMethod: true })}>
            <PlusIcon /> {DELIVERY_METHOD_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateEditDeliveryMethodDialog
        createDeliveryMethod={createDeliveryMethod}
        editDeliveryMethodId={editDeliveryMethodId}
      />
    </>
  );
}
