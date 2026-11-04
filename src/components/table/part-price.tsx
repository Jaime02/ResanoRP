import { useDbClient } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import partPriceCollection from "@/collections/part-price";
import DialogEditPartPrice from "@/components/dialog/edit-part-price";
import type { PublicBaseTableProps } from "@/components/table/base-table";
import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import ButtonLink from "@/components/ui/button-link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormPartPrice from "@/form/forms/part-price";
import usePartPriceForm from "@/form/hooks/use-part-price";
import { formatDate, formatPrice } from "@/lib/formatters";
import { serializePartPrice } from "@/lib/serializers";
import { ACTIONS_LABEL, CLIENT_LABEL, DATE_LABEL, PRICE_LABEL, QUANTITY_LABEL } from "@/messages/common";
import {
  PART_PRICE_DELETE_MESSAGE,
  PART_PRICE_DELETE_TITLE,
  PART_PRICE_DELETED_MESSAGE,
  PENDING_PRICE_LABEL,
  CALCULATE_PRICE_LABEL,
  CREATE_PRICE_LABEL,
  PRICES_TITLE,
} from "@/messages/part-price";
import type { TPartPriceForm } from "@/queries/part";
import type { TTablePartPriceState } from "@/schemas/part-price";
import type { TableMode } from "@/types";
import { CellDataType, FormMode } from "@/types";

export interface TTablePartPriceOnRowSelectParams {
  partPriceId: number;
  price: string | null;
  quantity: number | null;
  activeItemId: number | null;
  formattedActiveItem: string | null;
}

const DEFAULT_STATE: TTablePartPriceState = { sorts: [{ desc: false, id: "quantity" }] };

interface TablePartPriceProps extends PublicBaseTableProps<TPartPriceForm, TTablePartPriceState> {
  tableMode: TableMode;
  partId?: number;
  partPrices?: Array<TPartPriceForm>;
  editPartPriceId?: number;
  currentClientId?: number | null;
  onRowSelect?: (params: TTablePartPriceOnRowSelectParams) => void;
  skipQueries?: boolean;
  collapsibleCreatePartPrice?: boolean;
  showCreatePartPrice?: boolean;
}

const columnHelper = createTableColumnHelper<TPartPriceForm>();

function formatPartPrice(price: string | null) {
  return price === null ? PENDING_PRICE_LABEL : formatPrice(price);
}

export default function TablePartPrice({
  testId = "table-part-price",
  tableMode,
  partId,
  partPrices,
  editPartPriceId,
  currentClientId,
  onRowSelect,
  title = PRICES_TITLE,
  skipQueries,
  collapsibleCreatePartPrice = true,
  showCreatePartPrice = true,
  ...props
}: TablePartPriceProps) {
  const { showToastOnTransaction } = useAppContext();
  const navigate = useNavigate();
  const dbClient = useDbClient();

  skipQueries = partId === undefined || skipQueries;

  const editingPartPrice =
    editPartPriceId === undefined ? undefined : partPrices?.find((priceItem) => priceItem.id === editPartPriceId);

  const columns = useMemo(
    () => [
      columnHelper.accessor("price", {
        cell: (info) => formatPartPrice(info.getValue()),
        header: PRICE_LABEL,
        meta: { dataType: CellDataType.Price },
      }),
      columnHelper.accessor("quantity", {
        header: QUANTITY_LABEL,
      }),
      columnHelper.accessor((row) => row.client?.name, {
        header: CLIENT_LABEL,
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) => formatDate(info.getValue()),
        header: DATE_LABEL,
      }),
      columnHelper.display({
        cell: ({ row }) => (
          <ModelActions
            disabled={skipQueries}
            onSuccess={
              onRowSelect
                ? () => {
                    onRowSelect({
                      activeItemId: row.original.id,
                      formattedActiveItem: `${formatPrice(row.original.price)}${row.original.client?.name !== undefined ? ` (${row.original.client.name})` : ""}`,
                      partPriceId: row.original.id,
                      price: row.original.price,
                      quantity: row.original.quantity,
                    });
                  }
                : undefined
            }
            onEdit={() =>
              void navigate({
                search: (prev) => ({ ...prev, editPartPriceId: row.original.id }),
                to: ".",
              })
            }
            deleteButton={{
              dialogTitle: PART_PRICE_DELETE_TITLE,
              dialogDescription: PART_PRICE_DELETE_MESSAGE,
              serializedModel: serializePartPrice(row.original),
              onConfirm: () =>
                void showToastOnTransaction({
                  transaction: () =>
                    dbClient.collection(partPriceCollection).delete(row.original.id, {
                      optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                    }),
                  onSuccess: {
                    title: PART_PRICE_DELETED_MESSAGE,
                  },
                }),
            }}
          />
        ),
        header: ACTIONS_LABEL,
        id: "actions",
      }),
    ],
    [skipQueries, onRowSelect, navigate, dbClient, showToastOnTransaction],
  );

  const {
    form: formCreatePartPrice,
    validationSchema,
    isLoading,
  } = usePartPriceForm({
    editingPartId: partId,
    defaultClientId: currentClientId,
    requestedFormMode: FormMode.Create,
  });

  const calculatePriceLink = showCreatePartPrice ? (
    <ButtonLink
      testId="button-link-calculate-price"
      to="/price-calculator/$partId"
      params={{ partId }}
      disabled={partId === undefined}
      variant="success"
    >
      {CALCULATE_PRICE_LABEL}
    </ButtonLink>
  ) : undefined;

  return (
    <>
      <BaseTable
        testId={testId}
        title={title}
        tableMode={tableMode}
        columns={columns}
        rows={partPrices}
        defaultState={DEFAULT_STATE}
        headerExtraComponents={title === null ? undefined : calculatePriceLink}
        {...props}
      />
      {showCreatePartPrice && (
        <Collapsible open={!collapsibleCreatePartPrice ? true : undefined} disabled={partId === undefined}>
          <Card data-testid="card-create-part-price">
            <CardHeader>
              <CardTitle level={3}>
                {collapsibleCreatePartPrice && <CollapsibleTrigger data-testid="button-toggle-create-part-price" />}{" "}
                {CREATE_PRICE_LABEL}
              </CardTitle>
            </CardHeader>
            <CollapsibleContent>
              <FormContextProvider
                form={formCreatePartPrice}
                formMode={FormMode.Create}
                isLoading={isLoading}
                validationSchema={validationSchema}
              >
                <FormPartPrice showClient={currentClientId === undefined} />
                <formCreatePartPrice.ButtonSubmit className="self-end" />
              </FormContextProvider>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {title === null && calculatePriceLink}
      <DialogEditPartPrice controlledPartPrice={editingPartPrice} editingPartId={partId} />
    </>
  );
}
