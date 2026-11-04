import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import paymentMethodCollection from "@/collections/payment-method";
import CreateEditPaymentMethodDialog from "@/components/dialog/create-edit-payment-method";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { Checkbox } from "@/components/ui/checkbox";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TPaymentMethodForm } from "@/form/hooks/use-payment-method";
import { serializePaymentMethod } from "@/lib/serializers";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import {
  PAYMENT_METHOD_DELETE_MESSAGE,
  PAYMENT_METHOD_DELETE_TITLE,
  PAYMENT_METHOD_DELETED_MESSAGE,
  PAYMENT_METHOD_DUE_DAYS_COLUMN_LABEL,
  PAYMENT_METHOD_GENERATES_RECEIPT_LABEL,
  PAYMENT_METHOD_RESTORE_MESSAGE,
  PAYMENT_METHOD_RESTORE_TITLE,
  PAYMENT_METHOD_RESTORED_MESSAGE,
  PAYMENT_METHOD_CREATE_TITLE,
  SHOW_DELETED_PAYMENT_METHODS_LABEL,
} from "@/messages/payment-method";
import { useQueryPaymentMethods } from "@/queries/payment-method";
import type { TTablePaymentMethodState } from "@/schemas/payment-method";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTablePaymentMethodState = { sorts: [{ desc: false, id: "name" }] };

interface TableMaintenancePaymentMethodProps extends PublicBaseTableProps<
  TPaymentMethodForm,
  TTablePaymentMethodState
> {
  editPaymentMethodId?: number;
  createPaymentMethod?: boolean;
}

const columnHelper = createTableColumnHelper<TPaymentMethodForm>();

export default function TableMaintenancePaymentMethod({
  editPaymentMethodId,
  createPaymentMethod,
  ...props
}: TableMaintenancePaymentMethodProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: paymentMethods, isLoading: isLoadingPaymentMethods } = useQueryPaymentMethods({
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
      columnHelper.accessor("paymentDeadlineDays", {
        enableColumnFilter: true,
        header: PAYMENT_METHOD_DUE_DAYS_COLUMN_LABEL,
        id: "paymentDeadlineDays",
        meta: { dataType: CellDataType.Number },
      }),
      columnHelper.accessor("generatesReceipt", {
        cell: (info) => (
          <Checkbox testId="checkbox-generates-receipt" className="mx-auto" checked={info.getValue()} readOnly />
        ),
        header: PAYMENT_METHOD_GENERATES_RECEIPT_LABEL,
        id: "generatesReceipt",
        meta: { dataType: CellDataType.Boolean },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingPaymentMethods}
            {...(row.original.deletedAt === null
              ? {
                  onEdit: () =>
                    void navigate({
                      search: (prev) => ({ ...prev, editPaymentMethodId: row.original.id }),
                      to: ".",
                    }),
                  deleteButton: {
                    dialogTitle: PAYMENT_METHOD_DELETE_TITLE,
                    dialogDescription: PAYMENT_METHOD_DELETE_MESSAGE,
                    serializedModel: serializePaymentMethod(row.original),
                    onConfirm: () =>
                      void showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(paymentMethodCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: PAYMENT_METHOD_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: PAYMENT_METHOD_RESTORE_TITLE,
                    dialogDescription: PAYMENT_METHOD_RESTORE_MESSAGE,
                    serializedModel: serializePaymentMethod(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.paymentMethod.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: PAYMENT_METHOD_RESTORED_MESSAGE },
                        collection: paymentMethodCollection,
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingPaymentMethods, navigate, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId="table-payment-method"
        columns={columns}
        rows={paymentMethods}
        isLoading={props.isLoading === true || isLoadingPaymentMethods}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_PAYMENT_METHODS_LABEL}
            filters={props.state?.filters}
            tableName="table-payment-method"
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createPaymentMethod: true })}>
            <PlusIcon /> {PAYMENT_METHOD_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateEditPaymentMethodDialog
        editPaymentMethodId={editPaymentMethodId}
        createPaymentMethod={createPaymentMethod}
      />
    </>
  );
}
