import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Fragment, useCallback, useMemo } from "react";

import clientCollection from "@/collections/client";
import CreateClientDialog from "@/components/dialog/create-client";
import PopoverDeletedFilter from "@/components/popover/deleted-filter";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import CellVerticalList from "@/components/table/cell-vertical-list";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TClientForm } from "@/form/hooks/use-client";
import { serializeClient } from "@/lib/serializers";
import {
  PHONE_LABEL,
  CLIENT_INVOICE_EMAILS_TITLE,
  SHOW_DELETED_CLIENTS_LABEL,
  CLIENT_DELETE_MESSAGE,
  CLIENT_DELETE_TITLE,
  CLIENT_DELETED_MESSAGE,
  CLIENT_RESTORE_MESSAGE,
  CLIENT_RESTORE_TITLE,
  CLIENT_CREATE_TITLE,
  CLIENT_RESTORED_MESSAGE,
} from "@/messages/client";
import { ACTIONS_LABEL, CITY_LABEL, NAME_LABEL, TAX_ID_LABEL } from "@/messages/common";
import { useQueryClients } from "@/queries/client";
import type { TTableClientState } from "@/schemas/client";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

interface TableClientProps extends PublicBaseTableProps<TClientForm, TTableClientState> {
  createClient?: boolean;
}

const DEFAULT_STATE: TTableClientState = { sorts: [{ id: "name", desc: false }] };

const columnHelper = createTableColumnHelper<TClientForm>();

export default function TableClient({ testId = "table-client", state, createClient, ...props }: TableClientProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction, showToastOnTRPCMutation } = useAppContext();

  const { data: clients, isLoading: isLoadingClients } = useQueryClients({
    filters: state?.filters ?? DEFAULT_STATE.filters,
    sorts: state?.sorts ?? DEFAULT_STATE.sorts,
  });

  const handleEdit = useCallback(
    async (clientId: number) => {
      await navigate({
        params: { id: clientId },
        to: "/client/$id",
      });
    },
    [navigate],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        enableColumnFilter: true,
        enableSorting: true,
        header: NAME_LABEL,
        enableResizing: true,
        size: 500,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("city", {
        enableColumnFilter: true,
        enableResizing: true,
        size: 200,
        header: CITY_LABEL,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("phone", {
        enableColumnFilter: true,
        header: PHONE_LABEL,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("taxId", {
        enableColumnFilter: true,
        header: TAX_ID_LABEL,
        enableResizing: true,
        size: 140,
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor((row) => row.invoiceEmails.map((email) => email.email).join(", "), {
        cell: ({ row }) => (
          <CellVerticalList>
            {row.original.invoiceEmails.map((email, i) => (
              <Fragment key={i}>{email.email}</Fragment>
            ))}
          </CellVerticalList>
        ),
        enableColumnFilter: true,
        enableResizing: true,
        size: 250,
        header: CLIENT_INVOICE_EMAILS_TITLE,
        id: "invoiceEmail",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingClients}
            onEdit={() => void handleEdit(row.original.id)}
            {...(row.original.deletedAt === null
              ? {
                  deleteButton: {
                    dialogTitle: CLIENT_DELETE_TITLE,
                    dialogDescription: CLIENT_DELETE_MESSAGE,
                    serializedModel: serializeClient(row.original),
                    onConfirm: async () =>
                      showToastOnTransaction({
                        transaction: () =>
                          dbClient.collection(clientCollection).delete(row.original.id, {
                            optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                          }),
                        onSuccess: { title: CLIENT_DELETED_MESSAGE },
                      }),
                  },
                }
              : {
                  restoreButton: {
                    dialogTitle: CLIENT_RESTORE_TITLE,
                    dialogDescription: CLIENT_RESTORE_MESSAGE,
                    serializedModel: serializeClient(row.original),
                    onConfirm: () =>
                      void showToastOnTRPCMutation({
                        mutation: trpc.client.restore.mutate({ id: row.original.id }),
                        onSuccess: { title: CLIENT_RESTORED_MESSAGE },
                      }),
                  },
                })}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingClients, handleEdit, dbClient, showToastOnTransaction, showToastOnTRPCMutation],
  );

  return (
    <>
      <BaseTable
        testId={testId}
        columns={columns}
        rows={clients}
        state={state}
        isLoading={props.isLoading === true || isLoadingClients}
        customFiltersComponent={
          <PopoverDeletedFilter
            label={SHOW_DELETED_CLIENTS_LABEL}
            filters={state?.filters}
            tableName={testId}
            defaultState={props.defaultState ?? DEFAULT_STATE}
            onStateChange={props.onStateChange}
          />
        }
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createClient: true })}>
            <PlusIcon /> {CLIENT_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateClientDialog createClient={createClient} />
    </>
  );
}
