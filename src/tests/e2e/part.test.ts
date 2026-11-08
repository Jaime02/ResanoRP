import fs from "node:fs";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { AppContextStorage, UserMode } from "@/contexts/app-context";
import { getBlueprintById, getBlueprintsByPartId } from "@/db/functions/blueprint";
import { getPartById, getPartComponentsOfPart } from "@/db/functions/part";
import { getPartPriceById, getPartPricesByPartId } from "@/db/functions/part-price";
import { getPartReferenceById, getPartReferencesByPartId } from "@/db/functions/part-reference";
import { getLatestPartStockTransactionByPartId } from "@/db/functions/part-stock";
import { dbGetProductionOrderStatus, getProductionOrderById } from "@/db/functions/production-order";
import {
  PART_COMPONENT_CONSTRAINT,
  PART_COMPONENT_NOT_SELF_CONSTRAINT,
  PART_COMPONENT_QUANTITY_CONSTRAINT,
  PART_FEATURE_CONSTRAINT,
  PART_REFERENCE_CONSTRAINT,
  dbTableClient,
  dbTableMaterial,
  dbTablePart,
  dbTablePartComponent,
  dbTablePartFeature,
  dbTablePartMaterial,
  dbTablePartPrice,
  dbTablePartProduction,
  dbTablePartReference,
  dbTableRawMaterial,
  dbTableShape,
} from "@/db/schema";
import { getBlueprintPath } from "@/files/blueprint";
import { formatPrice } from "@/lib/formatters";
import { translatedEnums } from "@/lib/translations";
import { BLUEPRINTS_TITLE, BLUEPRINT_LABEL } from "@/messages/blueprint";
import {
  ACTIONS_LABEL,
  DELETE_FILTERS_LABEL,
  NEXT_PAGE_LABEL,
  PREVIOUS_PAGE_LABEL,
  DESCRIPTION_LABEL,
  NAME_LABEL,
  NOTES_LABEL,
  PRICE_LABEL,
  QUANTITY_LABEL,
  REFERENCE_LABEL,
} from "@/messages/common";
import { MATERIALS_LABEL } from "@/messages/material";
import {
  GENERAL_LABEL,
  NO_COMPATIBLE_MATERIALS_MESSAGE,
  PART_SELECT_SHAPE_AND_SIZE_MESSAGE,
  CLIENT_REFERENCE_DESCRIPTION_LABEL,
  PART_COMPONENT_CYCLE_ERROR_MESSAGE,
  PART_COMPONENT_DUPLICATED_ERROR_MESSAGE,
  PART_COMPONENT_EDIT_VALIDATION_ERROR_MESSAGE,
  PART_COMPONENT_SELF_ERROR_MESSAGE,
  PART_FEATURE_LABEL,
  PART_REFERENCE_DELETED_TOOLTIP_MESSAGE,
  PART_STOCK_UPDATE_QUANTITY_LABEL,
} from "@/messages/part";
import { PRICES_TITLE } from "@/messages/part-price";
import type { TTablePartState } from "@/schemas/part";
import { ProductionOrderStatus } from "@/schemas/production-order";
import { sanitizePath } from "@/schemas/utils";
import {
  DAY_IN_MS,
  MOCK_DATA_PATH,
  MOCK_INITIAL_DATE,
  mockBlueprints,
  mockClients,
  mockCoatings,
  mockDeliveryNoteLines,
  mockMachines,
  mockMaterials,
  mockPartComponents,
  mockPartFeatures,
  mockPartMaterials,
  mockPartPrices,
  mockPartProduction,
  mockPartReferences,
  mockPartStock,
  mockParts,
  mockProductionOrders,
  mockQualityChecks,
  mockRawMaterials,
  mockSellOrderLines,
  mockSellOrders,
  mockShapes,
} from "@/tests/mock-data";
import { countTestIdInsertions } from "@/tests/utils/components";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import {
  assertComboboxValue,
  clickInComboboxOption,
  getClearComboboxButton,
  openCombobox,
  selectComboboxOption,
} from "@/tests/utils/components/combobox";
import { setInputFiles } from "@/tests/utils/components/file-input";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { openPartPicker } from "@/tests/utils/components/picker";
import { getPopoverContent } from "@/tests/utils/components/popover";
import {
  assertTableRowCount,
  getEditableCellById,
  getTableNoDataRow,
  getTableRowByPosition,
  filterByExactText,
  getTableRowByTestId,
  getTablePagerButton,
  getTableRows,
} from "@/tests/utils/components/table";
import { clearToasts, expectSingleToast, getToastType } from "@/tests/utils/components/toast";
import { expectCheckViolation, expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, setUserMode, test } from "@/tests/utils/fixtures";
import {
  getMockClientParts,
  getMockActivePartSetsOfPart,
  getMockDeliveryNoteById,
  getMockPartReferences,
  getMockPartComponentsOfPart,
  getPartInActiveSetsErrorMessage,
  getMockSellOrderById,
} from "@/tests/utils/mock-data-utils";
import { workflowOpenEditDeliveryNote } from "@/tests/workflows/delivery-note";
import { getMockPartMaterials } from "@/tests/workflows/material";
import {
  getPartComponentQuantity,
  gotoPartComponents,
  workflowCreatePartComponent,
  workflowDeletePart,
  workflowDeletePartComponent,
  workflowRemovePartFromActiveSets,
} from "@/tests/workflows/part";
import { gotoProductionOrdersWithStatuses } from "@/tests/workflows/production";
import { workflowOpenSellOrderLinePartPicker } from "@/tests/workflows/sell-order";
import { ToastType } from "@/types";
import type { BaseMaterial } from "@/types/material";
import { COMPATIBLE_MATERIALS_PAGE_SIZE } from "@/types/material";
import type { BasePart } from "@/types/part";
import { PART_PRODUCTION_HISTORY_PAGE_SIZE } from "@/types/part-production";

const activeParts = mockParts.filter((part) => part.deletedAt === null);
const deletedParts = mockParts.filter((part) => part.deletedAt !== null);
const activeClients = mockClients.filter((client) => client.deletedAt === null);
const activePartReferences = mockPartReferences.filter(
  (partReference) => partReference.deletedAt === null && activeParts.some((part) => part.id === partReference.partId),
);
const NEW_PART_ID = Math.max(...mockParts.map((part) => part.id)) + 1;

// The part form also lists the deleted Referencias, so they can be restored
function getFormPartReferences(partId: number) {
  return mockPartReferences.filter(
    (partReference) =>
      partReference.partId === partId &&
      (partReference.clientId === null || activeClients.some((client) => client.id === partReference.clientId)),
  );
}

let tablePart: Locator;
let formPart: Locator;
let dialogEditPartPrice: Locator;
let dialogCreateEditPartReference: Locator;
let tablePartMaterials: Locator;
let tableCompatiblePartMaterials: Locator;
let tablePartPrices: Locator;
let tablePartReferences: Locator;

test.beforeEach(({ page }) => {
  tablePart = page.getByTestId("table-part");
  formPart = page.getByTestId("form-part");
  dialogEditPartPrice = page.getByTestId("dialog-edit-part-price");
  dialogCreateEditPartReference = page.getByTestId("dialog-create-edit-part-reference");
  tablePartMaterials = formPart.getByTestId("table-part-materials");
  tableCompatiblePartMaterials = formPart.getByTestId("table-compatible-part-materials");
  tablePartPrices = formPart.getByTestId("table-part-prices");
  tablePartReferences = formPart.getByTestId("table-part-references");
});

// The Pedido de venta whose Lines can be added, so its part picker can be opened
function getMockEditableSellOrder(clientId: number) {
  return mockSellOrders.find((sellOrder) => sellOrder.clientId === clientId && sellOrder.deletedAt === null);
}

function expectArchivedBlueprintFile(blueprintPath: string, fileName: string) {
  const archivedFileNames = fs
    .readdirSync(path.dirname(blueprintPath))
    .filter((entryName) => entryName.startsWith("DELETED_") && entryName.endsWith(`_${fileName}.pdf`));
  expect(archivedFileNames, `The file of the Plano "${fileName}" should be kept, renamed as deleted`).toHaveLength(1);
}

function getPartIdsWithMaterial(matchesMaterial: (material: BaseMaterial) => boolean) {
  return [
    ...new Set(
      mockPartMaterials
        .filter((partMaterial) =>
          matchesMaterial(mockMaterials.find((material) => material.id === partMaterial.materialId)!),
        )
        .map((partMaterial) => partMaterial.partId),
    ),
  ].filter((partId) => activeParts.some((part) => part.id === partId));
}

function getCompatibleMaterials(part: BasePart, assignedMaterialIds: Set<number>) {
  return mockMaterials.filter(
    (material) =>
      material.deletedAt === null &&
      mockRawMaterials.find((rawMaterial) => rawMaterial.id === material.rawMaterialId)?.deletedAt === null &&
      material.shapeId === part.shapeId &&
      part.width !== null &&
      Number(material.width) >= Number(part.width) &&
      !assignedMaterialIds.has(material.id),
  );
}

test("manage the parts", { annotation: TestAnnotations.ResetBlueprints }, async ({ page, db, toasts }) => {
  async function expectVisibleParts(partIds: Array<number>) {
    await assertTableRowCount(tablePart, partIds.length);
    for (const partId of partIds) {
      await expect(getTableRowByTestId(tablePart, partId)).toBeVisible();
    }
  }

  await test.step("show query error dialog when navigating to unexisting part", async () => {
    await page.goto(`/part/${NEW_PART_ID}`);

    const dialogGetPartByIdQueryError = page.getByTestId("dialog-error-get-part-by-id-query");
    await expect(dialogGetPartByIdQueryError).toBeVisible();
    await dialogGetPartByIdQueryError.getByTestId("button-close").click();
    await expect(dialogGetPartByIdQueryError).not.toBeVisible();
    await expect(page).toHaveURL("/part");
  });

  await test.step("filter parts by the description of every part", async () => {
    await page.goto("/part");
    // Deleted Artículos are not listed
    await expectVisibleParts(activeParts.map((part) => part.id));

    const inputDescriptionFilter = tablePart.getByTestId("input-filter-description");
    for (const part of activeParts) {
      await inputDescriptionFilter.fill(part.description);
      await expectVisibleParts(
        activeParts
          .filter((activePart) => activePart.description.toLowerCase().includes(part.description.toLowerCase()))
          .map((activePart) => activePart.id),
      );
    }

    await inputDescriptionFilter.clear();
    await expectVisibleParts(activeParts.map((part) => part.id));
  });

  await test.step("filter parts by every material and coating", async () => {
    // An Artículo with two Materiales of the same Materia prima must not be listed twice when filtering by it
    expect(
      activeParts.some((part) =>
        getMockPartMaterials(part).some((material, index, partMaterials) =>
          partMaterials.some(
            (otherMaterial, otherIndex) =>
              otherIndex !== index && otherMaterial.rawMaterialId === material.rawMaterialId,
          ),
        ),
      ),
      "Wrong test set up: Some Artículo should have two Materiales of the same Materia prima",
    ).toBe(true);

    await page.goto("/part");
    const popoverMaterialFilters = tablePart.getByTestId("popover-part-material-filters");
    const comboboxCoatingFilter = tablePart.getByTestId("combobox-filter-coating");

    for (const material of mockMaterials.filter((mockMaterial) => mockMaterial.deletedAt === null)) {
      const rawMaterialName = mockRawMaterials.find((rawMaterial) => rawMaterial.id === material.rawMaterialId)!.name;
      const shapeName = mockShapes.find((shape) => shape.id === material.shapeId)!.name;

      await popoverMaterialFilters.getByTestId("popover-trigger").click();

      await openCombobox(page.getByTestId("combobox-filter-material-raw-material"));
      await clickInComboboxOption(page, rawMaterialName);
      await expectVisibleParts(
        getPartIdsWithMaterial((partMaterial) => partMaterial.rawMaterialId === material.rawMaterialId),
      );

      await page.getByTestId("input-filter-material-width").pressSequentially(material.width);
      await expectVisibleParts(
        getPartIdsWithMaterial(
          (partMaterial) =>
            partMaterial.rawMaterialId === material.rawMaterialId &&
            Number(partMaterial.width) === Number(material.width),
        ),
      );

      await openCombobox(page.getByTestId("combobox-filter-material-shape"));
      await clickInComboboxOption(page, shapeName);
      const materialPartIds = getPartIdsWithMaterial((partMaterial) => partMaterial.id === material.id);
      await expectVisibleParts(materialPartIds);

      await page.keyboard.press("Escape");

      // Both filters must match
      for (const coating of mockCoatings.filter((mockCoating) => mockCoating.deletedAt === null)) {
        await openCombobox(comboboxCoatingFilter);
        await clickInComboboxOption(page, coating.name);
        await expectVisibleParts(
          activeParts
            .filter((part) => part.coatingId === coating.id && materialPartIds.includes(part.id))
            .map((part) => part.id),
        );
        await getClearComboboxButton(comboboxCoatingFilter).click();
      }

      await popoverMaterialFilters.getByTestId("button-clear-filters").click();
      await expectVisibleParts(activeParts.map((part) => part.id));
      await expect(page).toHaveURL("/part");
    }

    for (const coating of mockCoatings.filter((mockCoating) => mockCoating.deletedAt === null)) {
      await openCombobox(comboboxCoatingFilter);
      await clickInComboboxOption(page, coating.name);
      await expectVisibleParts(activeParts.filter((part) => part.coatingId === coating.id).map((part) => part.id));
      await getClearComboboxButton(comboboxCoatingFilter).click();
    }
    await expectVisibleParts(activeParts.map((part) => part.id));
    await expect(page).toHaveURL("/part");
  });

  await test.step("open the price calculator from the prices tab of every part", async () => {
    for (const part of activeParts) {
      await page.goto(`/part/${part.id}?tab=prices`);
      await assertFormLoaded(formPart);

      await formPart.getByTestId("button-link-calculate-price").click();
      await expect(page).toHaveURL(`/price-calculator/${part.id}`);
    }
  });

  await test.step("compute the stock of the parts from their transactions", async () => {
    // Computed from the mock data instead of with buildStockLedger, so the ledger is not checked against itself
    const getExpectedStock = (partId: number) => {
      const productionOrderIds = mockProductionOrders
        .filter((productionOrder) => productionOrder.partId === partId)
        .map((productionOrder) => productionOrder.id);
      const partReferenceIds = mockPartReferences
        .filter((partReference) => partReference.partId === partId)
        .map((partReference) => partReference.id);
      const transactions = [
        ...mockPartProduction
          .filter((partProduction) => productionOrderIds.includes(partProduction.productionOrderId))
          .map((partProduction) => ({
            date: partProduction.date,
            apply: (stock: number) => stock + partProduction.quantity,
          })),
        ...mockDeliveryNoteLines
          .filter(
            (deliveryNoteLine) =>
              deliveryNoteLine.partReferenceId !== null && partReferenceIds.includes(deliveryNoteLine.partReferenceId),
          )
          .map((deliveryNoteLine) => ({
            date: getMockDeliveryNoteById(deliveryNoteLine.deliveryNoteId)!.createdAt,
            apply: (stock: number) => stock - Math.max(deliveryNoteLine.quantity, 0),
          })),
        ...mockPartStock
          .filter((partStock) => partStock.partId === partId)
          .map((partStock) => ({ date: partStock.date, apply: () => partStock.quantity })),
      ];
      if (transactions.length === 0) {
        return undefined;
      }
      return transactions
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .reduce((stock, transaction) => Math.max(transaction.apply(stock), 0), 0);
    };

    const expectedStocks = activeParts.map((part) => ({ expectedStock: getExpectedStock(part.id), partId: part.id }));
    expect(
      expectedStocks.some(({ expectedStock }) => expectedStock === 0),
      "Some part should have delivered more than its stock",
    ).toBe(true);

    await page.goto("/part");
    for (const { partId, expectedStock } of expectedStocks) {
      expect((await getLatestPartStockTransactionByPartId(partId))?.finalQuantity, `Part ${partId}`).toBe(
        expectedStock,
      );
      await expect(getTableRowByTestId(tablePart, partId).getByTestId("partStockQuantity")).toHaveText(
        String(expectedStock ?? ""),
      );
    }
  });

  await test.step("keep the unsaved changes of every part while its related rows change", async () => {
    const inputDescription = getFormInputByLabel(formPart, DESCRIPTION_LABEL);

    for (const part of activeParts) {
      const unsavedDescription = `Unsaved description of ${part.id}`;

      await page.goto(`/part/${part.id}`);
      await assertFormLoaded(formPart);
      await inputDescription.fill(unsavedDescription);

      await page.getByRole("tab", { name: BLUEPRINTS_TITLE }).click();
      await formPart.getByTestId("button-create-part-feature").click();
      const dialogCreatePartFeature = page.getByTestId("dialog-create-part-feature");
      await getFormInputByLabel(dialogCreatePartFeature, PART_FEATURE_LABEL).fill("Característica sin guardar");
      await dialogCreatePartFeature.getByTestId("button-submit").click();
      await expect(dialogCreatePartFeature).toBeHidden();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      await page.getByRole("tab", { name: GENERAL_LABEL }).click();
      await expect(inputDescription).toHaveValue(unsavedDescription);

      // ...but a change of the Artículo itself reloads the form
      const syncedNotes = `Synced notes of ${part.id}`;
      await db.update(dbTablePart).set({ notes: syncedNotes }).where(eq(dbTablePart.id, part.id));
      await expect(getFormInputByLabel(formPart, NOTES_LABEL, InputElementType.Textarea)).toHaveValue(syncedNotes);
      await expect(inputDescription).toHaveValue(part.description);
    }
  });

  await test.step("update the information of every part", async () => {
    for (const part of activeParts) {
      const newShape = mockShapes.find((shape) => shape.id !== part.shapeId)!;
      const updatedDescription = `Updated description of ${part.id}`;
      const updatedWidth = "55.2";
      expect((await getPartById(part.id))?.shapeId).toBe(part.shapeId);

      await page.goto(`/part/${part.id}`);
      await assertFormLoaded(formPart);

      const inputDescription = getFormInputByLabel(formPart, DESCRIPTION_LABEL);
      await inputDescription.fill(updatedDescription);
      await expect(inputDescription).toHaveValue(updatedDescription);

      await formPart.getByTestId("input-width").pressSequentially(updatedWidth);

      const comboboxShape = formPart.getByTestId("combobox-shape");
      await assertComboboxValue(comboboxShape, part.shapeId === null ? null : String(part.shapeId));
      await openCombobox(comboboxShape);
      await clickInComboboxOption(page, newShape.name);

      await clearToasts(page);
      await formPart.getByTestId("button-submit").click();

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);

      expect(await getPartById(part.id)).toMatchObject({
        description: updatedDescription,
        shapeId: newShape.id,
        width: updatedWidth,
      });
    }
  });

  await test.step("create a new part for every client", async () => {
    for (const [index, client] of activeClients.entries()) {
      const newPartId = Math.max(...(await db.query.dbTablePart.findMany()).map((dbPart) => dbPart.id)) + 1;
      await page.goto("/part?createPart=true");
      // The page opened after creating it must not take the new Artículo for a missing one while it syncs
      const countGetPartByIdQueryErrors = await countTestIdInsertions(page, "dialog-error-get-part-by-id-query");

      const newReference = `REF-12345-${index}`;
      const newClientDescription = `${newReference} Client description`;
      const newDescription = `New Test Part Description of ${client.name}`;
      const newNotes = "Some notes for the new part";
      const newWidth = "75.5";
      const newLength = "150";

      await getFormInputByLabel(formPart, REFERENCE_LABEL).fill(newReference);
      await getFormInputByLabel(formPart, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill(newClientDescription);

      const clientReferenceCombobox = formPart.getByTestId("combobox-client");
      await openCombobox(clientReferenceCombobox);
      await clickInComboboxOption(page, client.name);

      await getFormInputByLabel(formPart, DESCRIPTION_LABEL).fill(newDescription);
      await getFormInputByLabel(formPart, NOTES_LABEL, InputElementType.Textarea).fill(newNotes);
      await formPart.getByTestId("input-width").pressSequentially(newWidth);
      await formPart.getByTestId("input-length").pressSequentially(newLength);

      await formPart.getByTestId("button-submit").click();

      await expect(page).toHaveURL(`/part/${newPartId}`);
      await expect(getFormInputByLabel(formPart, DESCRIPTION_LABEL)).toHaveValue(newDescription);
      expect(await countGetPartByIdQueryErrors()).toBe(0);

      expect(await getPartById(newPartId)).toMatchObject({
        description: newDescription,
        length: newLength,
        notes: newNotes,
        width: newWidth,
      });
      expect(await getPartReferencesByPartId(newPartId)).toEqual([
        expect.objectContaining({
          clientDescription: newClientDescription,
          clientId: client.id,
          partId: newPartId,
          reference: newReference,
        }),
      ]);

      expect(
        fs.existsSync(path.join(process.env.BLUEPRINT_ROOT_PATH!, `${newPartId} - ${sanitizePath(newDescription)}`)),
      ).toBe(true);
    }
  });

  await test.step("create a new part with minimum fields for every client", async () => {
    for (const [index, client] of activeClients.entries()) {
      const newPartId = Math.max(...(await db.query.dbTablePart.findMany()).map((dbPart) => dbPart.id)) + 1;
      await page.goto("/part?createPart=true");

      const newDescription = "New Test Part Description";
      const newReference = `REF123-${index}`;

      await getFormInputByLabel(formPart, REFERENCE_LABEL).fill(newReference);
      await getFormInputByLabel(formPart, DESCRIPTION_LABEL).fill(newDescription);
      await getFormInputByLabel(formPart, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill(
        `${newReference} Client description`,
      );

      await openCombobox(formPart.getByTestId("combobox-client"));
      await clickInComboboxOption(page, client.name);

      await formPart.getByTestId("button-submit").click();

      await expect(page).toHaveURL(`/part/${newPartId}`);

      expect((await getPartById(newPartId))?.description).toBe(newDescription);
      expect(await getPartReferencesByPartId(newPartId)).toEqual([
        expect.objectContaining({ clientId: client.id, partId: newPartId, reference: newReference }),
      ]);
    }
  });
});

test("edit, delete and create the prices of every part", async ({ page, toasts }) => {
  for (const part of activeParts) {
    const partPrices = mockPartPrices.filter((partPrice) => partPrice.partId === part.id);
    const tablePartPricesRows = getTableRows(tablePartPrices);

    await page.goto(`/part/${part.id}?tab=prices`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(tablePartPrices, partPrices.length);

    for (const [index, partPrice] of partPrices.entries()) {
      const newPrice = `${index + 1}.99`;
      const newClient = activeClients.find((client) => client.id !== partPrice.clientId)!;
      const rowPartPrice = getTableRowByTestId(tablePartPrices, partPrice.id);

      await rowPartPrice.getByTestId("button-edit").click();
      await expect(dialogEditPartPrice).toBeVisible();
      await assertFormLoaded(dialogEditPartPrice);

      const inputPrice = getFormInputByLabel(dialogEditPartPrice, PRICE_LABEL, InputElementType.Number);
      const comboboxClient = dialogEditPartPrice.getByTestId("combobox-client");
      await expect(inputPrice).toHaveValue(formatPrice(partPrice.price, { replaceNBSP: true }));
      await expect(getFormInputByLabel(dialogEditPartPrice, QUANTITY_LABEL, InputElementType.Number)).toHaveValue(
        String(partPrice.quantity),
      );
      await assertComboboxValue(comboboxClient, partPrice.clientId === null ? null : String(partPrice.clientId));

      await inputPrice.clear();
      await inputPrice.pressSequentially(newPrice);
      await openCombobox(comboboxClient);
      await clickInComboboxOption(page, newClient.name);
      await expect(inputPrice).toHaveValue(formatPrice(newPrice, { replaceNBSP: true }));
      await assertComboboxValue(comboboxClient, String(newClient.id));

      await dialogEditPartPrice.getByTestId("button-submit").click();
      await expect(dialogEditPartPrice).not.toBeVisible();

      await expect(tablePartPricesRows).toHaveCount(partPrices.length);
      await expect(rowPartPrice.getByRole("cell", { exact: true, name: String(partPrice.quantity) })).toBeVisible();
      await expect(rowPartPrice.getByRole("cell", { exact: true, name: formatPrice(newPrice) })).toBeVisible();
      expect(await getPartPriceById(partPrice.id)).toMatchObject({ clientId: newClient.id, price: newPrice });
      expect(await getPartPricesByPartId(part.id)).toHaveLength(partPrices.length);
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
    }

    for (const [index, partPrice] of partPrices.entries()) {
      const rowPartPrice = getTableRowByTestId(tablePartPrices, partPrice.id);
      await expect(rowPartPrice.getByRole("cell", { exact: true, name: String(partPrice.quantity) })).toBeVisible();

      await openAndConfirmAlertDialog(page, rowPartPrice.getByTestId("button-delete"), "dialog-delete-model-content");

      await expect(rowPartPrice).not.toBeVisible();
      await assertTableRowCount(tablePartPrices, partPrices.length - index - 1);
      expect(await getPartPriceById(partPrice.id)).toBeUndefined();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
    }

    const cardCreatePartPrice = formPart.getByTestId("card-create-part-price");
    for (const [index, client] of activeClients.entries()) {
      const newQuantity = String(55 + index);
      const newPrice = "12.34";

      const inputQuantity = getFormInputByLabel(cardCreatePartPrice, QUANTITY_LABEL, InputElementType.Number);
      await inputQuantity.clear();
      await inputQuantity.pressSequentially(newQuantity);
      const inputPrice = getFormInputByLabel(cardCreatePartPrice, PRICE_LABEL, InputElementType.Number);
      await inputPrice.clear();
      await inputPrice.pressSequentially(newPrice);
      await openCombobox(cardCreatePartPrice.getByTestId("combobox-client"));
      await clickInComboboxOption(page, client.name);

      const buttonSubmit = cardCreatePartPrice.getByTestId("button-submit");
      await expect(buttonSubmit).toBeEnabled();
      await buttonSubmit.click();

      await expect(tablePartPricesRows).toHaveCount(index + 1);
      const dbPartPrice = (await getPartPricesByPartId(part.id)).find(
        (partPrice) => partPrice.quantity === Number(newQuantity),
      );
      expect(dbPartPrice).toMatchObject({ clientId: client.id, price: newPrice });
      const rowNewPartPrice = getTableRowByTestId(tablePartPrices, dbPartPrice!.id);
      await expect(rowNewPartPrice.getByRole("cell", { exact: true, name: newQuantity })).toBeVisible();
      await expect(rowNewPartPrice.getByRole("cell", { exact: true, name: formatPrice(newPrice) })).toBeVisible();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
    }
  }
});

test("keep the unsaved changes of a price while its client changes, but reload it when the price changes", async ({
  page,
  db,
}) => {
  const partPrice = mockPartPrices.find(
    (mockPartPrice) =>
      activeParts.some((part) => part.id === mockPartPrice.partId) &&
      activeClients.some((client) => client.id === mockPartPrice.clientId),
  )!;
  const unsavedPrice = "3.21";
  const syncedPrice = "4.56";
  const syncedClientName = "Synced Client Name";

  await page.goto(`/part/${partPrice.partId}?tab=prices`);
  await assertFormLoaded(formPart);
  await getTableRowByTestId(tablePartPrices, partPrice.id).getByTestId("button-edit").click();
  await expect(dialogEditPartPrice).toBeVisible();
  await assertFormLoaded(dialogEditPartPrice);

  const inputPrice = getFormInputByLabel(dialogEditPartPrice, PRICE_LABEL, InputElementType.Number);
  const inputQuantity = getFormInputByLabel(dialogEditPartPrice, QUANTITY_LABEL, InputElementType.Number);
  const comboboxClient = dialogEditPartPrice.getByTestId("combobox-client");
  await inputPrice.clear();
  await inputPrice.pressSequentially(unsavedPrice);

  await db.update(dbTableClient).set({ name: syncedClientName }).where(eq(dbTableClient.id, partPrice.clientId!));
  await expect(comboboxClient).toContainText(syncedClientName);
  await expect(inputPrice).toHaveValue(formatPrice(unsavedPrice, { replaceNBSP: true }));

  await db.update(dbTablePartPrice).set({ price: syncedPrice }).where(eq(dbTablePartPrice.id, partPrice.id));
  await expect(inputPrice).toHaveValue(formatPrice(syncedPrice, { replaceNBSP: true }));
  await expect(inputQuantity).toHaveValue(String(partPrice.quantity));
  await assertComboboxValue(comboboxClient, String(partPrice.clientId));
});

test("remove every material of every part and add the compatible ones back", async ({ page, db, toasts }) => {
  for (const part of activeParts) {
    const assignedMaterialIds = new Set(getMockPartMaterials(part).map((material) => material.id));
    const assertPartMaterials = async () => {
      await assertTableRowCount(tablePartMaterials, assignedMaterialIds.size);
      for (const materialId of assignedMaterialIds) {
        const material = mockMaterials.find((mockMaterial) => mockMaterial.id === materialId)!;
        const row = getTableRowByTestId(tablePartMaterials, materialId);
        await expect(row.getByTestId("rawMaterial")).toHaveText(
          mockRawMaterials.find((rawMaterial) => rawMaterial.id === material.rawMaterialId)!.name,
        );
        await expect(row.getByTestId("shape")).toHaveText(
          mockShapes.find((shape) => shape.id === material.shapeId)!.name,
        );
        await expect(row.getByTestId("width")).toHaveText(`${material.width} mm`);
      }
      // A removed Material is only offered again if it is still compatible with the Artículo
      const compatibleMaterials = getCompatibleMaterials(part, assignedMaterialIds);
      await assertTableRowCount(tableCompatiblePartMaterials, compatibleMaterials.length);
      for (const material of compatibleMaterials) {
        await expect(getTableRowByTestId(tableCompatiblePartMaterials, material.id)).toBeVisible();
      }
      expect(
        (await db.query.dbTablePartMaterial.findMany({ where: { partId: part.id } }))
          .map((partMaterial) => partMaterial.materialId)
          .sort((a, b) => a - b),
      ).toEqual([...assignedMaterialIds].sort((a, b) => a - b));
    };

    await page.goto(`/part/${part.id}?tab=materials`);
    await assertFormLoaded(formPart);
    await assertPartMaterials();

    for (const material of getMockPartMaterials(part)) {
      await openAndConfirmAlertDialog(
        page,
        getTableRowByTestId(tablePartMaterials, material.id).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      assignedMaterialIds.delete(material.id);
      await assertPartMaterials();
    }

    for (const material of getCompatibleMaterials(part, assignedMaterialIds)) {
      await getTableRowByTestId(tableCompatiblePartMaterials, material.id).getByTestId("button-success").click();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      assignedMaterialIds.add(material.id);
      await assertPartMaterials();
    }
  }
});

test("list every material of a part at once, without paging", async ({ page, db }) => {
  const part = activeParts[0];
  const [shape] = await db.insert(dbTableShape).values({ name: "Many materials shape" }).returning();
  const [rawMaterial] = await db.insert(dbTableRawMaterial).values({ name: "Many materials raw material" }).returning();
  // More than the default page of 10 rows of a table
  const materials = await db
    .insert(dbTableMaterial)
    .values(
      Array.from({ length: 11 }, (_, index) => ({
        rawMaterialId: rawMaterial.id,
        shapeId: shape.id,
        width: String(index + 1),
      })),
    )
    .returning();
  await db
    .insert(dbTablePartMaterial)
    .values(materials.map((material) => ({ materialId: material.id, partId: part.id })));
  const partMaterialsCount = getMockPartMaterials(part).length + materials.length;

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);
  await assertTableRowCount(tablePartMaterials, partMaterialsCount);
  await expect(getTableRows(tablePartMaterials)).toHaveCount(partMaterialsCount);
  await expect(getTablePagerButton(tablePartMaterials, NEXT_PAGE_LABEL)).not.toBeVisible();
});

test("dismissing the delete dialog of a material keeps it in the part", async ({ page, db }) => {
  const part = activeParts.find((activePart) => getMockPartMaterials(activePart).length > 0)!;
  const partMaterials = getMockPartMaterials(part);
  const material = partMaterials[0];

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);
  await getTableRowByTestId(tablePartMaterials, material.id).getByTestId("button-delete").click();
  const dialog = page.getByTestId("dialog-delete-model-content");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await assertTableRowCount(tablePartMaterials, partMaterials.length);
  await expect(getTableRowByTestId(tablePartMaterials, material.id)).toBeVisible();
  expect(
    await db.query.dbTablePartMaterial.findFirst({ where: { materialId: material.id, partId: part.id } }),
  ).toBeDefined();
});

test("add stock to every part without an existing part stock", async ({ page, db }) => {
  // Productions also count as stock, and every Artículo of the mock data has some
  await db.delete(dbTablePartProduction).where(
    inArray(
      dbTablePartProduction.productionOrderId,
      mockProductionOrders
        .filter((productionOrder) => !mockPartStock.some((partStock) => partStock.partId === productionOrder.partId))
        .map((productionOrder) => productionOrder.id),
    ),
  );

  const partsWithoutStock = [];
  for (const part of activeParts) {
    if ((await getLatestPartStockTransactionByPartId(part.id)) === undefined) {
      partsWithoutStock.push(part);
    }
  }
  expect(partsWithoutStock.length, "Wrong test set up: Some Artículo should have no stock").toBeGreaterThan(0);

  const dialogPartStock = page.getByTestId("dialog-part-stock");
  for (const [index, part] of partsWithoutStock.entries()) {
    const newQuantity = String(1234 + index);

    await page.goto("/part");
    const partRow = getTableRowByTestId(tablePart, part.id);
    await expect(partRow.getByTestId("partStockQuantity")).toHaveText("");

    await partRow.getByTestId("dialog-part-stock-trigger").click();
    await expect(dialogPartStock).toBeVisible();
    await assertFormLoaded(dialogPartStock);

    const inputQuantity = getFormInputByLabel(
      dialogPartStock,
      PART_STOCK_UPDATE_QUANTITY_LABEL,
      InputElementType.Number,
    );
    await expect(inputQuantity).toHaveValue("");
    await inputQuantity.pressSequentially(newQuantity);
    await expect(inputQuantity).toHaveValue(newQuantity);

    const buttonSubmit = dialogPartStock.getByTestId("button-submit");
    await expect(buttonSubmit).toBeEnabled();
    await buttonSubmit.click();

    await expect(dialogPartStock).not.toBeVisible();
    await expect(partRow.getByTestId("partStockQuantity")).toHaveText(newQuantity);

    const newPartStock = await getLatestPartStockTransactionByPartId(part.id);
    expect(newPartStock?.initialQuantity).toBeUndefined();
    expect(newPartStock?.finalQuantity).toBe(Number(newQuantity));
  }
});

test(
  "list, create, edit and delete the features of every part",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    const tablePartFeatures = formPart.getByTestId("table-part-features");
    const dialogCreatePartFeature = page.getByTestId("dialog-create-part-feature");

    for (const part of activeParts) {
      const partFeatures = mockPartFeatures.filter((partFeature) => partFeature.partId === part.id);

      await page.goto(`/part/${part.id}?tab=blueprints`);
      await assertFormLoaded(formPart);

      await assertTableRowCount(tablePartFeatures, partFeatures.length);
      for (const partFeature of partFeatures) {
        await expect(
          getEditableCellById(getTableRowByTestId(tablePartFeatures, partFeature.id), "feature"),
        ).toHaveValue(partFeature.feature);
      }

      const newFeature = `Característica nueva de ${part.id}`;
      await formPart.getByTestId("button-create-part-feature").click();
      await expect(dialogCreatePartFeature).toBeVisible();
      await getFormInputByLabel(dialogCreatePartFeature, PART_FEATURE_LABEL).fill(newFeature);
      await dialogCreatePartFeature.getByTestId("button-submit").click();
      await expect(dialogCreatePartFeature).toBeHidden();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await clearToasts(page);
      expect((await db.query.dbTablePartFeature.findFirst({ where: { feature: newFeature } }))?.partId).toBe(part.id);
      await assertTableRowCount(tablePartFeatures, partFeatures.length + 1);

      for (const partFeature of partFeatures) {
        const updatedFeature = `Característica editada ${partFeature.id}`;
        const inputFeature = getEditableCellById(getTableRowByTestId(tablePartFeatures, partFeature.id), "feature");
        await inputFeature.fill(updatedFeature);
        await inputFeature.blur();
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Success);
        await clearToasts(page);
        expect((await db.query.dbTablePartFeature.findFirst({ where: { id: partFeature.id } }))?.feature).toBe(
          updatedFeature,
        );
      }

      // A feature that has quality checks keeps them, so it cannot be deleted
      const checkedFeatures = partFeatures.filter((partFeature) =>
        mockQualityChecks.some((check) => check.partFeatureId === partFeature.id),
      );
      let remainingFeatures = partFeatures.length + 1;
      for (const partFeature of partFeatures) {
        const isChecked = checkedFeatures.includes(partFeature);
        await clearToasts(page);
        await openAndConfirmAlertDialog(
          page,
          getTableRowByTestId(tablePartFeatures, partFeature.id).getByTestId("button-delete"),
          "dialog-delete-model-content",
        );

        if (isChecked) {
          await expectSingleToast(page, "La Característica tiene Controles de calidad y no se puede eliminar");
          await expect(getTableRowByTestId(tablePartFeatures, partFeature.id)).toHaveCount(1);
          expect(await db.query.dbTablePartFeature.findFirst({ where: { id: partFeature.id } })).toBeDefined();
        } else {
          remainingFeatures--;
          await expect(getTableRowByTestId(tablePartFeatures, partFeature.id)).toHaveCount(0);
          expect(await db.query.dbTablePartFeature.findFirst({ where: { id: partFeature.id } })).toBeUndefined();
        }
        await assertTableRowCount(tablePartFeatures, remainingFeatures);
      }

      expect(
        await db.query.dbTablePartFeature.findMany({ where: { partId: part.id }, orderBy: { id: "asc" } }),
      ).toEqual([
        ...checkedFeatures.map((partFeature) => expect.objectContaining({ id: partFeature.id })),
        expect.objectContaining({ feature: newFeature }),
      ]);
    }
  },
);

test(
  "a part cannot have two features with the same name, but different parts can",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const tablePartFeatures = formPart.getByTestId("table-part-features");
    const dialogCreatePartFeature = page.getByTestId("dialog-create-part-feature");
    const duplicatedErrorMessage = "El Artículo ya tiene una Característica con ese nombre";
    const getPartFeatures = (partId: number) => mockPartFeatures.filter((partFeature) => partFeature.partId === partId);
    const part = activeParts.find((activePart) => getPartFeatures(activePart.id).length >= 2)!;
    expect(part, "Wrong test set up: Some part should have at least two features").toBeDefined();
    const otherPart = activeParts.find((activePart) => activePart.id !== part.id)!;
    const [firstFeature, secondFeature] = getPartFeatures(part.id);
    const createPartFeature = async (feature: string) => {
      await formPart.getByTestId("button-create-part-feature").click();
      await getFormInputByLabel(dialogCreatePartFeature, PART_FEATURE_LABEL).fill(feature);
      await dialogCreatePartFeature.getByTestId("button-submit").click();
    };

    await page.goto(`/part/${part.id}?tab=blueprints`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(tablePartFeatures, getPartFeatures(part.id).length);

    await createPartFeature(firstFeature.feature);
    await expectSingleToast(page, duplicatedErrorMessage);
    await expect(dialogCreatePartFeature).toBeVisible();
    await dialogCreatePartFeature.getByTestId("button-close").click();
    await expect(dialogCreatePartFeature).toBeHidden();
    await assertTableRowCount(tablePartFeatures, getPartFeatures(part.id).length);

    const inputSecondFeature = getEditableCellById(getTableRowByTestId(tablePartFeatures, secondFeature.id), "feature");
    await inputSecondFeature.fill(firstFeature.feature);
    await inputSecondFeature.blur();
    await expectSingleToast(page, duplicatedErrorMessage);
    expect((await db.query.dbTablePartFeature.findFirst({ where: { id: secondFeature.id } }))?.feature).toBe(
      secondFeature.feature,
    );

    await expectUniqueViolation(
      db.insert(dbTablePartFeature).values({ feature: firstFeature.feature, partId: part.id }),
      PART_FEATURE_CONSTRAINT,
    );

    // Another part can use the same name
    await page.goto(`/part/${otherPart.id}?tab=blueprints`);
    await assertFormLoaded(formPart);
    await createPartFeature(firstFeature.feature);
    await expect(dialogCreatePartFeature).toBeHidden();
    await expectSingleToast(page);
    expect(await db.query.dbTablePartFeature.findMany({ where: { feature: firstFeature.feature } })).toHaveLength(2);
  },
);

test("a feature can have a range of up to 2 decimals whose minimum cannot exceed its maximum", async ({ page, db }) => {
  const tablePartFeatures = formPart.getByTestId("table-part-features");
  const dialogCreatePartFeature = page.getByTestId("dialog-create-part-feature");
  const inputMinValue = dialogCreatePartFeature.getByTestId("input-min-value");
  const inputMaxValue = dialogCreatePartFeature.getByTestId("input-max-value");
  const buttonSubmit = dialogCreatePartFeature.getByTestId("button-submit");
  const part = activeParts[0];
  const feature = "Diámetro con tolerancia";

  await page.goto(`/part/${part.id}?tab=blueprints`);
  await assertFormLoaded(formPart);
  await formPart.getByTestId("button-create-part-feature").click();
  await getFormInputByLabel(dialogCreatePartFeature, PART_FEATURE_LABEL).fill(feature);
  await inputMinValue.fill("5,5");
  await inputMaxValue.fill("5");
  await expect(buttonSubmit).toBeDisabled();

  await inputMaxValue.fill("5,75");
  await expect(buttonSubmit).toBeEnabled();
  await buttonSubmit.click();
  await expect(dialogCreatePartFeature).toBeHidden();
  await expectSingleToast(page);
  const created = (await db.query.dbTablePartFeature.findFirst({ where: { feature, partId: part.id } }))!;
  expect([created.minValue, created.maxValue]).toEqual(["5.5", "5.75"]);

  const row = getTableRowByTestId(tablePartFeatures, created.id);
  await expect(getEditableCellById(row, "minValue")).toHaveValue("5,5");
  const inputMax = getEditableCellById(row, "maxValue");
  await inputMax.fill("");
  await inputMax.blur();
  await expectSingleToast(page);
  expect((await db.query.dbTablePartFeature.findFirst({ where: { id: created.id } }))?.maxValue).toBeNull();
});

test(
  "the range of a feature that has quality checks cannot change but its name can",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    const checkedFeature = mockPartFeatures.find(
      ({ id, maxValue, minValue }) =>
        minValue !== null && maxValue !== null && mockQualityChecks.some(({ partFeatureId }) => partFeatureId === id),
    )!;
    expect(checkedFeature, "Wrong test set up: Some ranged Característica should have checks").toBeDefined();
    const rangeChangedMessage = "La Característica tiene Controles de calidad y no se puede cambiar su rango";
    const renamedFeature = `${checkedFeature.feature} renombrada`;

    await page.goto(`/part/${checkedFeature.partId}?tab=blueprints`);
    await assertFormLoaded(formPart);
    const row = getTableRowByTestId(formPart.getByTestId("table-part-features"), checkedFeature.id);
    const inputMin = getEditableCellById(row, "minValue");
    const inputMax = getEditableCellById(row, "maxValue");

    for (const [input, value] of [
      [inputMin, "11"],
      [inputMax, ""],
    ] as const) {
      await input.fill(value);
      await input.blur();
      await expectSingleToast(page, rangeChangedMessage);
      await clearToasts(page);
      await expect(inputMin).toHaveValue(checkedFeature.minValue!.replace(".", ","));
      await expect(inputMax).toHaveValue(checkedFeature.maxValue!.replace(".", ","));
      const unchanged = (await db.query.dbTablePartFeature.findFirst({ where: { id: checkedFeature.id } }))!;
      expect([unchanged.minValue, unchanged.maxValue]).toEqual([checkedFeature.minValue, checkedFeature.maxValue]);
    }

    const inputFeature = getEditableCellById(row, "feature");
    await inputFeature.fill(renamedFeature);
    await inputFeature.blur();
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    const renamed = (await db.query.dbTablePartFeature.findFirst({ where: { id: checkedFeature.id } }))!;
    expect([renamed.feature, renamed.minValue, renamed.maxValue]).toEqual([
      renamedFeature,
      checkedFeature.minValue,
      checkedFeature.maxValue,
    ]);

    const uncheckedFeature = mockPartFeatures.find(
      ({ id, maxValue, minValue, partId }) =>
        partId === checkedFeature.partId &&
        (minValue !== null || maxValue !== null) &&
        !mockQualityChecks.some(({ partFeatureId }) => partFeatureId === id),
    )!;
    expect(uncheckedFeature, "Wrong test set up: Some ranged Característica of the part has no checks").toBeDefined();
    const inputUncheckedMax = getEditableCellById(
      getTableRowByTestId(formPart.getByTestId("table-part-features"), uncheckedFeature.id),
      "maxValue",
    );
    await clearToasts(page);
    await inputUncheckedMax.fill("-0,25");
    await inputUncheckedMax.blur();
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    const updated = (await db.query.dbTablePartFeature.findFirst({ where: { id: uncheckedFeature.id } }))!;
    expect(Number(updated.maxValue)).toBe(-0.25);
    expect(updated.minValue).toBe(uncheckedFeature.minValue);
  },
);

test(
  "upload, rename and delete the blueprints of every part",
  { annotation: [TestAnnotations.ResetBlueprints, TestAnnotations.NonEmptyErrorsLogFile] },
  async ({ page, toasts }) => {
    const newBlueprintFilePath = path.join(MOCK_DATA_PATH, "sample.pdf");
    const dialogCreateBlueprint = page.getByTestId("dialog-create-blueprint");
    const dialogEditBlueprint = page.getByTestId("dialog-edit-blueprint");

    for (const part of activeParts) {
      const mockPartBlueprints = mockBlueprints.filter((blueprint) => blueprint.partId === part.id);
      expect(await getBlueprintsByPartId(part.id)).toHaveLength(mockPartBlueprints.length);

      await page.goto(`/part/${part.id}?tab=blueprints`);
      await assertFormLoaded(formPart);

      // Its folder is created if it has none yet
      await formPart.getByTestId("button-add-blueprint").click();
      await expect(dialogCreateBlueprint).toBeVisible();
      const inputFilename = getFormInputByLabel(dialogCreateBlueprint, NAME_LABEL);
      await expect(inputFilename).toHaveValue("");
      await setInputFiles(
        page,
        getFormInputByLabel(dialogCreateBlueprint, BLUEPRINT_LABEL, InputElementType.File),
        newBlueprintFilePath,
      );
      await expect(inputFilename).toHaveValue(path.parse(newBlueprintFilePath).name);
      const newBlueprintName = `NewBlueprint-${part.id}`;
      await inputFilename.fill(newBlueprintName);
      await dialogCreateBlueprint.getByTestId("button-submit").click();
      await expect(dialogCreateBlueprint).not.toBeVisible();

      const dbBlueprints = await getBlueprintsByPartId(part.id);
      expect(dbBlueprints).toHaveLength(mockPartBlueprints.length + 1);
      const newDbBlueprint = dbBlueprints.find(
        (blueprint) => !mockPartBlueprints.some((mockBlueprint) => mockBlueprint.id === blueprint.id),
      );
      expect(newDbBlueprint).toMatchObject({ fileName: newBlueprintName, partId: part.id });
      expect(newDbBlueprint!.createdAt).toBeInstanceOf(Date);
      expect(
        await getBlueprintPath({ checkIfFileExists: true, fileName: newBlueprintName, partId: part.id }),
      ).toBeTruthy();
      await expect(formPart.getByTestId(`card-blueprint-${newDbBlueprint!.id}`)).toBeVisible();

      for (const blueprint of dbBlueprints) {
        const renamedBlueprintName = `Renamed-${blueprint.id}`;
        const cardBlueprint = formPart.getByTestId(`card-blueprint-${blueprint.id}`);
        await cardBlueprint.getByTestId("button-edit").click();
        await expect(dialogEditBlueprint).toBeVisible();

        const inputEditFilename = getFormInputByLabel(dialogEditBlueprint, NAME_LABEL);
        await expect(inputEditFilename).toHaveValue(blueprint.fileName);
        await inputEditFilename.fill(`${renamedBlueprintName}.pdf`);
        await dialogEditBlueprint.getByTestId("button-submit").click();
        await expect(dialogEditBlueprint).not.toBeVisible();

        expect(await getBlueprintById(blueprint.id)).toMatchObject({ fileName: renamedBlueprintName, partId: part.id });
        expect(
          await getBlueprintPath({ checkIfFileExists: true, fileName: renamedBlueprintName, partId: part.id }),
        ).toBeTruthy();
      }

      // A Plano cannot take the name of another one, which would replace its file
      await formPart.getByTestId("button-add-blueprint").click();
      await expect(dialogCreateBlueprint).toBeVisible();
      await setInputFiles(
        page,
        getFormInputByLabel(dialogCreateBlueprint, BLUEPRINT_LABEL, InputElementType.File),
        newBlueprintFilePath,
      );
      await getFormInputByLabel(dialogCreateBlueprint, NAME_LABEL).fill(`Renamed-${dbBlueprints[0].id}`);
      await dialogCreateBlueprint.getByTestId("button-submit").click();
      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await clearToasts(page);
      await dialogCreateBlueprint.getByTestId("button-close").click();
      await expect(dialogCreateBlueprint).not.toBeVisible();
      expect(await getBlueprintsByPartId(part.id)).toHaveLength(dbBlueprints.length);

      for (const blueprint of dbBlueprints) {
        const fileName = `Renamed-${blueprint.id}`;
        const blueprintPath = await getBlueprintPath({ checkIfFileExists: true, fileName, partId: part.id });
        expect(blueprintPath).toBeTruthy();
        const cardBlueprint = formPart.getByTestId(`card-blueprint-${blueprint.id}`);

        await openAndConfirmAlertDialog(
          page,
          cardBlueprint.getByTestId("button-delete"),
          "dialog-delete-model-content",
        );

        await expect(cardBlueprint).not.toBeVisible();
        expect(await getBlueprintById(blueprint.id)).toBeUndefined();
        expect(
          await getBlueprintPath({ checkIfFileExists: true, fileName, logErrors: false, partId: part.id }),
        ).toBeNull();
        expectArchivedBlueprintFile(blueprintPath!, fileName);
      }
      expect(await getBlueprintsByPartId(part.id)).toHaveLength(0);
    }
  },
);

test(
  "delete every part when confirmed and restore it",
  { annotation: TestAnnotations.ResetBlueprints },
  async ({ page, toasts }) => {
    expect(
      activeParts.some((part) => mockBlueprints.filter((blueprint) => blueprint.partId === part.id).length > 1),
      "Wrong test set up: Some Artículo should have several Planos",
    ).toBe(true);
    expect(
      activeParts.some((part) => getMockActivePartSetsOfPart(part.id).length > 1),
      "Wrong test set up: Some Artículo should be a component of several active Conjuntos",
    ).toBe(true);
    expect(
      activeParts.some(
        (part) =>
          getMockActivePartSetsOfPart(part.id).length === 0 &&
          mockPartComponents.some((partComponent) => partComponent.componentPartId === part.id),
      ),
      "Wrong test set up: Some Artículo should only be a component of deleted Conjuntos",
    ).toBe(true);

    for (const part of activeParts) {
      const tableRowPart = getTableRowByTestId(tablePart, part.id);
      const blueprints = await getBlueprintsByPartId(part.id);
      const blueprintPaths = await Promise.all(
        blueprints.map(async (blueprint) =>
          getBlueprintPath({ checkIfFileExists: true, fileName: blueprint.fileName, partId: part.id }),
        ),
      );
      expect(blueprintPaths).not.toContain(null);

      // A component of an active Conjunto cannot be deleted until it is taken out of it
      const partSets = getMockActivePartSetsOfPart(part.id);
      if (partSets.length > 0) {
        await workflowDeletePart(page, part.id, getPartInActiveSetsErrorMessage(partSets));
        await workflowRemovePartFromActiveSets(page, part.id);
      }

      await workflowDeletePart(page, part.id);
      await assertTableRowCount(tablePart, activeParts.length - 1);

      // Its Planos are deleted, but their files are kept, renamed as deleted
      expect(await getBlueprintsByPartId(part.id)).toHaveLength(0);
      for (const [index, blueprint] of blueprints.entries()) {
        expectArchivedBlueprintFile(blueprintPaths[index]!, blueprint.fileName);
      }

      // Deleted Artículos are only listed when asked for, and restoring one does not bring its Planos back
      await clearToasts(page);
      await tablePart.getByTestId("popover-part-filters").getByTestId("popover-trigger").click();
      const checkboxDeletedParts = getPopoverContent(page).getByTestId("checkbox-filter-deleted-parts");
      await expect(checkboxDeletedParts).not.toBeChecked();
      await checkboxDeletedParts.click();
      await expect(tableRowPart).toBeVisible();
      // Changing the filter does not close the popover
      await expect(getPopoverContent(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(getPopoverContent(page)).toBeHidden();

      await expect(tableRowPart.getByTestId("button-delete")).toHaveCount(0);
      await openAndConfirmAlertDialog(page, tableRowPart.getByTestId("button-restore"), "dialog-restore-model-content");

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await expect(tableRowPart.getByTestId("button-restore")).toHaveCount(0);
      await expect(tableRowPart.getByTestId("button-delete")).toBeVisible();
      expect((await getPartById(part.id))?.deletedAt).toBeNull();
      expect(await getBlueprintsByPartId(part.id)).toHaveLength(0);
    }
  },
);

for (const part of activeParts) {
  test(`the deleted part ${part.id} keeps its production orders and its history`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const productionOrders = mockProductionOrders.filter(
      (productionOrder) => productionOrder.partId === part.id && productionOrder.deletedAt === null,
    );
    const productionOrderStatuses = await Promise.all(
      productionOrders.map(async (productionOrder) => dbGetProductionOrderStatus(productionOrder)),
    );
    const partReferences = mockPartReferences.filter((partReference) => partReference.partId === part.id);
    const getPartReference = (partReferenceId: number | null) =>
      partReferences.find((partReference) => partReference.id === partReferenceId);
    const sellOrderLines = mockSellOrderLines.filter(
      (line) =>
        getPartReference(line.partReferenceId) !== undefined &&
        line.deletedAt === null &&
        getMockSellOrderById(line.sellOrderId)?.deletedAt === null,
    );
    const pendingDeliveryNoteLines = mockDeliveryNoteLines.filter(
      (line) =>
        getPartReference(line.partReferenceId) !== undefined &&
        getMockDeliveryNoteById(line.deliveryNoteId)?.invoiceId === null,
    );

    await workflowRemovePartFromActiveSets(page, part.id);
    await workflowDeletePart(page, part.id);

    // Its Órdenes de producción keep going
    await gotoProductionOrdersWithStatuses(page, Object.values(ProductionOrderStatus));
    for (const [index, productionOrder] of productionOrders.entries()) {
      expect(await dbGetProductionOrderStatus((await getProductionOrderById(productionOrder.id))!)).toBe(
        productionOrderStatuses[index],
      );
      const rowProductionOrder = getTableRowByTestId(page.getByTestId("table-production-order"), productionOrder.id);
      await expect(rowProductionOrder.getByTestId("status")).toHaveText(
        translatedEnums.ProductionOrderStatus[productionOrderStatuses[index]],
      );
      await expect(rowProductionOrder).toContainText(part.description);
    }

    for (const machine of mockMachines.filter((mockMachine) =>
      productionOrders.some((productionOrder) => productionOrder.id === mockMachine.activeProductionOrderId),
    )) {
      await using machineContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
      await machineContext.addCookies([AppContextStorage.testCookie(baseURL!, UserMode.Machine, machine.id)]);
      const machinePage = await machineContext.newPage();
      await machinePage.goto("/production");
      await machinePage.waitForSelector("body[data-hydrated]");
      await expect(
        machinePage.getByText(`Orden de producción ${machine.activeProductionOrderId}`, { exact: true }),
      ).toBeVisible();
    }

    // The Pedidos de venta and Albaranes that used it keep showing it
    const formSellOrder = page.getByTestId("form-sell-order");
    for (const sellOrderId of new Set(sellOrderLines.map((line) => line.sellOrderId))) {
      await page.goto(`/sell-order/${sellOrderId}`);
      await assertFormLoaded(formSellOrder);
      for (const sellOrderLine of sellOrderLines.filter((line) => line.sellOrderId === sellOrderId)) {
        const rowSellOrderLine = getTableRowByTestId(
          formSellOrder.getByTestId("table-sell-order-line"),
          sellOrderLine.id,
        );
        await expect(rowSellOrderLine.getByTestId("part")).toContainText(
          getPartReference(sellOrderLine.partReferenceId)!.reference,
        );
        await expect(rowSellOrderLine.getByTestId("description")).toHaveText(part.description);
      }
    }

    for (const deliveryNoteId of new Set(pendingDeliveryNoteLines.map((line) => line.deliveryNoteId))) {
      const dialogCreateEditDeliveryNote = await workflowOpenEditDeliveryNote(page, deliveryNoteId);
      for (const deliveryNoteLine of pendingDeliveryNoteLines.filter(
        (line) => line.deliveryNoteId === deliveryNoteId,
      )) {
        await expect(
          getTableRowByTestId(
            dialogCreateEditDeliveryNote.getByTestId("table-delivery-note-line"),
            deliveryNoteLine.id,
          ).getByTestId("partReference"),
        ).toHaveText(getPartReference(deliveryNoteLine.partReferenceId)!.reference);
      }
    }

    // ...but it can no longer be picked
    for (const client of activeClients) {
      const sellOrder = getMockEditableSellOrder(client.id);
      if (sellOrder === undefined) {
        continue;
      }
      const tablePickerPart = await workflowOpenSellOrderLinePartPicker(page, sellOrder.id);
      await expect(getTableRowByTestId(tablePickerPart, part.id)).toHaveCount(0);
      await assertTableRowCount(
        tablePickerPart,
        getMockClientParts({ clientId: client.id, includePartReferenceNullClientId: true }).filter(
          (clientPart) => clientPart.id !== part.id,
        ).length,
      );
    }

    // Its page shows it read only until it is restored
    await page.goto(`/part/${part.id}`);
    await assertFormLoaded(formPart);
    await expect(formPart.getByTestId("badge-part-deleted")).toBeVisible();
    await expect(formPart.getByTestId("button-submit")).toHaveCount(0);

    await openAndConfirmAlertDialog(page, formPart.getByTestId("button-restore"), "dialog-restore-model-content");

    await expect(formPart.getByTestId("badge-part-deleted")).not.toBeVisible();
    await expect(formPart.getByTestId("button-submit")).toBeVisible();
    expect((await getPartById(part.id))?.deletedAt).toBeNull();
  });
}

for (const partReference of activePartReferences) {
  test(`the deleted part reference ${partReference.id} is not suggested, its sell order lines keep it and it can be restored`, async ({
    page,
  }) => {
    const sellOrderLines = mockSellOrderLines.filter(
      (line) => line.partReferenceId === partReference.id && getMockSellOrderById(line.sellOrderId)?.deletedAt === null,
    );
    const rowPartReference = getTableRowByTestId(tablePartReferences, partReference.id);

    async function expectSuggested(isSuggested: boolean) {
      for (const client of activeClients.filter(
        (activeClient) => partReference.clientId === null || partReference.clientId === activeClient.id,
      )) {
        const sellOrder = getMockEditableSellOrder(client.id);
        if (sellOrder === undefined) {
          continue;
        }
        const isPartOffered =
          isSuggested ||
          getMockPartReferences({
            clientId: client.id,
            includeNullClientId: true,
            partId: partReference.partId,
          }).some((otherPartReference) => otherPartReference.id !== partReference.id);

        const tablePickerPart = await workflowOpenSellOrderLinePartPicker(page, sellOrder.id);
        const rowPickerPart = getTableRowByTestId(tablePickerPart, partReference.partId);
        await expect(rowPickerPart).toHaveCount(isPartOffered ? 1 : 0);
        if (isPartOffered) {
          await (isSuggested
            ? expect(rowPickerPart.getByTestId("reference")).toContainText(partReference.reference)
            : expect(rowPickerPart.getByTestId("reference")).not.toContainText(partReference.reference));
        }
      }
    }

    await page.goto(`/part/${partReference.partId}`);
    await assertFormLoaded(formPart);
    await expect(rowPartReference.getByTestId("tooltip-deleted")).toHaveCount(0);
    await openAndConfirmAlertDialog(page, rowPartReference.getByTestId("button-delete"), "dialog-delete-model-content");

    // The form keeps listing it, marked as deleted, so it can be restored
    await expect(rowPartReference.getByTestId("tooltip-deleted")).toBeVisible();
    await rowPartReference.getByTestId("tooltip-deleted").hover();
    await expect(page.getByText(PART_REFERENCE_DELETED_TOOLTIP_MESSAGE)).toBeVisible();
    await expect(rowPartReference.getByTestId("button-delete")).toHaveCount(0);
    await expect(rowPartReference.getByTestId("button-edit")).toHaveCount(0);
    await assertTableRowCount(tablePartReferences, getFormPartReferences(partReference.partId).length);
    expect((await getPartReferenceById(partReference.id))?.deletedAt).not.toBeNull();

    await page.goto("/part");
    await expect(getTableRowByTestId(tablePart, partReference.partId).getByTestId("reference")).not.toContainText(
      partReference.reference,
    );

    // The Pedidos de venta that used it keep showing it
    const formSellOrder = page.getByTestId("form-sell-order");
    for (const sellOrderLine of sellOrderLines) {
      await page.goto(`/sell-order/${sellOrderLine.sellOrderId}`);
      await assertFormLoaded(formSellOrder);
      await expect(
        getTableRowByTestId(formSellOrder.getByTestId("table-sell-order-line"), sellOrderLine.id).getByTestId("part"),
      ).toContainText(partReference.reference);
    }

    // ...but it can no longer be picked, so the Artículo is only offered through its other Referencias
    await expectSuggested(false);

    await page.goto(`/part/${partReference.partId}`);
    await assertFormLoaded(formPart);
    await openAndConfirmAlertDialog(
      page,
      rowPartReference.getByTestId("button-restore"),
      "dialog-restore-model-content",
    );
    await expect(rowPartReference.getByTestId("tooltip-deleted")).toHaveCount(0);
    await expect(rowPartReference.getByTestId("button-restore")).toHaveCount(0);
    await expect(rowPartReference.getByTestId("button-delete")).toBeVisible();
    await assertTableRowCount(tablePartReferences, getFormPartReferences(partReference.partId).length);
    expect((await getPartReferenceById(partReference.id))?.deletedAt).toBeNull();

    await page.goto("/part");
    await expect(getTableRowByTestId(tablePart, partReference.partId).getByTestId("reference")).toContainText(
      partReference.reference,
    );
    await expectSuggested(true);
  });
}

test("update every part reference", async ({ page, db }) => {
  for (const partReference of activePartReferences) {
    const newClient = activeClients.find((client) => client.id !== partReference.clientId)!;
    const newReference = `UPDATED-REF-${partReference.id}`;
    const newDescription = `Updated Client Description ${partReference.id}`;

    expect(await getPartReferenceById(partReference.id)).toMatchObject({
      clientDescription: partReference.clientDescription,
      clientId: partReference.clientId,
      partId: partReference.partId,
      reference: partReference.reference,
    });

    await page.goto(`/part/${partReference.partId}`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(tablePartReferences, getFormPartReferences(partReference.partId).length);

    const rowPartReference = getTableRowByTestId(tablePartReferences, partReference.id);
    await expect(rowPartReference).toContainText(partReference.reference);
    await rowPartReference.getByTestId("button-edit").click();
    await expect(dialogCreateEditPartReference).toBeVisible();
    await assertFormLoaded(dialogCreateEditPartReference);

    await getFormInputByLabel(dialogCreateEditPartReference, REFERENCE_LABEL).fill(newReference);
    await getFormInputByLabel(dialogCreateEditPartReference, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill(newDescription);
    const clientCombobox = dialogCreateEditPartReference.getByTestId("combobox-client");
    await openCombobox(clientCombobox);
    await clickInComboboxOption(page, newClient.name);
    await assertComboboxValue(clientCombobox, String(newClient.id));

    await dialogCreateEditPartReference.getByTestId("button-submit").click();
    await expect(dialogCreateEditPartReference).not.toBeVisible();

    await expect(rowPartReference).toContainText(newReference);
    await expect(rowPartReference).toContainText(newDescription);
    await expect(rowPartReference).toContainText(newClient.name);
    await expect(filterByExactText(getTableRows(tablePartReferences), partReference.reference)).toHaveCount(0);

    expect(await db.query.dbTablePartReference.findFirst({ where: { id: partReference.id } })).toMatchObject({
      clientDescription: newDescription,
      clientId: newClient.id,
      partId: partReference.partId,
      reference: newReference,
    });
  }
});

test(
  "create a part reference for every part, unique for each client",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db, toasts }) => {
    expect(activeClients.length, "Wrong test set up: Some Clientes should be active").toBeGreaterThan(1);
    const [newClient, ...otherClients] = activeClients;
    const tablePartReferencesRows = getTableRows(tablePartReferences);
    const clientCombobox = dialogCreateEditPartReference.getByTestId("combobox-client");

    const submitPartReference = async (reference: string, clientName: string, description = "Client Description") => {
      await formPart.getByTestId("button-add-reference").click();
      await expect(dialogCreateEditPartReference).toBeVisible();
      await getFormInputByLabel(dialogCreateEditPartReference, REFERENCE_LABEL).fill(reference);
      await getFormInputByLabel(dialogCreateEditPartReference, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill(description);
      await openCombobox(clientCombobox);
      await clickInComboboxOption(page, clientName);
      await dialogCreateEditPartReference.getByTestId("button-submit").click();
    };

    for (const part of activeParts) {
      const partReferencesCount = getFormPartReferences(part.id).length;
      const newReference = `NEW-REF-${part.id}`;
      const newDescription = `New Client Description ${part.id}`;
      expect(await getPartReferencesByPartId(part.id)).toHaveLength(
        activePartReferences.filter((partReference) => partReference.partId === part.id).length,
      );

      await page.goto(`/part/${part.id}`);
      await assertFormLoaded(formPart);
      await assertTableRowCount(tablePartReferences, partReferencesCount);

      await clearToasts(page);
      await submitPartReference(newReference, newClient.name, newDescription);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Success);
      await expect(dialogCreateEditPartReference).not.toBeVisible();
      await expect(tablePartReferencesRows).toHaveCount(partReferencesCount + 1);
      const newReferenceRow = filterByExactText(tablePartReferencesRows, newReference);
      await expect(newReferenceRow.getByText(newDescription)).toBeVisible();
      await expect(newReferenceRow.getByText(newClient.name)).toBeVisible();
      expect(
        await db.query.dbTablePartReference.findFirst({ where: { partId: part.id, reference: newReference } }),
      ).toMatchObject({ clientDescription: newDescription, clientId: newClient.id });

      // The same Cliente cannot reuse the reference
      await clearToasts(page);
      await submitPartReference(newReference, newClient.name);

      await expect(toasts).toHaveCount(1);
      expect(await getToastType(toasts.first())).toBe(ToastType.Error);
      await expect(toasts.first()).toContainText("El Cliente ya tiene una Referencia con ese nombre");
      await expectUniqueViolation(
        db.insert(dbTablePartReference).values({
          clientDescription: newDescription,
          clientId: newClient.id,
          partId: part.id,
          reference: newReference,
        }),
        PART_REFERENCE_CONSTRAINT,
      );
      await clearToasts(page);
      await dialogCreateEditPartReference.getByTestId("button-close").click();
      await expect(dialogCreateEditPartReference).not.toBeVisible();

      for (const [index, otherClient] of otherClients.entries()) {
        // ...but another Cliente can
        await submitPartReference(newReference, otherClient.name);
        await expect(dialogCreateEditPartReference).not.toBeVisible();
        await expect(tablePartReferencesRows).toHaveCount(partReferencesCount + index * 2 + 2);
        const otherClientReference = await db.query.dbTablePartReference.findFirst({
          where: { clientId: otherClient.id, deletedAt: { isNull: true }, reference: newReference },
        });
        expect(otherClientReference).toBeDefined();

        // Deleting a Referencia frees it for its Cliente
        const rowOtherClientReference = getTableRowByTestId(tablePartReferences, otherClientReference!.id);
        await clearToasts(page);
        await openAndConfirmAlertDialog(
          page,
          rowOtherClientReference.getByTestId("button-delete"),
          "dialog-delete-model-content",
        );
        await expect(rowOtherClientReference.getByTestId("tooltip-deleted")).toBeVisible();
        await expect(tablePartReferencesRows).toHaveCount(partReferencesCount + index * 2 + 2);

        await clearToasts(page);
        await submitPartReference(newReference, otherClient.name);
        await expect(dialogCreateEditPartReference).not.toBeVisible();
        await expect(tablePartReferencesRows).toHaveCount(partReferencesCount + index * 2 + 3);

        // ...so the deleted Referencia can no longer be restored
        await expectUniqueViolation(
          db
            .update(dbTablePartReference)
            .set({ deletedAt: null })
            .where(eq(dbTablePartReference.id, otherClientReference!.id)),
          PART_REFERENCE_CONSTRAINT,
        );
        await clearToasts(page);
        await openAndConfirmAlertDialog(
          page,
          rowOtherClientReference.getByTestId("button-restore"),
          "dialog-restore-model-content",
        );
        await expect(toasts).toHaveCount(1);
        expect(await getToastType(toasts.first())).toBe(ToastType.Error);
        await expect(toasts.first()).toContainText("El Cliente ya tiene una Referencia con ese nombre");
        await expect(rowOtherClientReference.getByTestId("tooltip-deleted")).toBeVisible();
        expect((await getPartReferenceById(otherClientReference!.id))?.deletedAt).not.toBeNull();
      }
    }
  },
);

test("list the compatible materials of a part by their numeric width", async ({ page, db }) => {
  for (const part of activeParts) {
    // A Forma of its own, so no other Material is compatible with the Artículo
    const [shape] = await db
      .insert(dbTableShape)
      .values({ name: `Numeric width shape ${part.id}` })
      .returning();
    const [rawMaterial] = await db
      .insert(dbTableRawMaterial)
      .values({ name: `Numeric width raw material ${part.id}` })
      .returning();
    const partWidth = "10";
    await db.update(dbTablePart).set({ shapeId: shape.id, width: partWidth }).where(eq(dbTablePart.id, part.id));

    // As text, "9" would be wider than "10" and "100" narrower than "25.5"
    const materials = await db
      .insert(dbTableMaterial)
      .values(["9", "10", "100", "25.5"].map((width) => ({ rawMaterialId: rawMaterial.id, shapeId: shape.id, width })))
      .returning();
    const expectedMaterials = materials
      .filter((material) => Number(material.width) >= Number(partWidth))
      .sort((a, b) => Number(a.width) - Number(b.width));

    await page.goto(`/part/${part.id}?tab=materials`);
    await assertFormLoaded(formPart);

    await assertTableRowCount(tableCompatiblePartMaterials, expectedMaterials.length);
    for (const [position, material] of expectedMaterials.entries()) {
      await expect(getTableRowByPosition(tableCompatiblePartMaterials, position)).toHaveAttribute(
        "data-testid",
        String(material.id),
      );
    }
  }
});

// Electric replicates the changes made straight in the database with some lag
const ELECTRIC_LAG = { timeout: 30_000 };

async function expectCompatibleMaterialIds(materialIds: Array<number>) {
  await assertTableRowCount(tableCompatiblePartMaterials, materialIds.length, ELECTRIC_LAG);
  for (const [position, materialId] of materialIds.entries()) {
    await expect(getTableRowByPosition(tableCompatiblePartMaterials, position)).toHaveAttribute(
      "data-testid",
      String(materialId),
      ELECTRIC_LAG,
    );
  }
}

test("list the compatible materials of a part with the same width by their id", async ({ page, db }) => {
  const part = activeParts[0];
  // A Forma of its own, so no other Material is compatible with the Artículo
  const [shape] = await db.insert(dbTableShape).values({ name: "Same width materials shape" }).returning();
  // Materiales of the same Forma and Medida need different Materias primas
  const [firstRawMaterial, secondRawMaterial] = await db
    .insert(dbTableRawMaterial)
    .values([{ name: "Same width raw material 1" }, { name: "Same width raw material 2" }])
    .returning();
  await db.update(dbTablePart).set({ shapeId: shape.id, width: "10" }).where(eq(dbTablePart.id, part.id));
  const [firstMaterial, secondMaterial, narrowMaterial] = await db
    .insert(dbTableMaterial)
    .values([
      { rawMaterialId: firstRawMaterial.id, shapeId: shape.id, width: "25" },
      { rawMaterialId: secondRawMaterial.id, shapeId: shape.id, width: "20" },
      { rawMaterialId: firstRawMaterial.id, shapeId: shape.id, width: "15" },
    ])
    .returning();

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);
  await expectCompatibleMaterialIds([narrowMaterial.id, secondMaterial.id, firstMaterial.id]);

  // The changed Material arrives last, but it still goes before the one of the same Medida with a greater id
  await db.update(dbTableMaterial).set({ width: "20" }).where(eq(dbTableMaterial.id, firstMaterial.id));
  await expectCompatibleMaterialIds([narrowMaterial.id, firstMaterial.id, secondMaterial.id]);
});

test("keep the compatible materials of a part up to date while they are listed", async ({ page, db }) => {
  const part = activeParts[0];
  // A Forma of its own, so no other Material is compatible with the Artículo
  const [shape] = await db.insert(dbTableShape).values({ name: "Live materials shape" }).returning();
  const [firstRawMaterial, secondRawMaterial] = await db
    .insert(dbTableRawMaterial)
    .values([{ name: "Live materials raw material 1" }, { name: "Live materials raw material 2" }])
    .returning();
  await db.update(dbTablePart).set({ shapeId: shape.id, width: "10" }).where(eq(dbTablePart.id, part.id));
  const [firstMaterial, secondMaterial] = await db
    .insert(dbTableMaterial)
    .values([
      { rawMaterialId: firstRawMaterial.id, shapeId: shape.id, width: "10" },
      { rawMaterialId: secondRawMaterial.id, shapeId: shape.id, width: "20" },
    ])
    .returning();

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);
  await expectCompatibleMaterialIds([firstMaterial.id, secondMaterial.id]);

  const [newMaterial] = await db
    .insert(dbTableMaterial)
    .values({ rawMaterialId: firstRawMaterial.id, shapeId: shape.id, width: "30" })
    .returning();
  await expectCompatibleMaterialIds([firstMaterial.id, secondMaterial.id, newMaterial.id]);

  await db.update(dbTableMaterial).set({ deletedAt: new Date() }).where(eq(dbTableMaterial.id, firstMaterial.id));
  await expectCompatibleMaterialIds([secondMaterial.id, newMaterial.id]);

  // Deleting a Materia prima hides its Materiales, even though they are not deleted themselves
  await db
    .update(dbTableRawMaterial)
    .set({ deletedAt: new Date() })
    .where(eq(dbTableRawMaterial.id, secondRawMaterial.id));
  await expectCompatibleMaterialIds([newMaterial.id]);
});

test("page through the compatible materials of a part", async ({ page, db, toasts }) => {
  const part = activeParts[0];
  // A Forma of its own, so no other Material is compatible with the Artículo
  const [shape] = await db.insert(dbTableShape).values({ name: "Paged materials shape" }).returning();
  const [rawMaterial] = await db
    .insert(dbTableRawMaterial)
    .values({ name: "Paged materials raw material" })
    .returning();
  await db.update(dbTablePart).set({ shapeId: shape.id, width: "10" }).where(eq(dbTablePart.id, part.id));

  // One short of two full pages, so the last page is partial
  const materials = (
    await db
      .insert(dbTableMaterial)
      .values(
        Array.from({ length: COMPATIBLE_MATERIALS_PAGE_SIZE * 2 - 1 }, (_, index) => ({
          rawMaterialId: rawMaterial.id,
          shapeId: shape.id,
          width: String((index + 1) * 10),
        })),
      )
      .returning()
  ).sort((a, b) => Number(a.width) - Number(b.width));
  const firstPageMaterials = materials.slice(0, COMPATIBLE_MATERIALS_PAGE_SIZE);
  const lastPageMaterials = materials.slice(COMPATIBLE_MATERIALS_PAGE_SIZE);

  async function expectCompatibleMaterials(expectedMaterials: typeof materials) {
    await expect(getTableRows(tableCompatiblePartMaterials)).toHaveCount(expectedMaterials.length);
    for (const [position, material] of expectedMaterials.entries()) {
      await expect(getTableRowByPosition(tableCompatiblePartMaterials, position)).toHaveAttribute(
        "data-testid",
        String(material.id),
      );
    }
  }

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);

  const tablePager = tableCompatiblePartMaterials.locator("xpath=preceding-sibling::div[1]");
  const buttonNextPage = getTablePagerButton(tableCompatiblePartMaterials, NEXT_PAGE_LABEL);

  await expect(tablePager.getByText("Página 1 de 2", { exact: true })).toBeVisible();
  await expectCompatibleMaterials(firstPageMaterials);

  await buttonNextPage.click();
  await expect(tablePager.getByText("Página 2 de 2", { exact: true })).toBeVisible();
  await expect(buttonNextPage).toBeDisabled();
  await expectCompatibleMaterials(lastPageMaterials);
  expect(page.url()).not.toContain("table-compatible-part-materials");

  for (const material of lastPageMaterials) {
    await getTableRowByTestId(tableCompatiblePartMaterials, material.id).getByTestId("button-success").click();
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Success);
    await clearToasts(page);
    await expect(getTableRowByTestId(tablePartMaterials, material.id)).toBeVisible();
  }

  // Emptying the last page goes back to the remaining one
  await expect(buttonNextPage).not.toBeVisible();
  await expectCompatibleMaterials(firstPageMaterials);
});

test("filter the compatible materials of a part by their raw material, starting over from the first page", async ({
  page,
  db,
}) => {
  const part = activeParts[0];
  // A Forma of its own, so no other Material is compatible with the Artículo
  const [shape] = await db.insert(dbTableShape).values({ name: "Filtered materials shape" }).returning();
  const [pagedRawMaterial, singleRawMaterial, emptyRawMaterial] = await db
    .insert(dbTableRawMaterial)
    .values([
      { name: "Filtered materials paged raw material" },
      { name: "Filtered materials single raw material" },
      { name: "Filtered materials empty raw material" },
    ])
    .returning();
  await db.update(dbTablePart).set({ shapeId: shape.id, width: "10" }).where(eq(dbTablePart.id, part.id));

  // Still two pages once filtered, so staying on the second one would show rows
  const pagedMaterials = await db
    .insert(dbTableMaterial)
    .values(
      Array.from({ length: COMPATIBLE_MATERIALS_PAGE_SIZE * 2 - 1 }, (_, index) => ({
        rawMaterialId: pagedRawMaterial.id,
        shapeId: shape.id,
        width: String((index + 1) * 10),
      })),
    )
    .returning();
  const [singleMaterial] = await db
    .insert(dbTableMaterial)
    .values({ rawMaterialId: singleRawMaterial.id, shapeId: shape.id, width: "15" })
    .returning();
  const byWidth = (a: { width: string | null }, b: { width: string | null }) => Number(a.width) - Number(b.width);
  const allMaterials = [...pagedMaterials, singleMaterial].sort(byWidth);
  pagedMaterials.sort(byWidth);

  const tablePager = tableCompatiblePartMaterials.locator("xpath=preceding-sibling::div[1]");
  const comboboxRawMaterial = tableCompatiblePartMaterials.getByTestId("combobox-raw-material");
  const buttonRemoveFilters = formPart.getByRole("button", { name: DELETE_FILTERS_LABEL });

  async function expectCompatibleMaterials(expectedMaterials: typeof allMaterials) {
    await expect(getTableRows(tableCompatiblePartMaterials)).toHaveCount(expectedMaterials.length);
    for (const [position, material] of expectedMaterials.entries()) {
      await expect(getTableRowByPosition(tableCompatiblePartMaterials, position)).toHaveAttribute(
        "data-testid",
        String(material.id),
      );
    }
  }

  await page.goto(`/part/${part.id}?tab=materials`);
  await assertFormLoaded(formPart);
  await expect(buttonRemoveFilters).not.toBeVisible();

  await getTablePagerButton(tableCompatiblePartMaterials, NEXT_PAGE_LABEL).click();
  await expect(tablePager.getByText("Página 2 de 2", { exact: true })).toBeVisible();

  await selectComboboxOption(page, comboboxRawMaterial, pagedRawMaterial.name, String(pagedRawMaterial.id));
  await expect(tablePager.getByText("Página 1 de 2", { exact: true })).toBeVisible();
  await expectCompatibleMaterials(pagedMaterials.slice(0, COMPATIBLE_MATERIALS_PAGE_SIZE));

  await getTablePagerButton(tableCompatiblePartMaterials, NEXT_PAGE_LABEL).click();
  await expect(tablePager.getByText("Página 2 de 2", { exact: true })).toBeVisible();

  await buttonRemoveFilters.click();
  await expect(buttonRemoveFilters).not.toBeVisible();
  await assertComboboxValue(comboboxRawMaterial, null);
  await expect(tablePager.getByText("Página 1 de 2", { exact: true })).toBeVisible();
  await expectCompatibleMaterials(allMaterials.slice(0, COMPATIBLE_MATERIALS_PAGE_SIZE));

  await selectComboboxOption(page, comboboxRawMaterial, singleRawMaterial.name, String(singleRawMaterial.id));
  await expect(getTablePagerButton(tableCompatiblePartMaterials, NEXT_PAGE_LABEL)).not.toBeVisible();
  await expectCompatibleMaterials([singleMaterial]);

  await selectComboboxOption(page, comboboxRawMaterial, emptyRawMaterial.name, String(emptyRawMaterial.id));
  await expect(getTableNoDataRow(tableCompatiblePartMaterials)).toHaveText(NO_COMPATIBLE_MATERIALS_MESSAGE);
});

for (const missingField of ["width", "shape"] as const) {
  test(`ask for the ${missingField} of a part before listing its compatible materials`, async ({ page, db }) => {
    const part = activeParts[0];
    const partWidth = "10";
    // A Forma of its own, so no other Material is compatible with the Artículo
    const [shape] = await db
      .insert(dbTableShape)
      .values({ name: `Missing ${missingField} materials shape` })
      .returning();
    const [rawMaterial] = await db
      .insert(dbTableRawMaterial)
      .values({ name: `Missing ${missingField} materials raw material` })
      .returning();
    await db.update(dbTablePart).set({ shapeId: shape.id, width: partWidth }).where(eq(dbTablePart.id, part.id));
    const materials = await db
      .insert(dbTableMaterial)
      .values(
        Array.from({ length: COMPATIBLE_MATERIALS_PAGE_SIZE * 2 - 1 }, (_, index) => ({
          rawMaterialId: rawMaterial.id,
          shapeId: shape.id,
          width: String((index + 1) * 10),
        })),
      )
      .returning();
    materials.sort((a, b) => Number(a.width) - Number(b.width));

    const tablePager = tableCompatiblePartMaterials.locator("xpath=preceding-sibling::div[1]");
    const inputWidth = formPart.getByTestId("input-width");
    const comboboxShape = formPart.getByTestId("combobox-shape");

    // The Forma and Medida are edited in the General tab, and the unsaved values carry over to the Materiales tab
    await page.goto(`/part/${part.id}`);
    await assertFormLoaded(formPart);

    if (missingField === "width") {
      await inputWidth.clear();
    } else {
      await getClearComboboxButton(comboboxShape).click();
      await assertComboboxValue(comboboxShape, null);
    }
    await page.getByRole("tab", { name: MATERIALS_LABEL }).click();
    await expect(getTableNoDataRow(tableCompatiblePartMaterials)).toHaveText(PART_SELECT_SHAPE_AND_SIZE_MESSAGE);
    await expect(getTablePagerButton(tableCompatiblePartMaterials, NEXT_PAGE_LABEL)).not.toBeVisible();

    await page.getByRole("tab", { name: GENERAL_LABEL }).click();
    if (missingField === "width") {
      await inputWidth.pressSequentially(partWidth);
    } else {
      await selectComboboxOption(page, comboboxShape, shape.name, String(shape.id));
    }
    await page.getByRole("tab", { name: MATERIALS_LABEL }).click();
    await expect(tablePager.getByText("Página 1 de 2", { exact: true })).toBeVisible();
    await expect(getTableRows(tableCompatiblePartMaterials)).toHaveCount(COMPATIBLE_MATERIALS_PAGE_SIZE);
    for (const [position, material] of materials.slice(0, COMPATIBLE_MATERIALS_PAGE_SIZE).entries()) {
      await expect(getTableRowByPosition(tableCompatiblePartMaterials, position)).toHaveAttribute(
        "data-testid",
        String(material.id),
      );
    }
  });
}

test("page through the production history of a part, without storing its page in the URL", async ({ page, db }) => {
  const productionOrder = mockProductionOrders.find(
    (mockProductionOrder) =>
      mockProductionOrder.deletedAt === null && activeParts.some((part) => part.id === mockProductionOrder.partId),
  )!;
  const machine = mockMachines.find((mockMachine) => mockMachine.deletedAt === null)!;
  const partProductionOrderIds = new Set(
    mockProductionOrders
      .filter((mockProductionOrder) => mockProductionOrder.partId === productionOrder.partId)
      .map((mockProductionOrder) => mockProductionOrder.id),
  );

  // Newer than every mock production, so they are listed first
  const partProductions = await db
    .insert(dbTablePartProduction)
    .values(
      Array.from({ length: PART_PRODUCTION_HISTORY_PAGE_SIZE * 2 }, (_, index) => ({
        date: new Date(MOCK_INITIAL_DATE.getTime() + DAY_IN_MS * (365 - index)),
        machineId: machine.id,
        productionOrderId: productionOrder.id,
        quantity: index + 1,
      })),
    )
    .returning();
  const pageCount = Math.ceil(
    (mockPartProduction.filter((production) => partProductionOrderIds.has(production.productionOrderId)).length +
      partProductions.length) /
      PART_PRODUCTION_HISTORY_PAGE_SIZE,
  );

  const tablePartProductionHistory = page.getByTestId("table-part-production-history");
  const tablePager = tablePartProductionHistory.locator("xpath=preceding-sibling::div[1]");

  async function expectPartProductions(expectedPartProductions: typeof partProductions) {
    await expect(getTableRows(tablePartProductionHistory)).toHaveCount(expectedPartProductions.length);
    for (const [position, partProduction] of expectedPartProductions.entries()) {
      await expect(getTableRowByPosition(tablePartProductionHistory, position)).toHaveAttribute(
        "data-testid",
        String(partProduction.id),
      );
    }
  }

  for (const url of [`/part/${productionOrder.partId}?tab=history`, `/production-order/${productionOrder.id}`]) {
    await page.goto(url);
    const initialUrl = page.url();

    await expect(tablePager.getByText(`Página 1 de ${pageCount}`, { exact: true })).toBeVisible();
    await expectPartProductions(partProductions.slice(0, PART_PRODUCTION_HISTORY_PAGE_SIZE));

    await getTablePagerButton(tablePartProductionHistory, NEXT_PAGE_LABEL).click();
    await expect(tablePager.getByText(`Página 2 de ${pageCount}`, { exact: true })).toBeVisible();
    await expectPartProductions(partProductions.slice(PART_PRODUCTION_HISTORY_PAGE_SIZE));
    expect(page.url()).toBe(initialUrl);

    await getTablePagerButton(tablePartProductionHistory, PREVIOUS_PAGE_LABEL).click();
    await expect(tablePager.getByText(`Página 1 de ${pageCount}`, { exact: true })).toBeVisible();
    await expectPartProductions(partProductions.slice(0, PART_PRODUCTION_HISTORY_PAGE_SIZE));
    expect(page.url()).toBe(initialUrl);
  }
});

for (const userMode of [UserMode.Admin, UserMode.User]) {
  test(`as ${userMode}, only an admin can edit a part and see its prices`, async ({ page }) => {
    const isAdmin = userMode === UserMode.Admin;
    const tablePartFeatures = formPart.getByTestId("table-part-features");

    async function expectShown(locator: Locator, shown: boolean) {
      await (shown ? expect(locator.first()).toBeVisible() : expect(locator).toHaveCount(0));
    }

    await setUserMode(page, userMode);

    for (const part of activeParts) {
      const formPartReferences = getFormPartReferences(part.id);
      const partReferencesCount = formPartReferences.filter((partReference) => partReference.deletedAt === null).length;
      const deletedPartReferencesCount = formPartReferences.length - partReferencesCount;
      const partFeaturesCount = mockPartFeatures.filter((partFeature) => partFeature.partId === part.id).length;
      const partMaterialsCount = getMockPartMaterials(part).length;

      await page.goto(`/part/${part.id}`);
      await assertFormLoaded(formPart);
      await assertTableRowCount(tablePartReferences, formPartReferences.length);
      await expect(tablePartReferences.getByTestId("tooltip-deleted")).toHaveCount(deletedPartReferencesCount);
      await (isAdmin
        ? expect(getFormInputByLabel(formPart, DESCRIPTION_LABEL)).toBeEditable()
        : expect(getFormInputByLabel(formPart, DESCRIPTION_LABEL)).not.toBeEditable());
      await expectShown(page.getByTestId("button-create-part"), isAdmin);
      await expectShown(formPart.getByTestId("button-submit"), isAdmin);
      await expectShown(formPart.getByTestId("button-add-reference"), isAdmin);
      await expectShown(tablePartReferences.getByTestId("button-edit"), isAdmin && partReferencesCount > 0);
      await expectShown(tablePartReferences.getByTestId("button-delete"), isAdmin && partReferencesCount > 0);
      await expectShown(tablePartReferences.getByTestId("button-restore"), isAdmin && deletedPartReferencesCount > 0);
      await expectShown(page.getByRole("tab", { name: PRICES_TITLE }), isAdmin);

      await page.goto(`/part/${part.id}?tab=blueprints`);
      await assertFormLoaded(formPart);
      await assertTableRowCount(tablePartFeatures, partFeaturesCount);
      await expectShown(formPart.getByTestId("button-add-blueprint"), isAdmin);
      await expectShown(formPart.getByTestId("button-create-part-feature"), isAdmin);
      await expectShown(tablePartFeatures.getByTestId("button-delete"), isAdmin && partFeaturesCount > 0);

      await page.goto(`/part/${part.id}?tab=materials`);
      await assertFormLoaded(formPart);
      await assertTableRowCount(tablePartMaterials, partMaterialsCount);
      await expectShown(tablePartMaterials.getByTestId("button-delete"), isAdmin && partMaterialsCount > 0);
      await expectShown(tablePartMaterials.getByRole("columnheader", { name: ACTIONS_LABEL }), isAdmin);
      await expectShown(tableCompatiblePartMaterials, isAdmin);

      const partComponentsCount = getMockPartComponentsOfPart(part.id).length;
      const tablePartComponents = await gotoPartComponents(page, part.id);
      await assertTableRowCount(tablePartComponents, partComponentsCount);
      await expectShown(tablePartComponents.getByTestId("button-create-part-component"), isAdmin);
      await expectShown(tablePartComponents.getByTestId("button-delete"), isAdmin && partComponentsCount > 0);
      await expectShown(tablePartComponents.getByTestId("editable-cell-input"), isAdmin && partComponentsCount > 0);
      // Anyone can look at the blueprints of the components
      await expectShown(tablePartComponents.getByTestId("button-open-blueprints"), partComponentsCount > 0);
    }

    for (const deletedPart of deletedParts) {
      await page.goto(`/part/${deletedPart.id}`);
      await assertFormLoaded(formPart);
      await expect(formPart.getByTestId("badge-part-deleted")).toBeVisible();
      await expectShown(formPart.getByTestId("button-restore"), isAdmin);
    }
  });
}

test("a deleted part cannot get new prices", async ({ page }) => {
  expect(deletedParts.length, "Wrong test set up: Some Artículo should be deleted").toBeGreaterThan(0);

  for (const deletedPart of deletedParts) {
    await page.goto(`/part/${deletedPart.id}?tab=prices`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(
      tablePartPrices,
      mockPartPrices.filter((partPrice) => partPrice.partId === deletedPart.id).length,
    );
    await expect(formPart.getByTestId("card-create-part-price")).toHaveCount(0);
    await expect(formPart.getByTestId("button-link-calculate-price")).toHaveCount(0);
  }
});

// Real Artículos are named after their dimensions, like "Ø64,5 x Ø38", and so are their Planos
test(
  "a part and its blueprint can have non ASCII characters in their names",
  { annotation: [TestAnnotations.ResetBlueprints] },
  async ({ page }) => {
    const partId = NEW_PART_ID;
    const description = "ARANDELA POM Ø64,5 x Ø38 x 2,5 mm (S/ref. 628000450)";
    const blueprintFileName = "Ø64,5x38";

    await test.step("create the part with its blueprint folder", async () => {
      await page.goto("/part?createPart=true");
      await getFormInputByLabel(formPart, REFERENCE_LABEL).fill("628000450");
      await getFormInputByLabel(formPart, DESCRIPTION_LABEL).fill(description);
      await getFormInputByLabel(formPart, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill(description);
      await openCombobox(formPart.getByTestId("combobox-client"));
      await clickInComboboxOption(page, activeClients[0].name);
      await formPart.getByTestId("button-submit").click();
      await expect(page).toHaveURL(`/part/${partId}`);

      expect(
        fs.existsSync(path.join(process.env.BLUEPRINT_ROOT_PATH!, `${partId} - ${sanitizePath(description)}`)),
      ).toBe(true);
    });

    await test.step("upload and download the blueprint", async () => {
      await page.goto(`/part/${partId}?tab=blueprints`);
      await assertFormLoaded(formPart);
      await formPart.getByTestId("button-add-blueprint").click();
      const dialogCreateBlueprint = page.getByTestId("dialog-create-blueprint");
      await setInputFiles(
        page,
        getFormInputByLabel(dialogCreateBlueprint, BLUEPRINT_LABEL, InputElementType.File),
        path.join(MOCK_DATA_PATH, "sample.pdf"),
      );
      await getFormInputByLabel(dialogCreateBlueprint, NAME_LABEL).fill(blueprintFileName);
      await dialogCreateBlueprint.getByTestId("button-submit").click();
      await expect(dialogCreateBlueprint).not.toBeVisible();

      const [blueprint] = await getBlueprintsByPartId(partId);
      expect(blueprint.fileName).toBe(blueprintFileName);
      const blueprintPath = await getBlueprintPath({ checkIfFileExists: true, fileName: blueprintFileName, partId });
      expect(blueprintPath).toBeTruthy();
      await expect(formPart.getByTestId(`card-blueprint-${blueprint.id}`)).toContainText(blueprintFileName);

      const response = await page.request.get(`/api/files/blueprint/${blueprint.id}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("application/pdf");
      expect(decodeURIComponent(response.headers()["content-disposition"].split("''")[1])).toBe(blueprintFileName);
      expect((await response.body()).equals(fs.readFileSync(blueprintPath!))).toBe(true);
    });

    await test.step("filter the parts by the description from the url", async () => {
      const descriptionFilter = "Ø64,5 x Ø38";
      const getDescriptionFilters = () =>
        (JSON.parse(new URL(page.url()).searchParams.get("table-part") ?? "{}") as TTablePartState).filters;

      await page.goto("/part");
      await tablePart.getByTestId("input-filter-description").fill(descriptionFilter);
      await assertTableRowCount(tablePart, 1);
      await expect(getTableRowByTestId(tablePart, partId)).toBeVisible();
      await expect.poll(getDescriptionFilters).toEqual([{ id: "description", value: descriptionFilter }]);

      // Loading the url renders the filtered table on the server
      await page.goto(page.url());
      await expect(tablePart.getByTestId("input-filter-description")).toHaveValue(descriptionFilter);
      await assertTableRowCount(tablePart, 1);
      await expect(getTableRowByTestId(tablePart, partId)).toBeVisible();
    });
  },
);

test("create a part with its blueprint", { annotation: [TestAnnotations.ResetBlueprints] }, async ({ page }) => {
  const partId = NEW_PART_ID;
  const blueprintFileName = "NewPartBlueprint";

  await page.goto("/part?createPart=true");
  await getFormInputByLabel(formPart, REFERENCE_LABEL).fill("REF-BLUEPRINT");
  await getFormInputByLabel(formPart, DESCRIPTION_LABEL).fill("Part with blueprint");
  await getFormInputByLabel(formPart, CLIENT_REFERENCE_DESCRIPTION_LABEL).fill("Part with blueprint");
  await openCombobox(formPart.getByTestId("combobox-client"));
  await clickInComboboxOption(page, activeClients[0].name);

  const inputFileName = getFormInputByLabel(formPart, NAME_LABEL);
  await setInputFiles(
    page,
    getFormInputByLabel(formPart, BLUEPRINT_LABEL, InputElementType.File),
    path.join(MOCK_DATA_PATH, "sample.pdf"),
  );
  await expect(inputFileName).toHaveValue("sample");

  // A Plano without a name is not created, and neither is its Artículo
  await inputFileName.clear();
  await formPart.getByTestId("button-submit").click();
  await expect(formPart.getByText("El nombre del archivo no puede estar vacío")).toBeVisible();
  await expect(page).toHaveURL("/part?createPart=true");
  expect(await getPartById(partId)).toBeUndefined();

  await inputFileName.fill(`${blueprintFileName}.pdf`);
  await formPart.getByTestId("button-submit").click();
  await expect(page).toHaveURL(`/part/${partId}`);

  const [blueprint] = await getBlueprintsByPartId(partId);
  expect(blueprint).toMatchObject({ fileName: blueprintFileName, partId });
  expect(await getBlueprintPath({ checkIfFileExists: true, fileName: blueprintFileName, partId })).toBeTruthy();

  await page.goto(`/part/${partId}?tab=blueprints`);
  await expect(formPart.getByTestId(`card-blueprint-${blueprint.id}`)).toContainText(blueprintFileName);
});

test("manage multi-level part sets", async ({ page, db }) => {
  const getMockPart = (partId: number) => mockParts.find((part) => part.id === partId)!;
  const isMockPartSet = (partId: number) => getMockPartComponentsOfPart(partId).length > 0;
  const partComponents = mockPartComponents.map((partComponent) => ({ ...partComponent }));
  const getMockPartBlueprints = (partId: number) => mockBlueprints.filter((blueprint) => blueprint.partId === partId);
  const getExpectedTree = (partId: number): Array<{ label: string; part: BasePart }> =>
    partComponents
      .filter((partComponent) => partComponent.parentPartId === partId)
      .sort((a, b) =>
        getMockPart(a.componentPartId).description.localeCompare(getMockPart(b.componentPartId).description),
      )
      .flatMap((partComponent) => [
        {
          label: `${partComponent.quantity} × ${getMockPart(partComponent.componentPartId).description}`,
          part: getMockPart(partComponent.componentPartId),
        },
        ...getExpectedTree(partComponent.componentPartId),
      ]);

  // The top set holds two sets that share a leaf, and one of them holds a deleted set with its own component
  const setPart = activeParts.find(
    (part) =>
      getMockPartComponentsOfPart(part.id).filter(({ componentPartId }) => isMockPartSet(componentPartId)).length > 1,
  )!;
  const [subSetPart] = getMockPartComponentsOfPart(setPart.id).map(({ componentPartId }) =>
    getMockPart(componentPartId),
  );
  const leafPart = getMockPart(getMockPartComponentsOfPart(subSetPart.id)[0].componentPartId);
  const deletedSetPart = deletedParts.find((part) => isMockPartSet(part.id))!;
  const deletedSetComponentPart = getMockPart(getMockPartComponentsOfPart(deletedSetPart.id)[0].componentPartId);
  expect(isMockPartSet(leafPart.id), "Wrong test set up: the leaf of the tree should not be a Conjunto").toBe(false);
  expect(
    mockPartComponents.some(
      ({ componentPartId, parentPartId }) =>
        getMockPart(componentPartId).deletedAt !== null && getMockPart(parentPartId).deletedAt === null,
    ),
    "Wrong test set up: Some active Conjunto should hold a deleted Artículo",
  ).toBe(true);
  expect(
    activeParts.some(
      (part) => mockPartComponents.filter(({ componentPartId }) => componentPartId === part.id).length > 1,
    ),
    "Wrong test set up: Some Artículo should be shared by several Conjuntos",
  ).toBe(true);

  const getTooltipPartSet = (partId: number) => getTableRowByTestId(tablePart, partId).getByTestId("tooltip-part-set");
  const dialogCreatePartComponent = page.getByTestId("dialog-create-part-component");

  async function expectPartSetTooltip(partId: number) {
    await page.goto("/part");
    await getTooltipPartSet(partId).hover();
    const popoverPartSet = getPopoverContent(page);
    const expectedTree = getExpectedTree(partId);
    const nodeLabels = popoverPartSet.getByTestId("part-set-node-label");
    await expect(nodeLabels).toHaveText(expectedTree.map((node) => node.label));
    // Shared components are listed under each of their sets, not at the top level
    await expect(popoverPartSet.getByTestId("part-set-tree").first().locator(":scope > li")).toHaveCount(
      partComponents.filter((partComponent) => partComponent.parentPartId === partId).length,
    );
    for (const [index, { part }] of expectedTree.entries()) {
      const nodeRow = popoverPartSet.getByTestId("part-set-node-row").nth(index);
      await expect(nodeRow.getByRole("link")).toHaveAttribute("href", `/part/${part.id}`);
      await (getMockPartBlueprints(part.id).length > 0
        ? expect(nodeRow.getByTestId("button-part-set-node-blueprints")).toBeEnabled()
        : expect(nodeRow.getByTestId("button-part-set-node-blueprints")).toBeDisabled());
      await expect(nodeRow.getByTestId("badge-part-set-node-deleted")).toHaveCount(part.deletedAt !== null ? 1 : 0);
    }
    await page.mouse.move(0, 0);
    await expect(popoverPartSet).toBeHidden();
  }

  await test.step("every part lists its components, marking the deleted ones", async () => {
    for (const part of mockParts) {
      const tablePartComponents = await gotoPartComponents(page, part.id);
      const components = getMockPartComponentsOfPart(part.id);
      await assertTableRowCount(tablePartComponents, components.length);
      if (components.length === 0) {
        await expect(getTableNoDataRow(tablePartComponents)).toBeVisible();
      }
      for (const partComponent of components) {
        const rowPartComponent = getTableRowByTestId(tablePartComponents, partComponent.componentPartId);
        await expect(getEditableCellById(rowPartComponent, "quantity")).toHaveValue(String(partComponent.quantity));
        await expect(rowPartComponent.getByTestId("tooltip-deleted")).toHaveCount(
          getMockPart(partComponent.componentPartId).deletedAt !== null ? 1 : 0,
        );
        await (getMockPartBlueprints(partComponent.componentPartId).length > 0
          ? expect(rowPartComponent.getByTestId("button-open-blueprints")).toBeEnabled()
          : expect(rowPartComponent.getByTestId("button-open-blueprints")).toBeDisabled());
      }
    }

    const componentWithBlueprints = mockPartComponents.find(
      ({ componentPartId }) => getMockPartBlueprints(componentPartId).length > 0,
    )!;
    const tablePartComponents = await gotoPartComponents(page, componentWithBlueprints.parentPartId);
    await getTableRowByTestId(tablePartComponents, componentWithBlueprints.componentPartId)
      .getByTestId("button-open-blueprints")
      .click();
    const dialogBlueprints = page.getByTestId("dialog-part-component-blueprints");
    await expect(dialogBlueprints).toContainText(getMockPart(componentWithBlueprints.componentPartId).description);
    // The blueprints are stacked, so only one is shown at a time
    for (const [index, blueprint] of getMockPartBlueprints(componentWithBlueprints.componentPartId).entries()) {
      if (index > 0) await dialogBlueprints.getByTestId("button-next-file").click();
      await expect(dialogBlueprints.getByTestId(`card-blueprint-${blueprint.id}`)).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(dialogBlueprints).toBeHidden();
  });

  await test.step("the parts table marks every set with the tooltip of its full tree", async () => {
    await page.goto("/part");
    for (const part of activeParts) {
      await expect(getTooltipPartSet(part.id)).toHaveCount(isMockPartSet(part.id) ? 1 : 0);
    }
    await expectPartSetTooltip(setPart.id);
  });

  await test.step("the tooltip opens the blueprints of a component without navigating or closing, and links to it", async () => {
    const nodeWithBlueprints = getExpectedTree(setPart.id).find(
      ({ part }) => getMockPartBlueprints(part.id).length > 0,
    )!;
    const popoverPartSet = getPopoverContent(page);
    const nodeRow = popoverPartSet
      .getByTestId("part-set-node-row")
      .filter({ hasText: nodeWithBlueprints.label })
      .first();
    const dialogBlueprints = page.getByTestId("dialog-part-set-blueprints");

    await page.goto("/part");
    await getTooltipPartSet(setPart.id).hover();
    await nodeRow.getByTestId("button-part-set-node-blueprints").click();
    await expect(dialogBlueprints).toBeVisible();
    await expect(dialogBlueprints).toContainText(nodeWithBlueprints.part.description);
    // The blueprints are stacked, so only one is shown at a time
    for (const [index, blueprint] of getMockPartBlueprints(nodeWithBlueprints.part.id).entries()) {
      if (index > 0) await dialogBlueprints.getByTestId("button-next-file").click();
      await expect(dialogBlueprints.getByTestId(`card-blueprint-${blueprint.id}`)).toBeVisible();
    }
    await expect(popoverPartSet).toBeVisible();
    await expect(page).toHaveURL("/part");

    // The tooltip stays open after the dialog closes, even with the pointer away from it, until it is dismissed
    await page.keyboard.press("Escape");
    await expect(dialogBlueprints).toBeHidden();
    await page.mouse.move(0, 0);
    await expect(popoverPartSet).toBeVisible();
    await expect(page).toHaveURL("/part");

    await nodeRow.getByTestId("button-part-set-node-blueprints").click();
    await expect(dialogBlueprints).toBeVisible();
    await dialogBlueprints.getByTestId("button-close").click();
    await expect(dialogBlueprints).toBeHidden();
    await expect(popoverPartSet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(popoverPartSet).toBeHidden();

    await getTooltipPartSet(setPart.id).hover();
    await nodeRow.getByTestId("button-link-part-set-node").click();
    await expect(page).toHaveURL(`/part/${nodeWithBlueprints.part.id}`);
    await assertFormLoaded(formPart);
  });

  await test.step("a component needs a part and a positive quantity", async () => {
    const tablePartComponents = await gotoPartComponents(page, setPart.id);
    await tablePartComponents.getByTestId("button-create-part-component").click();
    await expect(dialogCreatePartComponent).toBeVisible();
    const buttonSubmit = dialogCreatePartComponent.getByTestId("button-submit");
    const inputQuantity = dialogCreatePartComponent.getByTestId("input-create-part-component-quantity");

    await inputQuantity.pressSequentially("3");
    await expect(buttonSubmit).toBeDisabled();
    const { dialogPickerPartContent, tablePickerPart } = await openPartPicker(
      page,
      dialogCreatePartComponent.getByTestId("picker-create-part-component"),
    );
    // Deleted Artículos cannot be picked as components
    await expect(getTableRowByTestId(tablePickerPart, deletedSetPart.id)).toHaveCount(0);
    await getTableRowByTestId(tablePickerPart, leafPart.id).getByTestId("button-success").click();
    await expect(dialogPickerPartContent).not.toBeVisible();
    await expect(buttonSubmit).toBeEnabled();
    await inputQuantity.clear();
    await expect(buttonSubmit).toBeDisabled();
    await inputQuantity.pressSequentially("0");
    await expect(buttonSubmit).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(dialogCreatePartComponent).toBeHidden();
    expect(await getPartComponentQuantity(setPart.id, leafPart.id)).toBeUndefined();
  });

  await test.step("a component added below the deepest level shows in the tree of every set above it", async () => {
    const newPartComponent = {
      componentPartId: deletedSetComponentPart.id,
      parentPartId: leafPart.id,
      quantity: 2,
    };
    await workflowCreatePartComponent(page, newPartComponent);
    partComponents.push(newPartComponent);

    await page.goto("/part");
    await expect(getTooltipPartSet(leafPart.id)).toHaveCount(1);
    await expectPartSetTooltip(setPart.id);
  });

  await test.step("a part cannot be added twice, to itself, below its own components or to a deleted set", async () => {
    const deepestPartId = partComponents.at(-1)!.componentPartId;
    for (const [partComponent, errorMessage] of [
      [{ ...partComponents[0], quantity: 5 }, PART_COMPONENT_DUPLICATED_ERROR_MESSAGE],
      [{ componentPartId: setPart.id, parentPartId: setPart.id, quantity: 1 }, PART_COMPONENT_SELF_ERROR_MESSAGE],
      [{ componentPartId: setPart.id, parentPartId: subSetPart.id, quantity: 1 }, PART_COMPONENT_CYCLE_ERROR_MESSAGE],
      [{ componentPartId: setPart.id, parentPartId: deepestPartId, quantity: 1 }, PART_COMPONENT_CYCLE_ERROR_MESSAGE],
    ] as const) {
      await workflowCreatePartComponent(page, partComponent, errorMessage);
    }

    await page.goto(`/part/${deletedSetPart.id}?tab=components&createPartComponent=true`);
    await assertFormLoaded(formPart);
    await assertTableRowCount(
      formPart.getByTestId("table-part-components"),
      getMockPartComponentsOfPart(deletedSetPart.id).length,
    );
    await expect(formPart.getByTestId("button-create-part-component")).toHaveCount(0);
    await expect(dialogCreatePartComponent).toBeHidden();

    await expectUniqueViolation(
      db.insert(dbTablePartComponent).values(mockPartComponents[0]),
      PART_COMPONENT_CONSTRAINT,
    );
    await expectCheckViolation(
      db.insert(dbTablePartComponent).values({ componentPartId: leafPart.id, parentPartId: leafPart.id, quantity: 1 }),
      PART_COMPONENT_NOT_SELF_CONSTRAINT,
    );
    await expectCheckViolation(
      db.insert(dbTablePartComponent).values({ componentPartId: setPart.id, parentPartId: leafPart.id, quantity: 0 }),
      PART_COMPONENT_QUANTITY_CONSTRAINT,
    );
  });

  await test.step("edit the quantity of a component", async () => {
    const tablePartComponents = await gotoPartComponents(page, setPart.id);
    const inputQuantity = getEditableCellById(getTableRowByTestId(tablePartComponents, subSetPart.id), "quantity");

    await inputQuantity.fill("7");
    await inputQuantity.blur();
    await expectSingleToast(page);
    expect(await getPartComponentQuantity(setPart.id, subSetPart.id)).toBe(7);

    await inputQuantity.fill("");
    await inputQuantity.blur();
    await expectSingleToast(page, PART_COMPONENT_EDIT_VALIDATION_ERROR_MESSAGE);
    expect(await getPartComponentQuantity(setPart.id, subSetPart.id)).toBe(7);

    await page.reload();
    await assertFormLoaded(formPart);
    await expect(inputQuantity).toHaveValue("7");
  });

  await test.step("dismissing the removal keeps the component, removing the last one makes it a plain part", async () => {
    const tablePartComponents = await gotoPartComponents(page, subSetPart.id);
    await getTableRowByTestId(tablePartComponents, leafPart.id).getByTestId("button-delete").click();
    const dialogDeleteModel = page.getByTestId("dialog-delete-model-content");
    await expect(dialogDeleteModel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogDeleteModel).not.toBeVisible();
    await assertTableRowCount(tablePartComponents, getMockPartComponentsOfPart(subSetPart.id).length);

    for (const partComponent of getMockPartComponentsOfPart(subSetPart.id)) {
      await workflowDeletePartComponent(page, subSetPart.id, partComponent.componentPartId);
    }
    await expect(getTableNoDataRow(tablePartComponents)).toBeVisible();

    await page.goto("/part");
    await expect(getTooltipPartSet(setPart.id)).toHaveCount(1);
    await expect(getTooltipPartSet(subSetPart.id)).toHaveCount(0);
  });

  await test.step("deleting a set keeps its components, and restoring it brings them back", async () => {
    await workflowDeletePart(page, setPart.id);
    expect(await getPartComponentsOfPart(setPart.id)).toHaveLength(getMockPartComponentsOfPart(setPart.id).length);

    await page.goto(`/part/${deletedSetPart.id}`);
    await assertFormLoaded(formPart);
    await openAndConfirmAlertDialog(page, formPart.getByTestId("button-restore"), "dialog-restore-model-content");
    await expectSingleToast(page);

    const tablePartComponents = await gotoPartComponents(page, deletedSetPart.id);
    await assertTableRowCount(tablePartComponents, getMockPartComponentsOfPart(deletedSetPart.id).length);
    await page.goto("/part");
    await expect(getTooltipPartSet(deletedSetPart.id)).toHaveCount(1);
  });
});
