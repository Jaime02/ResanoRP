import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon, PlusIcon, WifiIcon } from "lucide-react";
import { useMemo, useState } from "react";

import printerCollection from "@/collections/printer";
import CreateEditPrinterDialog from "@/components/dialog/create-edit-printer";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { Checkbox } from "@/components/ui/checkbox";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import type { TPrinterForm } from "@/form/hooks/use-printer";
import { formatPrinterAddress } from "@/lib/formatters";
import { serializePrinter } from "@/lib/serializers";
import { ACTIONS_LABEL, NAME_LABEL } from "@/messages/common";
import {
  PRINTER_ADDRESS_LABEL,
  PRINTER_KIND_LABEL,
  PRINTER_KIND_LABELS,
  PRINTER_CREATE_TITLE,
  PRINTER_DELETE_MESSAGE,
  PRINTER_DELETE_TITLE,
  PRINTER_DELETED_MESSAGE,
  PRINTER_FOR_TAGS_LABEL,
  PRINTER_REACHABLE_MESSAGE,
} from "@/messages/printer";
import { useQueryPrinters } from "@/queries/printer";
import type { TTablePrinterState } from "@/schemas/printer";
import trpc from "@/trpc/trpc-client";
import { CellDataType } from "@/types";

const DEFAULT_STATE: TTablePrinterState = { sorts: [{ desc: false, id: "name" }] };

interface PrintersTableProps extends PublicBaseTableProps<TPrinterForm, TTablePrinterState> {
  editPrinterId?: number;
  createPrinter?: boolean;
}

const columnHelper = createTableColumnHelper<TPrinterForm>();

function ButtonPingPrinter({ printerId, printerName }: { printerId: number; printerName: string }) {
  const { showToastOnTRPCMutation } = useAppContext();
  const [isPinging, setIsPinging] = useState(false);

  return (
    <Button
      testId="button-ping-printer"
      size="icon"
      variant="secondary"
      disabled={isPinging}
      onClick={async () => {
        setIsPinging(true);
        await showToastOnTRPCMutation({
          mutation: trpc.printer.ping.mutate({ id: printerId }),
          onSuccess: { title: PRINTER_REACHABLE_MESSAGE(printerName) },
        });
        setIsPinging(false);
      }}
    >
      {isPinging ? <LoaderIcon className="animate-spin" /> : <WifiIcon />}
    </Button>
  );
}

export default function TableMaintenancePrinter({ editPrinterId, createPrinter, ...props }: PrintersTableProps) {
  const navigate = useNavigate();
  const dbClient = useDbClient();
  const { showToastOnTransaction } = useAppContext();

  const { data: printers, isLoading: isLoadingPrinters } = useQueryPrinters({
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
      columnHelper.accessor((printer) => PRINTER_KIND_LABELS[printer.kind], {
        header: PRINTER_KIND_LABEL,
        id: "kind",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor(formatPrinterAddress, {
        header: PRINTER_ADDRESS_LABEL,
        id: "address",
        meta: { dataType: CellDataType.String },
      }),
      columnHelper.accessor("forTags", {
        cell: (info) => (
          <Checkbox testId="checkbox-printer-for-tags" className="mx-auto" checked={info.getValue()} readOnly />
        ),
        header: PRINTER_FOR_TAGS_LABEL,
        id: "forTags",
        meta: { dataType: CellDataType.Boolean },
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={props.isLoading === true || isLoadingPrinters}
            extraComponentsStart={<ButtonPingPrinter printerId={row.original.id} printerName={row.original.name} />}
            onEdit={() =>
              void navigate({
                search: (prev) => ({ ...prev, editPrinterId: row.original.id }),
                to: ".",
              })
            }
            deleteButton={{
              dialogTitle: PRINTER_DELETE_TITLE,
              dialogDescription: PRINTER_DELETE_MESSAGE,
              serializedModel: serializePrinter(row.original),
              onConfirm: () =>
                void showToastOnTransaction({
                  transaction: () =>
                    dbClient.collection(printerCollection).delete(row.original.id, {
                      optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                    }),
                  onSuccess: { title: PRINTER_DELETED_MESSAGE },
                }),
            }}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [props.isLoading, isLoadingPrinters, navigate, dbClient, showToastOnTransaction],
  );

  return (
    <>
      <BaseTable
        testId="table-printer"
        columns={columns}
        rows={printers}
        isLoading={props.isLoading === true || isLoadingPrinters}
        headerExtraComponents={
          <ButtonLink variant="success" to="." search={(prev) => ({ ...prev, createPrinter: true })}>
            <PlusIcon /> {PRINTER_CREATE_TITLE}
          </ButtonLink>
        }
        defaultState={DEFAULT_STATE}
        {...props}
      />
      <CreateEditPrinterDialog createPrinter={createPrinter} editPrinterId={editPrinterId} />
    </>
  );
}
