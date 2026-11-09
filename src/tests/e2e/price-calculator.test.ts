import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { getPartPriceById, getPartPricesByPartId } from "@/db/functions/part-price";
import { getPartPriceEstimatorByPartId } from "@/db/functions/part-price-estimator";
import { formatPrice, formatPricePerKilo } from "@/lib/formatters";
import type { EstimatorMaterial, EstimatorValues } from "@/lib/part-price-estimator";
import { DEFAULT_ESTIMATION_QUANTITIES, getEstimation, roundPrice } from "@/lib/part-price-estimator";
import { SAVE_NEW_PRICE_LABEL, SAVE_PENDING_PRICE_LABEL, SELECT_MATERIAL_MESSAGE } from "@/messages/part-price";
import {
  mockClients,
  mockCoatings,
  mockMaterials,
  mockPartPriceEstimators,
  mockPartPrices,
  mockParts,
  mockRawMaterials,
  mockShapes,
} from "@/tests/mock-data";
import { clickInComboboxOption, openCombobox } from "@/tests/utils/components/combobox";
import { assertFormLoaded } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  getTableNoDataRow,
  getTableRowByTestId,
  getTableRows,
} from "@/tests/utils/components/table";
import { expectSingleToast } from "@/tests/utils/components/toast";
import { test } from "@/tests/utils/fixtures";
import type { BasePart } from "@/types/part";

const activeParts = mockParts.filter((part) => part.deletedAt === null);
const getPendingPartPrices = (part: BasePart) =>
  mockPartPrices.filter((partPrice) => partPrice.partId === part.id && partPrice.price === null);

let formEstimator: Locator;
let tableSalePrices: Locator;
let tableEstimatorPendingPartPrices: Locator;

test.beforeEach(({ page }) => {
  formEstimator = page.getByTestId("form-part-price-estimator");
  tableSalePrices = formEstimator.getByTestId("table-estimator-sale-prices");
  tableEstimatorPendingPartPrices = formEstimator.getByTestId("table-estimator-pending-part-prices");
});

async function fillPercentage(input: Locator, value: string) {
  await input.clear();
  await input.pressSequentially(value);
}

function getSalePriceRow(testId: string): Locator {
  return tableSalePrices.locator(`tr[data-testid='${testId}']`);
}

async function expectInputValue(input: Locator, value: string | number | null, suffix?: string) {
  if (value === null) {
    await expect(input).toHaveValue("");
    return;
  }
  const formattedValue = String(value).replace(".", ",");
  await expect(input).toHaveValue(
    suffix === undefined ? formattedValue : new RegExp(`^${formattedValue}\\s${suffix}$`),
  );
}

function getMockEstimator(part: BasePart) {
  const estimator = mockPartPriceEstimators.find((mockEstimator) => mockEstimator.partId === part.id)!;
  const material = mockMaterials.find((mockMaterial) => mockMaterial.id === estimator.materialId);
  const rawMaterial = mockRawMaterials.find((mockRawMaterial) => mockRawMaterial.id === material?.rawMaterialId);
  const shape = mockShapes.find((mockShape) => mockShape.id === material?.shapeId);
  const estimatorMaterial: EstimatorMaterial | undefined =
    material && rawMaterial && shape
      ? {
          rawMaterial: { density: rawMaterial.density, price: rawMaterial.price },
          shape: { name: shape.name },
          width: material.width,
        }
      : undefined;
  const values: EstimatorValues = {
    coatingCost: estimator.coatingCost,
    machinePricePerHour: estimator.machinePricePerHour,
    machineSetupTimeMinutes: estimator.machineSetupTimeMinutes,
    materialCost: estimator.materialCost,
    otherCost: estimator.otherCost,
    partLength: estimator.partLength,
    partsPerHour: estimator.partsPerHour,
    secondOperationCost: estimator.secondOperationCost,
    transportPercentage: estimator.transportPercentage,
    unexpectedPercentage: estimator.unexpectedPercentage,
    wastePercentage: estimator.wastePercentage,
  };
  return { estimator, estimatorMaterial, material, rawMaterial, shape, values };
}

async function expectSalePriceRow(
  testId: string,
  quantity: number,
  values: EstimatorValues,
  estimatorMaterial: EstimatorMaterial | undefined,
) {
  const { materialCost, productionCost, othersCost, basePrice } = getEstimation(values, estimatorMaterial, quantity);
  const formatOptionalPrice = (price: number | null) => (price === null ? "" : formatPrice(price));
  const cells = getSalePriceRow(testId).getByRole("cell");
  await expect(cells.nth(1)).toHaveText(formatOptionalPrice(materialCost));
  await expect(cells.nth(2)).toHaveText(formatOptionalPrice(productionCost));
  await expect(cells.nth(3)).toHaveText(formatPrice(othersCost));
  await expect(cells.nth(4)).toHaveText(formatOptionalPrice(basePrice));
  await expect(cells.nth(6)).toHaveText(formatOptionalPrice(basePrice === null ? null : basePrice * 1.21));
  return basePrice;
}

test("list the parts with pending prices and open the calculator from there", async ({ page }) => {
  const partsWithPendingPrices = activeParts.filter((part) => getPendingPartPrices(part).length > 0);
  expect(partsWithPendingPrices.length, "Wrong test set up: Some Artículo should have pending prices").toBeGreaterThan(
    0,
  );
  expect(partsWithPendingPrices.length, "Wrong test set up: Some Artículo should have no pending prices").toBeLessThan(
    activeParts.length,
  );
  const tablePendingPartPrice = page.getByTestId("table-pending-part-price");

  for (const part of partsWithPendingPrices) {
    await page.goto("/price-calculator");
    await assertTableRowCount(tablePendingPartPrice, partsWithPendingPrices.length);
    // Artículos whose prices are all calculated or that have none are not listed
    for (const otherPart of mockParts) {
      await expect(getTableRowByTestId(tablePendingPartPrice, otherPart.id)).toHaveCount(
        partsWithPendingPrices.includes(otherPart) ? 1 : 0,
      );
    }

    await getTableRowByTestId(tablePendingPartPrice, part.id).getByTestId("button-link-calculate-part-price").click();

    await expect(page).toHaveURL(`/price-calculator/${part.id}`);
    await assertFormLoaded(formEstimator);
    await assertTableRowCount(tableEstimatorPendingPartPrices, getPendingPartPrices(part).length);
  }
});

for (const part of activeParts.filter((activePart) =>
  mockPartPriceEstimators.some((estimator) => estimator.partId === activePart.id),
)) {
  test(`the price calculator of the Artículo ${part.id}`, async ({ page, toasts }) => {
    const { estimator, estimatorMaterial, material, rawMaterial, shape, values } = getMockEstimator(part);
    const coating = mockCoatings.find((mockCoating) => mockCoating.id === part.coatingId);
    const pendingPartPrices = getPendingPartPrices(part);

    await page.goto(`/price-calculator/${part.id}`);
    await assertFormLoaded(formEstimator);

    await test.step("the estimator is filled with the saved values", async () => {
      await expectInputValue(page.locator("#input-estimator-part-length"), estimator.partLength, "mm");
      await expectInputValue(page.locator("#input-estimator-waste-percentage"), estimator.wastePercentage, "%");
      await expectInputValue(page.locator("#input-estimator-setup-time"), estimator.machineSetupTimeMinutes, "min");
      await expectInputValue(page.locator("#input-estimator-parts-per-hour"), estimator.partsPerHour);
      await expectInputValue(
        page.locator("#input-estimator-unexpected-percentage"),
        estimator.unexpectedPercentage,
        "%",
      );
      await expectInputValue(page.locator("#input-estimator-transport-percentage"), estimator.transportPercentage, "%");
      await expectInputValue(page.locator("#input-estimator-coating-cost"), estimator.coatingCost, "€");
      await expectInputValue(page.locator("#input-estimator-price-per-hour"), estimator.machinePricePerHour, "€");
    });

    await test.step("the material details are shown in a table", async () => {
      const tableMaterial = formEstimator.getByTestId("table-estimator-material");
      if (material === undefined) {
        await expect(getTableNoDataRow(tableMaterial)).toHaveText(SELECT_MATERIAL_MESSAGE);
        return;
      }
      const cells = getTableRows(tableMaterial).first().getByRole("cell");
      await expect(cells.nth(0)).toHaveText(rawMaterial!.name);
      await expect(cells.nth(1)).toHaveText(shape!.name);
      await expect(cells.nth(2)).toHaveText(`${material.width} mm`);
      await expect(cells.nth(3)).toHaveText(formatPricePerKilo(rawMaterial!.price));
    });

    await test.step("the coating is shown next to the other costs", async () => {
      await (coating === undefined
        ? expect(formEstimator).not.toContainText("Recubrimiento: ")
        : expect(formEstimator).toContainText(`Recubrimiento: ${coating.name}`));
      await expect(formEstimator.locator("label:text-is('Recubrimiento')")).toBeVisible();
    });

    await test.step("unexpected and transport percentages are not required", async () => {
      await expect(formEstimator.locator("label:text-is('Imprevistos') svg")).toHaveCount(0);
      await expect(formEstimator.locator("label:text-is('Transporte') svg")).toHaveCount(0);
      await expect(formEstimator.locator("label:text-is('Desperdicio') svg")).toHaveCount(1);
    });

    await test.step("the sale prices are calculated for the default quantities", async () => {
      for (const quantity of DEFAULT_ESTIMATION_QUANTITIES) {
        await expectSalePriceRow(String(quantity), quantity, values, estimatorMaterial);
      }
    });

    await test.step("typing the quantity of every pending part price selects it", async () => {
      const inputQuantity = getSalePriceRow("custom").locator("#input-estimator-quantity");
      for (const pendingPartPrice of pendingPartPrices) {
        const expectedPartPrice = pendingPartPrices.find(({ quantity }) => quantity === pendingPartPrice.quantity)!;
        await inputQuantity.clear();
        await inputQuantity.pressSequentially(String(pendingPartPrice.quantity));

        await expect(
          getTableRowByTestId(tableEstimatorPendingPartPrices, expectedPartPrice.id).getByRole("radio"),
        ).toBeChecked();
        await expect(tableEstimatorPendingPartPrices.getByRole("radio", { checked: true })).toHaveCount(1);
        await expect(formEstimator.getByTestId("button-submit")).toHaveText(SAVE_PENDING_PRICE_LABEL);
      }
    });

    await test.step("the prices tab does not offer to calculate or create prices", async () => {
      await page.goto(`/price-calculator/${part.id}?tab=prices`);

      const formPart = page.getByTestId("form-part");
      await assertFormLoaded(formPart);

      await expect(formPart.getByTestId("table-part-prices")).toBeVisible();
      await expect(formPart.getByTestId("button-link-calculate-price")).toHaveCount(0);
      await expect(formPart.getByTestId("card-create-part-price")).toHaveCount(0);
    });

    // Without a base price, as for a Material whose cost cannot be calculated, no price can be saved
    const assertPriceCannotBeSaved = async () => {
      await expect(formEstimator.getByTestId("button-submit")).toBeDisabled();
      expect(await getPartPricesByPartId(part.id)).toEqual(partPricesBefore);
    };
    let partPricesBefore = await getPartPricesByPartId(part.id);

    await test.step("save every pending part price", async () => {
      let savedPartPriceCount = 0;
      for (const pendingPartPrice of pendingPartPrices) {
        await page.goto(`/price-calculator/${part.id}`);
        await assertFormLoaded(formEstimator);
        await assertTableRowCount(tableEstimatorPendingPartPrices, pendingPartPrices.length - savedPartPriceCount);

        await getTableRowByTestId(tableEstimatorPendingPartPrices, pendingPartPrice.id).getByRole("radio").click();
        const customRow = getSalePriceRow("custom");
        await expect(customRow.locator("#input-estimator-quantity")).toHaveValue(String(pendingPartPrice.quantity));

        const basePrice = await expectSalePriceRow("custom", pendingPartPrice.quantity!, values, estimatorMaterial);
        partPricesBefore = await getPartPricesByPartId(part.id);
        if (basePrice === null) {
          await assertPriceCannotBeSaved();
          continue;
        }

        await formEstimator.getByTestId("button-submit").click();
        savedPartPriceCount++;

        await expectSingleToast(page);

        expect(await getPartPriceById(pendingPartPrice.id)).toMatchObject({
          clientId: pendingPartPrice.clientId,
          price: roundPrice(basePrice),
          quantity: pendingPartPrice.quantity,
        });
        expect(await getPartPricesByPartId(part.id)).toHaveLength(
          mockPartPrices.filter((partPrice) => partPrice.partId === part.id).length,
        );

        const dbEstimator = await getPartPriceEstimatorByPartId(part.id);
        expect(dbEstimator?.machinePricePerHour).toBe(estimator.machinePricePerHour);
        expect(dbEstimator?.wastePercentage).toBe(estimator.wastePercentage);
      }
    });

    await test.step("save a new part price for every client", async () => {
      let createdPartPriceCount = 0;

      for (const [index, client] of mockClients.filter((mockClient) => mockClient.deletedAt === null).entries()) {
        const newQuantity = 25 + index;

        await page.goto(`/price-calculator/${part.id}`);
        await assertFormLoaded(formEstimator);

        const inputQuantity = getSalePriceRow("custom").locator("#input-estimator-quantity");
        await inputQuantity.clear();
        await inputQuantity.pressSequentially(String(newQuantity));
        const basePrice = await expectSalePriceRow("custom", newQuantity, values, estimatorMaterial);
        await expect(tableEstimatorPendingPartPrices.getByRole("radio", { checked: true })).toHaveCount(0);
        await expect(formEstimator.getByTestId("button-submit")).toHaveText(SAVE_NEW_PRICE_LABEL);

        const comboboxClient = formEstimator.getByTestId("combobox-client");
        await openCombobox(comboboxClient);
        await clickInComboboxOption(page, client.name);
        partPricesBefore = await getPartPricesByPartId(part.id);
        if (basePrice === null) {
          await assertPriceCannotBeSaved();
          continue;
        }

        await formEstimator.getByTestId("button-submit").click();
        createdPartPriceCount++;

        await expectSingleToast(page);

        const dbPartPrices = await getPartPricesByPartId(part.id);
        expect(dbPartPrices).toHaveLength(
          mockPartPrices.filter((partPrice) => partPrice.partId === part.id).length + createdPartPriceCount,
        );
        expect(dbPartPrices.find((partPrice) => partPrice.quantity === newQuantity)).toMatchObject({
          clientId: client.id,
          price: roundPrice(basePrice),
        });
      }
    });

    await test.step("the estimator is saved when a field is blurred, without saving a price", async () => {
      await page.goto(`/price-calculator/${part.id}`);
      await assertFormLoaded(formEstimator);
      const partPricesBeforeBlur = await getPartPricesByPartId(part.id);

      const inputUnexpectedPercentage = page.locator("#input-estimator-unexpected-percentage");
      await inputUnexpectedPercentage.clear();
      await inputUnexpectedPercentage.blur();
      await expect.poll(async () => (await getPartPriceEstimatorByPartId(part.id))?.unexpectedPercentage).toBeNull();

      const inputTransportPercentage = page.locator("#input-estimator-transport-percentage");
      await inputTransportPercentage.clear();
      await inputTransportPercentage.blur();
      await expect.poll(async () => (await getPartPriceEstimatorByPartId(part.id))?.transportPercentage).toBeNull();

      await expect(toasts).toHaveCount(0);
      expect(await getPartPricesByPartId(part.id)).toEqual(partPricesBeforeBlur);

      // The sale prices are calculated with empty unexpected and transport percentages
      const blurredValues = { ...values, transportPercentage: null, unexpectedPercentage: null };
      const basePrice = await expectSalePriceRow("10", 10, blurredValues, estimatorMaterial);

      // ...and a price can still be saved, if it can be calculated
      const inputQuantity = getSalePriceRow("custom").locator("#input-estimator-quantity");
      await inputQuantity.clear();
      await inputQuantity.pressSequentially("10");
      await expectSalePriceRow("custom", 10, blurredValues, estimatorMaterial);
      await (basePrice === null
        ? expect(formEstimator.getByTestId("button-submit")).toBeDisabled()
        : expect(formEstimator.getByTestId("button-submit")).toBeEnabled());
    });

    await test.step("the sale prices are recalculated when the percentages change", async () => {
      await fillPercentage(page.locator("#input-estimator-waste-percentage"), "10");
      await fillPercentage(page.locator("#input-estimator-unexpected-percentage"), "20");
      await fillPercentage(page.locator("#input-estimator-transport-percentage"), "5");

      await expectSalePriceRow(
        "10",
        10,
        { ...values, transportPercentage: "5", unexpectedPercentage: "20", wastePercentage: "10" },
        estimatorMaterial,
      );
    });
  });
}
