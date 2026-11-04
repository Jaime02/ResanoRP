import { useSelector } from "@tanstack/react-store";

import TablePartPrice from "@/components/table/part-price";
import { Card } from "@/components/ui/card";
import PriceInput from "@/components/ui/price-input";
import { useFormContext } from "@/form";
import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { getLineTotalInCents } from "@/lib/prices";
import { PRICE_LABEL, QUANTITY_LABEL, TOTAL_LABEL } from "@/messages/common";
import {
  PART_PRICE_MANUAL_ENTRY_MESSAGE,
  SELECT_PART_FOR_PRICES_MESSAGE,
  SELECT_PRICE_TITLE,
} from "@/messages/part-price";
import type { TPartPrice } from "@/queries/part-price";
import { useQueryPartPrices } from "@/queries/part-price";
import { TableMode } from "@/types";

interface FormPartPriceFieldsProps {
  idPrefix: string;
  priceFieldName: "partPrice" | "unitPrice";
  currentClientId?: number | null;
  editPartPriceId?: number;
  isCustomLine?: boolean;
}

export default function FormPartPriceFields({
  idPrefix,
  priceFieldName,
  currentClientId,
  editPartPriceId,
  isCustomLine = false,
}: FormPartPriceFieldsProps) {
  const { form } = useFormContext();
  const partId = useSelector(form.store, (state) => state.values.partId);
  const currentPriceId = useSelector(form.store, (state) => state.values.partPriceId);
  const partQuantity = useSelector(form.store, (state) => state.values.quantity);
  const price = useSelector(form.store, (state) => state.values[priceFieldName]);
  const totalInCents = partQuantity === null ? null : getLineTotalInCents({ quantity: partQuantity, unitPrice: price });

  const { data: partPrices, isLoading: isLoadingPartPrices } = useQueryPartPrices({ partId, onlyCalculated: true });

  return (
    <>
      <div className="flex flex-row gap-2">
        <form.AppField
          name="quantity"
          children={(field) => (
            <field.NumberInput
              id={`${idPrefix}-quantity`}
              label={QUANTITY_LABEL}
              min={-Infinity}
              onBlur={() => {
                if (form.getFieldValue(priceFieldName) === null && partQuantity !== null && partPrices) {
                  const partPriceMatch = matchPartPriceByQuantity({
                    clientId: currentClientId ?? undefined,
                    partPrices,
                    quantity: partQuantity,
                  });
                  if (partPriceMatch) {
                    form.setFieldValue("partPriceId", partPriceMatch.id);
                    form.setFieldValue(priceFieldName, partPriceMatch.price);
                  }
                }
              }}
            />
          )}
        />
        <form.AppField
          name={priceFieldName}
          children={(field) => (
            <field.PriceInput
              id={`${idPrefix}-part-price`}
              label={PRICE_LABEL}
              min={-Infinity}
              onValueChange={(value) => {
                if (value !== null && partPrices && partQuantity !== null) {
                  const partPriceMatch = matchPartPriceByQuantity({
                    clientId: currentClientId ?? undefined,
                    partPrices,
                    quantity: partQuantity,
                  });
                  if (partPriceMatch && partPriceMatch.price === value) {
                    form.setFieldValue("partPriceId", partPriceMatch.id);
                  } else {
                    form.setFieldValue("partPriceId", null);
                  }
                }
              }}
            />
          )}
        />
        <FieldLayoutContainer>
          <FieldLabel labelFor={`${idPrefix}-total`}>{TOTAL_LABEL}</FieldLabel>
          <PriceInput
            id={`${idPrefix}-total`}
            min={-Infinity}
            value={totalInCents === null ? null : String(totalInCents / 100)}
            readOnly
          />
        </FieldLayoutContainer>
      </div>
      <Card
        data-testid="card-part-prices"
        className="w-full"
        disabledMessage={isCustomLine ? PART_PRICE_MANUAL_ENTRY_MESSAGE : undefined}
      >
        <TablePartPrice
          testId="radio-table-part-prices"
          title={SELECT_PRICE_TITLE}
          partId={partId ?? undefined}
          currentClientId={currentClientId}
          partPrices={partPrices}
          editPartPriceId={editPartPriceId}
          isLoading={isLoadingPartPrices}
          disabledMessage={!isCustomLine && partId === null ? SELECT_PART_FOR_PRICES_MESSAGE : undefined}
          skeletonRowsCount={1}
          tableClassName="w-full"
          tableMode={TableMode.Radio}
          radioSelectedRowId={currentPriceId}
          onRadioSelectedRowChange={(selectedRow) => {
            form.setFieldValue("partPriceId", selectedRow.original.id);
            form.setFieldValue(priceFieldName, selectedRow.original.price);
            if (form.getFieldValue("quantity") === null) {
              form.setFieldValue("quantity", selectedRow.original.quantity);
            }
          }}
        />
      </Card>
    </>
  );
}

interface MatchPartPriceByQuantityProps {
  partPrices: Array<TPartPrice>;
  quantity: number;
  clientId?: number;
}

function matchPartPriceByQuantity({ partPrices, quantity, clientId }: MatchPartPriceByQuantityProps) {
  return (
    partPrices.find((partPrice) => partPrice.quantity === quantity && partPrice.client?.id === clientId) ??
    partPrices.find((partPrice) => partPrice.quantity === quantity)
  );
}
