import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { eq, gt } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { dbTableMaterialLot, dbTableMaterialLotMovement } from "@/db/schema";
import { DateFormat, formatDate, formatMaterial, formatMaterialLot } from "@/lib/formatters";
import { SELECT_OPTION_PLACEHOLDER } from "@/messages/combobox";
import { QUANTITY_LABEL } from "@/messages/common";
import {
  HEAT_LABEL,
  MATERIAL_LOT_CERTIFICATE_LABEL,
  MATERIAL_LOT_LABEL,
  MATERIAL_LOT_QUANTITY_MESSAGE,
  MATERIAL_LOT_RECEIVED_AT_LABEL,
  MATERIAL_LOT_RECEIVED_QUANTITY_LABEL,
  MATERIAL_LOT_UNIT_LABEL,
  MATERIAL_LOT_UNIT_LABELS,
  NO_MATERIAL_LOTS_MESSAGE,
  NO_MATERIAL_USED_MESSAGE,
} from "@/messages/material-lot";
import {
  mockMaterialLotMovements,
  mockMaterialLots,
  mockMaterials,
  mockPartMaterials,
  mockRawMaterials,
} from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertComboboxOptionsCount, openCombobox, selectComboboxOption } from "@/tests/utils/components/combobox";
import { selectDateInputDate } from "@/tests/utils/components/date-input";
import { setInputFiles } from "@/tests/utils/components/file-input";
import { InputElementType, getFormInputByLabel } from "@/tests/utils/components/form";
import {
  assertTableRowCount,
  getTableNoDataRow,
  getTableRowByPosition,
  getTableRowByTestId,
} from "@/tests/utils/components/table";
import type {
  BaseMaterialLot,
  BaseMaterialLotMovement,
  MaterialLotMovementMode,
  MaterialLotUnit,
} from "@/types/material-lot";

export function getMaterialLotLocators(page: Page) {
  const dialogMaterialLots = page.getByTestId("dialog-material-lots");
  const dialogMaterialLotMovements = page.getByTestId("dialog-material-lot-movements");
  return {
    dialogMaterialLotForm: page.getByTestId("dialog-create-edit-material-lot"),
    dialogMaterialLotMovements,
    dialogMaterialLots,
    tableMaterialLotMovements: dialogMaterialLotMovements.getByTestId("table-material-lot-movements"),
    tableMaterialLots: dialogMaterialLots.getByTestId("table-material-lots"),
  };
}

export function getMockMaterialLotRemaining(materialLot: BaseMaterialLot) {
  return getMockMaterialLotMovements(materialLot.id).reduce(
    (remaining, movement) => remaining + movement.quantity,
    materialLot.receivedQuantity,
  );
}

export function getMockMaterialLotMovements(materialLotId: number) {
  return mockMaterialLotMovements.filter((movement) => movement.materialLotId === materialLotId);
}

export function getMockMaterialName(materialId: number) {
  const material = mockMaterials.find((mockMaterial) => mockMaterial.id === materialId)!;
  const rawMaterial = mockRawMaterials.find((mockRawMaterial) => mockRawMaterial.id === material.rawMaterialId);
  return formatMaterial({ rawMaterialName: rawMaterial?.name, width: material.width });
}

export function getMockPartMaterialIds(partId: number) {
  return mockPartMaterials.filter((partMaterial) => partMaterial.partId === partId).map(({ materialId }) => materialId);
}

// The Lotes that can be taken for a Material of an Artículo: the ones with stock
export function getMockPickableMaterialLots(materialId: number) {
  return mockMaterialLots.filter(
    (materialLot) => materialLot.materialId === materialId && getMockMaterialLotRemaining(materialLot) > 0,
  );
}

export function getMaterialLotOptionText(materialLot: BaseMaterialLot, remaining: number) {
  return formatMaterialLot({ ...materialLot, materialName: getMockMaterialName(materialLot.materialId), remaining });
}

export async function getDbMaterialLot(db: TDatabase, materialLotId: number) {
  return db.query.dbTableMaterialLot.findFirst({ where: { id: materialLotId } });
}

export async function getNewDbMaterialLots(db: TDatabase) {
  return db
    .select()
    .from(dbTableMaterialLot)
    .where(gt(dbTableMaterialLot.id, mockMaterialLots.length))
    .orderBy(dbTableMaterialLot.id);
}

export async function getNewDbMaterialLotMovements(db: TDatabase) {
  return db
    .select()
    .from(dbTableMaterialLotMovement)
    .where(gt(dbTableMaterialLotMovement.id, mockMaterialLotMovements.length))
    .orderBy(dbTableMaterialLotMovement.id);
}

export async function getDbMaterialLotMovements(db: TDatabase, { materialLotId }: { materialLotId: number }) {
  return db
    .select()
    .from(dbTableMaterialLotMovement)
    .where(eq(dbTableMaterialLotMovement.materialLotId, materialLotId));
}

export async function getDbMaterialLotRemaining(db: TDatabase, materialLotId: number) {
  const materialLot = (await getDbMaterialLot(db, materialLotId))!;
  return (await getDbMaterialLotMovements(db, { materialLotId })).reduce(
    (remaining, movement) => remaining + movement.quantity,
    materialLot.receivedQuantity,
  );
}

export async function workflowOpenMaterialLots(page: Page, materialId: number) {
  const { dialogMaterialLots } = getMaterialLotLocators(page);
  await page.goto("/maintenance?tab=material");
  await getTableRowByTestId(page.getByTestId("table-material"), materialId).getByTestId("button-material-lots").click();
  await expect(dialogMaterialLots).toBeVisible();
  await expect(dialogMaterialLots.getByRole("heading").first()).toContainText(getMockMaterialName(materialId));
}

export async function workflowShowUsedUpMaterialLots(page: Page) {
  const checkbox = getMaterialLotLocators(page).dialogMaterialLots.getByTestId("checkbox-show-used-up-material-lots");
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("data-checked");
}

export async function assertCertificateLink(container: Locator, materialLot: { id: number; hasCertificate: boolean }) {
  const link = container.getByTestId("link-material-certificate");
  if (!materialLot.hasCertificate) {
    await expect(link).toHaveCount(0);
    return;
  }
  await expect(link).toHaveAttribute("href", `/api/files/material-certificate/${materialLot.id}`);
  await expect(link).toHaveAttribute("target", "_blank");
}

export interface TMaterialLotRowState {
  materialLot: BaseMaterialLot;
  remaining: number;
  deletable: boolean;
}

export async function assertMaterialLotRow(
  table: Locator,
  { materialLot, remaining, deletable }: TMaterialLotRowState,
) {
  const row = getTableRowByTestId(table, materialLot.id);
  await expect(row.getByTestId("heat")).toHaveText(materialLot.heat ?? "");
  await expect(row.getByTestId("unit")).toHaveText(MATERIAL_LOT_UNIT_LABELS[materialLot.unit]);
  await expect(row.getByTestId("receivedAt")).toHaveText(formatDate(materialLot.receivedAt)!);
  await expect(row.getByTestId("receivedQuantity")).toHaveText(String(materialLot.receivedQuantity));
  await expect(row.getByTestId("remaining")).toHaveText(String(remaining));
  await assertCertificateLink(row, materialLot);
  await expect(row.getByTestId("button-delete")).toHaveCount(deletable ? 1 : 0);
}

// The newest received first
export async function assertMaterialLotsTable(page: Page, rows: Array<TMaterialLotRowState>) {
  const { tableMaterialLots } = getMaterialLotLocators(page);
  if (rows.length === 0) {
    await expect(getTableNoDataRow(tableMaterialLots)).toHaveText(NO_MATERIAL_LOTS_MESSAGE);
    return;
  }
  const sortedRows = [...rows].sort(
    (a, b) =>
      b.materialLot.receivedAt.getTime() - a.materialLot.receivedAt.getTime() || b.materialLot.id - a.materialLot.id,
  );
  await assertTableRowCount(tableMaterialLots, sortedRows.length);
  for (const [position, row] of sortedRows.entries()) {
    await expect(getTableRowByPosition(tableMaterialLots, position)).toHaveAttribute(
      "data-testid",
      String(row.materialLot.id),
    );
    await assertMaterialLotRow(tableMaterialLots, row);
  }
}

export interface TMaterialLotFormValues {
  heat?: string;
  unit?: MaterialLotUnit;
  receivedQuantity?: number;
  receivedAt?: Date;
  certificatePath?: string;
}

export async function workflowFillMaterialLotForm(page: Page, values: TMaterialLotFormValues) {
  const { dialogMaterialLotForm } = getMaterialLotLocators(page);
  if (values.heat !== undefined) {
    await getFormInputByLabel(dialogMaterialLotForm, HEAT_LABEL).fill(values.heat);
  }
  if (values.unit !== undefined) {
    await selectComboboxOption(
      page,
      getFormInputByLabel(dialogMaterialLotForm, MATERIAL_LOT_UNIT_LABEL, InputElementType.Combobox),
      MATERIAL_LOT_UNIT_LABELS[values.unit],
    );
  }
  if (values.receivedQuantity !== undefined) {
    await getFormInputByLabel(
      dialogMaterialLotForm,
      MATERIAL_LOT_RECEIVED_QUANTITY_LABEL,
      InputElementType.Number,
    ).fill(String(values.receivedQuantity));
  }
  if (values.receivedAt !== undefined) {
    await selectDateInputDate(
      page,
      getFormInputByLabel(dialogMaterialLotForm, MATERIAL_LOT_RECEIVED_AT_LABEL, InputElementType.Date),
      values.receivedAt,
    );
  }
  if (values.certificatePath !== undefined) {
    await setInputFiles(
      page,
      getFormInputByLabel(dialogMaterialLotForm, MATERIAL_LOT_CERTIFICATE_LABEL, InputElementType.File),
      values.certificatePath,
    );
  }
}

// An edited Lote shows its values, a new one starts empty but for the date, which is the day it is received
export async function assertMaterialLotForm(page: Page, materialLot: BaseMaterialLot | null) {
  const { dialogMaterialLotForm } = getMaterialLotLocators(page);
  await expect(dialogMaterialLotForm).toBeVisible();
  await expect(getFormInputByLabel(dialogMaterialLotForm, HEAT_LABEL)).toHaveValue(materialLot?.heat ?? "");
  const unitTrigger = getFormInputByLabel(
    dialogMaterialLotForm,
    MATERIAL_LOT_UNIT_LABEL,
    InputElementType.Combobox,
  ).getByTestId("button-trigger");
  await (materialLot !== null
    ? expect(unitTrigger).toHaveText(MATERIAL_LOT_UNIT_LABELS[materialLot.unit])
    : expect(unitTrigger).toHaveText(SELECT_OPTION_PLACEHOLDER));
  await expect(
    getFormInputByLabel(dialogMaterialLotForm, MATERIAL_LOT_RECEIVED_QUANTITY_LABEL, InputElementType.Number),
  ).toHaveValue(materialLot !== null ? String(materialLot.receivedQuantity) : "");
  const receivedAtInput = getFormInputByLabel(
    dialogMaterialLotForm,
    MATERIAL_LOT_RECEIVED_AT_LABEL,
    InputElementType.Date,
  );
  await (materialLot !== null
    ? expect(receivedAtInput).toHaveAttribute("data-value", materialLot.receivedAt.toISOString())
    : expect(receivedAtInput).toHaveAttribute("data-value"));
  await expect(
    getFormInputByLabel(dialogMaterialLotForm, MATERIAL_LOT_CERTIFICATE_LABEL, InputElementType.File),
  ).toBeVisible();
}

export async function workflowOpenMaterialLotForm(page: Page, materialLotId?: number) {
  const { dialogMaterialLotForm, dialogMaterialLots, tableMaterialLots } = getMaterialLotLocators(page);
  await (materialLotId === undefined
    ? dialogMaterialLots.getByTestId("button-create-material-lot").click()
    : getTableRowByTestId(tableMaterialLots, materialLotId).getByTestId("button-edit").click());
  await expect(dialogMaterialLotForm).toBeVisible();
}

// Creates a Lote without an id, edits the one with it
export async function workflowSubmitMaterialLotForm(
  page: Page,
  values: TMaterialLotFormValues,
  materialLotId?: number,
) {
  const { dialogMaterialLotForm } = getMaterialLotLocators(page);
  await workflowOpenMaterialLotForm(page, materialLotId);
  await workflowFillMaterialLotForm(page, values);
  await dialogMaterialLotForm.getByTestId("button-submit").click();
}

export async function workflowDeleteMaterialLot(page: Page, materialLotId: number) {
  const { tableMaterialLots } = getMaterialLotLocators(page);
  await openAndConfirmAlertDialog(
    page,
    getTableRowByTestId(tableMaterialLots, materialLotId).getByTestId("button-delete"),
    "dialog-delete-model-content",
  );
}

export async function workflowOpenMaterialLotMovements(page: Page, materialLot: BaseMaterialLot) {
  const { dialogMaterialLotMovements, tableMaterialLots } = getMaterialLotLocators(page);
  await getTableRowByTestId(tableMaterialLots, materialLot.id).getByTestId("button-material-lot-movements").click();
  await expect(dialogMaterialLotMovements).toBeVisible();
  await expect(dialogMaterialLotMovements.getByRole("heading").first()).toContainText(materialLot.heat ?? "");
}

export async function workflowCloseDialog(dialog: Locator) {
  await dialog.getByTestId("button-close").click();
  await expect(dialog).not.toBeVisible();
}

export function getMaterialMovementButton(container: Locator, mode: MaterialLotMovementMode) {
  return container.getByTestId(`button-${mode}-material`);
}

export function getPartMaterial(container: Locator, materialId: number) {
  return container.getByTestId(`part-material-${materialId}`);
}

export function getMaterialMovementDialog(page: Page, mode: MaterialLotMovementMode) {
  return page.getByTestId(`dialog-${mode}-material`);
}

export async function workflowOpenMaterialMovement(page: Page, container: Locator, mode: MaterialLotMovementMode) {
  await getMaterialMovementButton(container, mode).click();
  const dialog = getMaterialMovementDialog(page, mode);
  await expect(dialog).toBeVisible();
  return dialog;
}

export function getMaterialMovementLotCombobox(dialog: Locator) {
  return getFormInputByLabel(dialog, MATERIAL_LOT_LABEL, InputElementType.Combobox);
}

export function getMaterialMovementQuantityInput(dialog: Locator) {
  return getFormInputByLabel(dialog, QUANTITY_LABEL, InputElementType.Number);
}

export async function assertMaterialMovementLotOptions(page: Page, dialog: Locator, optionTexts: Array<string>) {
  await openCombobox(getMaterialMovementLotCombobox(dialog));
  await assertComboboxOptionsCount(page, optionTexts.length);
  const options = page.getByTestId("combobox-list").locator("[role='option']");
  for (const optionText of optionTexts) {
    await expect(options.filter({ hasText: optionText })).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("combobox-list")).not.toBeVisible();
}

// The lot is only picked when given, a dialog with a single Lote starts with it. The dialog stays open when the
// movement is rejected
export async function workflowMoveMaterial(
  page: Page,
  container: Locator,
  {
    mode,
    quantity,
    materialLotOptionText,
  }: { mode: MaterialLotMovementMode; quantity: number | null; materialLotOptionText?: string },
) {
  const dialog = await workflowOpenMaterialMovement(page, container, mode);
  if (materialLotOptionText !== undefined) {
    await selectComboboxOption(page, getMaterialMovementLotCombobox(dialog), materialLotOptionText);
  }
  if (quantity !== null) {
    await getMaterialMovementQuantityInput(dialog).fill(String(quantity));
  }
  await dialog.getByTestId("button-submit").click();
  return dialog;
}

export type TMaterialLotMovementRow = Pick<
  BaseMaterialLotMovement,
  "id" | "date" | "quantity" | "productionOrderId" | "materialLotId"
>;

// The newest first
export async function assertMaterialLotMovementsTable(
  table: Locator,
  { movements, materialLots }: { movements: Array<TMaterialLotMovementRow>; materialLots: Array<BaseMaterialLot> },
) {
  if (movements.length === 0) {
    await expect(getTableNoDataRow(table)).toHaveText(NO_MATERIAL_USED_MESSAGE);
    return;
  }
  const sortedMovements = [...movements].sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id);
  await assertTableRowCount(table, sortedMovements.length);
  for (const [position, movement] of sortedMovements.entries()) {
    const materialLot = materialLots.find(({ id }) => id === movement.materialLotId)!;
    const row = getTableRowByPosition(table, position);
    await expect(row).toHaveAttribute("data-testid", String(movement.id));
    await expect(row.getByTestId("date")).toHaveText(formatDate(movement.date, DateFormat.Datetime)!);
    await expect(row.getByTestId("quantity")).toHaveText(
      MATERIAL_LOT_QUANTITY_MESSAGE(movement.quantity, materialLot.unit),
    );
    await expect(row.getByTestId("productionOrderId")).toHaveText(
      movement.productionOrderId !== null ? String(movement.productionOrderId) : "",
    );
  }
}

export function getMockMaterialLotMovementsOfProductionOrder(productionOrderId: number) {
  return mockMaterialLotMovements.filter((movement) => movement.productionOrderId === productionOrderId);
}

export async function getDbMaterialLotMovementsOfProductionOrder(db: TDatabase, productionOrderId: number) {
  return db
    .select()
    .from(dbTableMaterialLotMovement)
    .where(eq(dbTableMaterialLotMovement.productionOrderId, productionOrderId));
}

// Deleted with its movements, as if another user had removed it
export async function deleteDbMaterialLot(db: TDatabase, materialLotId: number) {
  await db.delete(dbTableMaterialLotMovement).where(eq(dbTableMaterialLotMovement.materialLotId, materialLotId));
  await db.delete(dbTableMaterialLot).where(eq(dbTableMaterialLot.id, materialLotId));
}

// Takes stock as if another user had taken it meanwhile
export async function takeDbMaterialLotStock(db: TDatabase, materialLotId: number, quantity: number) {
  await db
    .insert(dbTableMaterialLotMovement)
    .values({ date: new Date(), materialLotId, productionOrderId: null, quantity: -quantity });
}

export function getFieldLabelTooltip(container: Locator, label: string) {
  return container.locator("label", { hasText: label }).getByTestId("field-label-tooltip");
}
