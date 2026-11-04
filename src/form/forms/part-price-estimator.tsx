import { useSelector } from "@tanstack/react-store";
import { useMemo } from "react";

import BaseTable from "@/components/table/base-table";
import { createTableColumnHelper } from "@/components/table/column-helper";
import NoDataRow from "@/components/table/no-data-row";
import TooltipInactiveMaterial from "@/components/tooltip/inactive-material";
import { Card, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import PriceInput from "@/components/ui/price-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormContextProvider } from "@/form";
import FieldLayout from "@/form/components/field-layout";
import type usePartPriceEstimatorForm from "@/form/hooks/use-part-price-estimator";
import { formatDate, formatInactiveMaterialMessage, formatPrice, formatPricePerKilo } from "@/lib/formatters";
import {
  DEFAULT_ESTIMATION_QUANTITIES,
  getEstimation,
  getEstimatorCalculatedMaterialCost,
} from "@/lib/part-price-estimator";
import { SELECT_MATERIAL_PLACEHOLDER } from "@/messages/combobox";
import {
  CLIENT_LABEL,
  DATE_LABEL,
  MATERIAL_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  SHAPE_LABEL,
  SIZE_LABEL,
  TOTAL_LABEL,
  VAT_LABEL,
} from "@/messages/common";
import { RAW_MATERIAL_LABEL } from "@/messages/material";
import {
  BASE_LABEL,
  ESTIMATOR_COATING_LABEL,
  ESTIMATOR_CONTINGENCY_LABEL,
  ESTIMATOR_HOURLY_PRICE_LABEL,
  ESTIMATOR_MACHINE_SETUP_LABEL,
  ESTIMATOR_MATERIAL_COST_LABEL,
  ESTIMATOR_OTHERS_LABEL,
  ESTIMATOR_OTHERS_MESSAGE,
  ESTIMATOR_PART_LENGTH_LABEL,
  ESTIMATOR_PARTS_PER_HOUR_LABEL,
  ESTIMATOR_SECOND_OPERATION_LABEL,
  ESTIMATOR_TRANSPORT_LABEL,
  ESTIMATOR_WASTE_LABEL,
  NO_ACTIVE_MATERIALS_MESSAGE,
  NO_MATERIALS_FOUND_MESSAGE,
  NO_PENDING_PRICES_NEW_PRICE_MESSAGE,
  PENDING_PRICES_TITLE,
  PIECES_LABEL,
  PROCESSING_LABEL,
  RAW_MATERIAL_NO_DENSITY_MESSAGE,
  SALE_PRICE_TITLE,
  SAVE_NEW_PRICE_LABEL,
  SAVE_PENDING_PRICE_LABEL,
  SELECT_MATERIAL_MESSAGE,
} from "@/messages/part-price";
import { useQueryConfiguration } from "@/queries/configuration";
import type { TPartPriceForm } from "@/queries/part";
import { FormMode, TableMode } from "@/types";

type FormPartPriceEstimatorProps = Pick<
  ReturnType<typeof usePartPriceEstimatorForm>,
  "form" | "validationSchema" | "part" | "pendingPartPrices" | "isLoading"
>;

const pendingPartPriceColumnHelper = createTableColumnHelper<TPartPriceForm>();

const pendingPartPriceColumns = [
  pendingPartPriceColumnHelper.accessor("quantity", { header: QUANTITY_LABEL }),
  pendingPartPriceColumnHelper.accessor((row) => row.client?.name, { header: CLIENT_LABEL, id: "client" }),
  pendingPartPriceColumnHelper.accessor("createdAt", {
    cell: (info) => formatDate(info.getValue()),
    header: DATE_LABEL,
  }),
];

export default function FormPartPriceEstimator({
  form,
  validationSchema,
  part,
  pendingPartPrices,
  isLoading,
}: FormPartPriceEstimatorProps) {
  const { data: configuration } = useQueryConfiguration();
  const values = useSelector(form.store, (state) => state.values);

  const material = part?.materials.find((partMaterial) => partMaterial.id === values.materialId);
  const calculatedMaterialCost = getEstimatorCalculatedMaterialCost(values, material);
  const vatPercentage = configuration?.vatPercentage ?? 0;

  const estimationRows = useMemo(
    () =>
      [...DEFAULT_ESTIMATION_QUANTITIES, values.quantity].map((quantity, index) => ({
        estimation: quantity !== null ? getEstimation(values, material, quantity) : null,
        isCustom: index === DEFAULT_ESTIMATION_QUANTITIES.length,
        quantity,
      })),
    [values, material],
  );

  return (
    <FormContextProvider
      form={form}
      testId="form-part-price-estimator"
      formMode={FormMode.Update}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      <Card data-testid="card-part-price-estimator" className="w-full gap-3">
        <section className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <CardTitle level={3} className="basis-full">
            {MATERIAL_LABEL}
          </CardTitle>
          <div className="flex max-w-full flex-col gap-2">
            <form.AppField
              name="materialId"
              children={(field) => (
                <FieldLayout>
                  <Combobox
                    id="input-estimator-material"
                    testId="combobox-estimator-material"
                    items={
                      part?.materials.filter((partMaterial) => formatInactiveMaterialMessage(partMaterial) === null) ??
                      []
                    }
                    activeItem={material ?? null}
                    formatItem={(item) =>
                      item ? `${item.rawMaterial.name} | ${item.shape.name} | ${item.width} mm` : ""
                    }
                    onValueChange={(value) => field.handleChange(value?.id ?? null)}
                    placeholder={SELECT_MATERIAL_PLACEHOLDER}
                    noItemsMessage={NO_ACTIVE_MATERIALS_MESSAGE}
                    noResultsMessage={NO_MATERIALS_FOUND_MESSAGE}
                  />
                </FieldLayout>
              )}
            />
            <Table testId="table-estimator-material" className="w-fit max-w-full">
              <TableHead>
                <TableRow>
                  <TableHeader>{RAW_MATERIAL_LABEL}</TableHeader>
                  <TableHeader>{SHAPE_LABEL}</TableHeader>
                  <TableHeader>{SIZE_LABEL}</TableHeader>
                  <TableHeader>{PRICE_LABEL}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {material ? (
                  <TableRow>
                    <TableCell>
                      <TooltipInactiveMaterial material={material}>{material.rawMaterial.name}</TooltipInactiveMaterial>
                    </TableCell>
                    <TableCell>{material.shape.name}</TableCell>
                    <TableCell>{`${material.width} mm`}</TableCell>
                    <TableCell>{formatPricePerKilo(material.rawMaterial.price)}</TableCell>
                  </TableRow>
                ) : (
                  <NoDataRow columns={4} message={SELECT_MATERIAL_MESSAGE} />
                )}
              </TableBody>
            </Table>
          </div>
          <div className="grid min-w-44 flex-1 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-3 gap-y-2">
            <form.AppField
              name="partLength"
              children={(field) => (
                <field.DecimalInput
                  id="input-estimator-part-length"
                  label={ESTIMATOR_PART_LENGTH_LABEL}
                  suffix=" mm"
                  className="w-full"
                  decimalScale={2}
                />
              )}
            />
            <form.AppField
              name="wastePercentage"
              children={(field) => (
                <field.DecimalInput
                  id="input-estimator-waste-percentage"
                  max={99}
                  label={ESTIMATOR_WASTE_LABEL}
                  suffix=" %"
                  className="w-full"
                  decimalScale={2}
                />
              )}
            />
            <form.AppField
              name="materialCost"
              children={(field) => (
                <FieldLayout label={ESTIMATOR_MATERIAL_COST_LABEL} labelFor="input-estimator-material-cost">
                  <PriceInput
                    id="input-estimator-material-cost"
                    className="w-full"
                    value={
                      field.state.value ?? (calculatedMaterialCost !== null ? calculatedMaterialCost.toFixed(3) : null)
                    }
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </FieldLayout>
              )}
            />
          </div>
          {material !== undefined && material.rawMaterial.density === null && (
            <span className="basis-full font-bold text-red-500">{RAW_MATERIAL_NO_DENSITY_MESSAGE}</span>
          )}
        </section>
        <section className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-2">
          <CardTitle level={3} className="col-span-full">
            {PROCESSING_LABEL}
          </CardTitle>
          <form.AppField
            name="machineSetupTimeMinutes"
            children={(field) => (
              <field.NumberInput
                id="input-estimator-setup-time"
                label={ESTIMATOR_MACHINE_SETUP_LABEL}
                suffix=" min"
                className="w-full"
              />
            )}
          />
          <form.AppField
            name="partsPerHour"
            children={(field) => (
              <field.NumberInput
                id="input-estimator-parts-per-hour"
                label={ESTIMATOR_PARTS_PER_HOUR_LABEL}
                className="w-full"
              />
            )}
          />
          <form.AppField
            name="machinePricePerHour"
            children={(field) => (
              <field.NumberInput
                id="input-estimator-price-per-hour"
                label={ESTIMATOR_HOURLY_PRICE_LABEL}
                suffix=" €"
                className="w-full"
              />
            )}
          />
          <form.AppField
            name="unexpectedPercentage"
            children={(field) => (
              <field.DecimalInput
                id="input-estimator-unexpected-percentage"
                max={99}
                label={ESTIMATOR_CONTINGENCY_LABEL}
                suffix=" %"
                className="w-full"
                decimalScale={2}
              />
            )}
          />
          <form.AppField
            name="transportPercentage"
            children={(field) => (
              <field.DecimalInput
                id="input-estimator-transport-percentage"
                max={99}
                label={ESTIMATOR_TRANSPORT_LABEL}
                suffix=" %"
                className="w-full"
                decimalScale={2}
              />
            )}
          />
        </section>
        <section className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-2">
          <CardTitle level={3} className="col-span-full flex flex-row items-center">
            <Popover>
              <InfoPopoverTrigger>{ESTIMATOR_OTHERS_LABEL}</InfoPopoverTrigger>
              <PopoverContent>{ESTIMATOR_OTHERS_MESSAGE}</PopoverContent>
            </Popover>
            {part?.coating && (
              <span className="ml-2 text-base font-bold">
                {ESTIMATOR_COATING_LABEL}: {part.coating.name}
              </span>
            )}
          </CardTitle>
          <form.AppField
            name="coatingCost"
            children={(field) => (
              <field.PriceInput id="input-estimator-coating-cost" label={ESTIMATOR_COATING_LABEL} className="w-full" />
            )}
          />
          <form.AppField
            name="secondOperationCost"
            children={(field) => (
              <field.PriceInput
                id="input-estimator-second-operation-cost"
                label={ESTIMATOR_SECOND_OPERATION_LABEL}
                className="w-full"
              />
            )}
          />
          <form.AppField
            name="otherCost"
            children={(field) => (
              <field.PriceInput id="input-estimator-other-cost" label={ESTIMATOR_OTHERS_LABEL} className="w-full" />
            )}
          />
        </section>
        <div className="flex flex-row flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <CardTitle level={3}>{SALE_PRICE_TITLE}</CardTitle>
            <Table testId="table-estimator-sale-prices">
              <TableHead>
                <TableRow>
                  <TableHeader>{PIECES_LABEL}</TableHeader>
                  <TableHeader className="font-normal">{MATERIAL_LABEL}</TableHeader>
                  <TableHeader className="font-normal">{PROCESSING_LABEL}</TableHeader>
                  <TableHeader className="font-normal">{ESTIMATOR_OTHERS_LABEL}</TableHeader>
                  <TableHeader>{BASE_LABEL}</TableHeader>
                  <TableHeader>
                    {VAT_LABEL} ({vatPercentage} %)
                  </TableHeader>
                  <TableHeader>{TOTAL_LABEL}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {estimationRows.map(({ quantity, estimation, isCustom }) => (
                  <TableRow key={isCustom ? "custom" : quantity} testId={isCustom ? "custom" : String(quantity)}>
                    <TableCell>
                      {isCustom ? (
                        <form.AppField
                          name="quantity"
                          listeners={{
                            onChange: ({ value }) => {
                              const matchingPartPrice = pendingPartPrices?.find(
                                (partPrice) => partPrice.quantity === value,
                              );
                              form.setFieldValue("partPriceId", matchingPartPrice?.id ?? null);
                              if (matchingPartPrice) {
                                form.setFieldValue("clientId", matchingPartPrice.clientId);
                              }
                            },
                          }}
                          children={(field) => (
                            <field.NumberInput
                              id="input-estimator-quantity"
                              placeholder={PIECES_LABEL}
                              className="w-[calc(7ch+1.5rem+2px)]"
                            />
                          )}
                        />
                      ) : (
                        quantity
                      )}
                    </TableCell>
                    <TableCell>{estimation?.materialCost != null && formatPrice(estimation.materialCost)}</TableCell>
                    <TableCell>
                      {estimation?.productionCost != null && formatPrice(estimation.productionCost)}
                    </TableCell>
                    <TableCell>{estimation && formatPrice(estimation.othersCost)}</TableCell>
                    <TableCell className="font-bold">
                      {estimation?.basePrice != null && formatPrice(estimation.basePrice)}
                    </TableCell>
                    <TableCell>
                      {estimation?.basePrice != null && formatPrice((estimation.basePrice * vatPercentage) / 100)}
                    </TableCell>
                    <TableCell className="font-bold">
                      {estimation?.basePrice != null &&
                        formatPrice((estimation.basePrice * (100 + vatPercentage)) / 100)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <BaseTable
            testId="table-estimator-pending-part-prices"
            title={PENDING_PRICES_TITLE}
            tableMode={TableMode.Radio}
            columns={pendingPartPriceColumns}
            rows={pendingPartPrices}
            isLoading={part === undefined}
            noDataMessage={NO_PENDING_PRICES_NEW_PRICE_MESSAGE}
            radioSelectedRowId={values.partPriceId}
            onRadioSelectedRowChange={(selectedRow) => {
              form.setFieldValue("quantity", selectedRow.original.quantity);
              form.setFieldValue("partPriceId", selectedRow.original.id);
              form.setFieldValue("clientId", selectedRow.original.clientId);
            }}
          />
        </div>
        <div className="flex flex-row items-end justify-between gap-2">
          <form.AppField
            name="clientId"
            children={(field) => <field.ClientCombobox testId="combobox-client" id="input-estimator-client" nullable />}
          />
          <form.ButtonSubmit
            customText={values.partPriceId !== null ? SAVE_PENDING_PRICE_LABEL : SAVE_NEW_PRICE_LABEL}
            disableIfPristine={false}
            disabled={estimationRows.at(-1)?.estimation?.basePrice == null}
          />
        </div>
      </Card>
    </FormContextProvider>
  );
}
