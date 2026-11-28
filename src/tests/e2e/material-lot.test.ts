import fs from "node:fs";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { UserMode } from "@/contexts/app-context";
import {
  MATERIAL_LOT_MOVEMENT_USE_CONSTRAINT,
  MATERIAL_LOT_RECEIVED_QUANTITY_CONSTRAINT,
  dbTableMaterialLot,
  dbTableMaterialLotMovement,
} from "@/db/schema";
import { getMaterialCertificatePath } from "@/files/material-certificate";
import { startOfAppDay } from "@/lib/dates";
import { formatDate, formatUsedMaterialLot } from "@/lib/formatters";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { QUANTITY_LABEL } from "@/messages/common";
import {
  MATERIAL_LOT_CREATED_MESSAGE,
  MATERIAL_LOT_DELETED_MESSAGE,
  MATERIAL_LOT_EDITED_MESSAGE,
  MATERIAL_LOT_NOT_FOUND_MESSAGE,
  MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE,
  MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE,
  MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE,
  MATERIAL_LOT_WITH_MOVEMENTS_MESSAGE,
  MATERIAL_LOT_WITHOUT_STOCK_MESSAGE,
  MATERIAL_RETURNED_MESSAGE,
  MATERIAL_TAKEN_MESSAGE,
  ZERO_QUANTITY_HINT_MESSAGE,
} from "@/messages/material-lot";
import { PRODUCTION_ORDER_LABEL } from "@/messages/production-order";
import { getMaterialLotMovementFormSchema, materialLotFormSchema } from "@/schemas/material-lot";
import { ProductionOrderStatus } from "@/schemas/production-order";
import {
  DAY_IN_MS,
  MOCK_DATA_PATH,
  MOCK_INITIAL_DATE,
  mockMachineProductionOrderQueues,
  mockMachines,
  mockMaterialLots,
  mockMaterials,
  mockProductionOrders,
} from "@/tests/mock-data";
import { assertFormSchemaErrors } from "@/tests/utils/components/form";
import { getPopoverContent } from "@/tests/utils/components/popover";
import { getTableRowByTestId } from "@/tests/utils/components/table";
import { clearToasts, expectSingleSuccessToast, expectSingleToast, getToasts } from "@/tests/utils/components/toast";
import { expectCheckViolation } from "@/tests/utils/db";
import {
  expectRejectedMutation,
  httpRequestFailedEvent,
  invalidParamsEvent,
  expectRejectedToast,
} from "@/tests/utils/errors-log";
import { TestAnnotations, expectErrorsLog, setUserMode, test } from "@/tests/utils/fixtures";
import { getProductionOrdersByStatuses } from "@/tests/utils/mock-data-utils";
import { holdRequestWhile } from "@/tests/utils/trpc";
import {
  assertCertificateLink,
  assertMaterialLotForm,
  assertMaterialLotMovementsTable,
  assertMaterialLotRow,
  assertMaterialLotsTable,
  assertMaterialMovementLotOptions,
  deleteDbMaterialLot,
  getDbMaterialLot,
  getDbMaterialLotMovements,
  getDbMaterialLotRemaining,
  getFieldLabelTooltip,
  getMaterialLotLocators,
  getMaterialLotOptionText,
  getMaterialMovementButton,
  getMaterialMovementDialog,
  getMaterialMovementLotCombobox,
  getMaterialMovementQuantityInput,
  getMockMaterialLotMovements,
  getMockMaterialLotRemaining,
  getMockPartMaterialIds,
  getMockPickableMaterialLots,
  getPartMaterial,
  getNewDbMaterialLotMovements,
  getNewDbMaterialLots,
  takeDbMaterialLotStock,
  workflowCloseDialog,
  workflowDeleteMaterialLot,
  workflowFillMaterialLotForm,
  workflowMoveMaterial,
  workflowOpenMaterialLotForm,
  workflowOpenMaterialLotMovements,
  workflowOpenMaterialLots,
  workflowOpenMaterialMovement,
  workflowShowUsedUpMaterialLots,
  workflowSubmitMaterialLotForm,
} from "@/tests/workflows/material-lot";
import {
  workflowAssignMachineToProductionOrder,
  workflowOpenProduction,
  workflowStartProductionOrderFromQueue,
} from "@/tests/workflows/production";
import { MaterialLotMovementMode, MaterialLotUnit } from "@/types/material-lot";
import type { BaseMaterialLot } from "@/types/material-lot";

const SAMPLE_PDF_PATH = path.join(MOCK_DATA_PATH, "sample.pdf");
const OTHER_PDF_PATH = path.join(MOCK_DATA_PATH, "BLUEPRINTS", "2 - Casquillo separador", "ID-2-BLUEPRINT2.pdf");

const getMockRowState = (materialLot: BaseMaterialLot) => ({
  deletable: getMockMaterialLotMovements(materialLot.id).length === 0,
  materialLot,
  remaining: getMockMaterialLotRemaining(materialLot),
});

const getOtherMaterialLotUnit = (unit: MaterialLotUnit) =>
  Object.values(MaterialLotUnit).find((otherUnit) => otherUnit !== unit)!;

const getCertificateUrl = (materialLotId: number) => `/api/files/material-certificate/${materialLotId}`;

// The certificate opens in another tab, served as the PDF that was uploaded
async function assertCertificateServed(page: Page, materialLot: BaseMaterialLot, filePath: string) {
  const row = getTableRowByTestId(getMaterialLotLocators(page).tableMaterialLots, materialLot.id);
  const responsePromise = page
    .context()
    .waitForEvent("response", (response) => new URL(response.url()).pathname === getCertificateUrl(materialLot.id));
  const popupPromise = page.waitForEvent("popup");
  await row.getByTestId("link-material-certificate").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toContain(encodeURIComponent(materialLot.heat ?? materialLot.id));
  await (await popupPromise).close();
  expect(fs.readFileSync(getMaterialCertificatePath(materialLot.id))).toEqual(fs.readFileSync(filePath));
}

test("show the Lotes of every Material and their movements", async ({ page }) => {
  const { dialogMaterialLotMovements, tableMaterialLotMovements, tableMaterialLots } = getMaterialLotLocators(page);
  expect(
    mockMaterials.some((material) => mockMaterialLots.every((materialLot) => materialLot.materialId !== material.id)),
    "Wrong test set up: Some Material should have no Lotes",
  ).toBe(true);

  for (const material of mockMaterials) {
    const materialLots = mockMaterialLots.filter((materialLot) => materialLot.materialId === material.id);
    await test.step(`the Lotes of the Material ${material.id}, the used up ones only when asked`, async () => {
      await workflowOpenMaterialLots(page, material.id);
      await assertMaterialLotsTable(
        page,
        materialLots.filter((materialLot) => getMockMaterialLotRemaining(materialLot) > 0).map(getMockRowState),
      );
      await workflowShowUsedUpMaterialLots(page);
      await assertMaterialLotsTable(page, materialLots.map(getMockRowState));
    });

    for (const materialLot of materialLots) {
      await test.step(`the movements of the Lote ${materialLot.id}, which can only move its stock`, async () => {
        const remaining = getMockMaterialLotRemaining(materialLot);
        const row = getTableRowByTestId(tableMaterialLots, materialLot.id);
        await expect(getMaterialMovementButton(row, MaterialLotMovementMode.Take)).toBeEnabled({
          enabled: remaining > 0,
        });
        await expect(getMaterialMovementButton(row, MaterialLotMovementMode.Return)).toBeEnabled();
        await workflowOpenMaterialLotMovements(page, materialLot);
        await assertMaterialLotMovementsTable(tableMaterialLotMovements, {
          materialLots: mockMaterialLots,
          movements: getMockMaterialLotMovements(materialLot.id),
        });
        await workflowCloseDialog(dialogMaterialLotMovements);
      });
    }
  }
});

test(
  "add, edit and delete the Lotes of a Material with their certificates",
  { annotation: TestAnnotations.ResetMaterialCertificates },
  async ({ page, db }) => {
    const { dialogMaterialLotForm, tableMaterialLots } = getMaterialLotLocators(page);
    const materialId = mockMaterialLots[0].materialId;
    const visibleMockRows = mockMaterialLots
      .filter((materialLot) => materialLot.materialId === materialId && getMockMaterialLotRemaining(materialLot) > 0)
      .map(getMockRowState);

    await test.step("a new Lote needs its unit and a positive quantity, but not its Colada", async () => {
      await workflowOpenMaterialLots(page, materialId);
      await workflowOpenMaterialLotForm(page);
      await assertMaterialLotForm(page, null);
      const invalidValues = { receivedQuantity: 0 };
      await workflowFillMaterialLotForm(page, invalidValues);
      await assertFormSchemaErrors(dialogMaterialLotForm, materialLotFormSchema, {
        ...invalidValues,
        heat: null,
        id: null,
        materialId,
        receivedAt: MOCK_INITIAL_DATE,
        unit: null,
      });
      await workflowCloseDialog(dialogMaterialLotForm);
      expect(await getNewDbMaterialLots(db)).toEqual([]);
    });

    const receivedAt = new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 2);
    const lotWithoutCertificate = { receivedQuantity: 6, unit: MaterialLotUnit.Package };
    await test.step("add a Lote received another day, without its Colada or certificate", async () => {
      await workflowSubmitMaterialLotForm(page, { ...lotWithoutCertificate, receivedAt });
      await expectSingleSuccessToast(page, MATERIAL_LOT_CREATED_MESSAGE);
      await expect(dialogMaterialLotForm).not.toBeVisible();
      expect(await getNewDbMaterialLots(db)).toEqual([
        {
          ...lotWithoutCertificate,
          hasCertificate: false,
          heat: null,
          id: mockMaterialLots.length + 1,
          materialId,
          receivedAt: startOfAppDay(receivedAt),
        },
      ]);
      expect(fs.existsSync(getMaterialCertificatePath(mockMaterialLots.length + 1))).toBe(false);
    });

    const lotWithCertificate = { heat: "H-CERT", receivedQuantity: 30, unit: MaterialLotUnit.Bar };
    await test.step("add a Lote received today with its certificate, its Colada trimmed", async () => {
      // It starts empty, not with the values of the last Lote
      await workflowOpenMaterialLotForm(page);
      await assertMaterialLotForm(page, null);
      await workflowFillMaterialLotForm(page, {
        ...lotWithCertificate,
        certificatePath: SAMPLE_PDF_PATH,
        heat: `  ${lotWithCertificate.heat}  `,
      });
      await dialogMaterialLotForm.getByTestId("button-submit").click();
      await expectSingleSuccessToast(page, MATERIAL_LOT_CREATED_MESSAGE);

      const newMaterialLot = (await getNewDbMaterialLots(db))[1];
      expect(newMaterialLot).toEqual({
        ...lotWithCertificate,
        hasCertificate: true,
        id: mockMaterialLots.length + 2,
        materialId,
        receivedAt: expect.any(Date),
      });
      expect(formatDate(newMaterialLot.receivedAt)).toBe(formatDate(MOCK_INITIAL_DATE));
    });

    let newMaterialLots: Array<BaseMaterialLot> = [];
    await test.step("the new Lotes are listed by the day they were received, and the certificate opens", async () => {
      newMaterialLots = await getNewDbMaterialLots(db);
      await assertMaterialLotsTable(page, [
        ...visibleMockRows,
        ...newMaterialLots.map((materialLot) => ({
          deletable: true,
          materialLot,
          remaining: materialLot.receivedQuantity,
        })),
      ]);
      await assertCertificateServed(page, newMaterialLots[1], SAMPLE_PDF_PATH);
    });

    await test.step("edit every field of a Lote and add its certificate", async () => {
      const [materialLot] = newMaterialLots;
      await workflowOpenMaterialLotForm(page, materialLot.id);
      await assertMaterialLotForm(page, materialLot);
      const editedValues = { heat: "H-EDITED", receivedQuantity: 8, unit: MaterialLotUnit.Bar };
      const editedReceivedAt = new Date(MOCK_INITIAL_DATE.getTime() - DAY_IN_MS * 5);
      await workflowFillMaterialLotForm(page, {
        ...editedValues,
        certificatePath: SAMPLE_PDF_PATH,
        receivedAt: editedReceivedAt,
      });
      await dialogMaterialLotForm.getByTestId("button-submit").click();
      await expectSingleSuccessToast(page, MATERIAL_LOT_EDITED_MESSAGE);

      newMaterialLots[0] = {
        ...materialLot,
        ...editedValues,
        hasCertificate: true,
        receivedAt: startOfAppDay(editedReceivedAt),
      };
      expect(await getDbMaterialLot(db, materialLot.id)).toEqual(newMaterialLots[0]);
      await assertMaterialLotRow(tableMaterialLots, {
        deletable: true,
        materialLot: newMaterialLots[0],
        remaining: editedValues.receivedQuantity,
      });
      await assertCertificateServed(page, newMaterialLots[0], SAMPLE_PDF_PATH);
    });

    await test.step("an edit without a file keeps the certificate, and one with a file replaces it", async () => {
      const keptHeat = "H-CERT-KEPT";
      await workflowSubmitMaterialLotForm(page, { heat: keptHeat }, newMaterialLots[1].id);
      await expectSingleSuccessToast(page, MATERIAL_LOT_EDITED_MESSAGE);
      newMaterialLots[1] = { ...newMaterialLots[1], heat: keptHeat };
      expect(await getDbMaterialLot(db, newMaterialLots[1].id)).toEqual(newMaterialLots[1]);
      // Not opened again: the browser would revalidate the unchanged file instead of downloading it
      await assertCertificateLink(getTableRowByTestId(tableMaterialLots, newMaterialLots[1].id), newMaterialLots[1]);
      expect(fs.readFileSync(getMaterialCertificatePath(newMaterialLots[1].id))).toEqual(
        fs.readFileSync(SAMPLE_PDF_PATH),
      );

      // The form does not keep the file picked the last time it was open
      await workflowSubmitMaterialLotForm(page, { certificatePath: OTHER_PDF_PATH }, newMaterialLots[1].id);
      await expectSingleSuccessToast(page, MATERIAL_LOT_EDITED_MESSAGE);
      expect(await getDbMaterialLot(db, newMaterialLots[1].id)).toEqual(newMaterialLots[1]);
      await assertCertificateServed(page, newMaterialLots[1], OTHER_PDF_PATH);

      await workflowSubmitMaterialLotForm(page, { heat: "  " }, newMaterialLots[1].id);
      await expectSingleSuccessToast(page, MATERIAL_LOT_EDITED_MESSAGE);
      newMaterialLots[1] = { ...newMaterialLots[1], heat: null };
      expect(await getDbMaterialLot(db, newMaterialLots[1].id)).toEqual(newMaterialLots[1]);
    });

    await test.step("a Lote taken from meanwhile neither changes its unit nor receives less than was taken", async () => {
      const materialLot = newMaterialLots[1];
      const takenQuantity = 10;
      await holdRequestWhile({
        meanwhile: async () => takeDbMaterialLotStock(db, materialLot.id, takenQuantity),
        page,
        procedurePath: "materialLot.update",
        send: async () =>
          workflowSubmitMaterialLotForm(page, { unit: getOtherMaterialLotUnit(materialLot.unit) }, materialLot.id),
      });
      await expectRejectedToast(page, {
        code: "BAD_REQUEST",
        message: MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE,
        procedurePath: "materialLot.update",
        formData: true,
      });
      expect(await getDbMaterialLot(db, materialLot.id)).toEqual(materialLot);
      await workflowCloseDialog(dialogMaterialLotForm);

      await workflowSubmitMaterialLotForm(page, { receivedQuantity: takenQuantity - 1 }, materialLot.id);
      await expectSingleToast(page, MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE(takenQuantity));
      expectRejectedMutation({
        code: "BAD_REQUEST",
        message: MATERIAL_LOT_RECEIVED_BELOW_TAKEN_MESSAGE(takenQuantity),
        procedurePath: "materialLot.update",
        formData: true,
      });
      expect(await getDbMaterialLot(db, materialLot.id)).toEqual(materialLot);
      await workflowCloseDialog(dialogMaterialLotForm);

      await workflowSubmitMaterialLotForm(page, { receivedQuantity: takenQuantity }, materialLot.id);
      await expectSingleSuccessToast(page, MATERIAL_LOT_EDITED_MESSAGE);
      newMaterialLots[1] = { ...materialLot, receivedQuantity: takenQuantity };
      expect(await getDbMaterialLot(db, materialLot.id)).toEqual(newMaterialLots[1]);
      expect(await getDbMaterialLotRemaining(db, materialLot.id)).toBe(0);
      // Used up, and with movements that keep its history, so it can no longer be deleted
      await expect(getTableRowByTestId(tableMaterialLots, materialLot.id)).toHaveCount(0);
      await workflowShowUsedUpMaterialLots(page);
      await assertMaterialLotRow(tableMaterialLots, {
        deletable: false,
        materialLot: newMaterialLots[1],
        remaining: 0,
      });
    });

    await test.step("a Lote with movements keeps its unit, and the error links the Órdenes de producción that used it", async () => {
      const [materialLot] = mockMaterialLots;
      const productionOrderIds = [
        ...new Set(
          getMockMaterialLotMovements(materialLot.id).flatMap(({ productionOrderId }) => productionOrderId ?? []),
        ),
      ];
      expect(
        productionOrderIds.length,
        "Wrong test set up: An Orden de producción should use the Lote",
      ).toBeGreaterThan(0);
      await workflowSubmitMaterialLotForm(page, { unit: getOtherMaterialLotUnit(materialLot.unit) }, materialLot.id);

      const toast = getToasts(page);
      for (const productionOrderId of productionOrderIds) {
        const link = toast.getByTestId(`button-link-production-order-${productionOrderId}`);
        await expect(link).toHaveText(`${PRODUCTION_ORDER_LABEL} ${productionOrderId}`);
        const popupPromise = page.waitForEvent("popup");
        await link.click();
        const popup = await popupPromise;
        await expect(popup).toHaveURL((url) => url.pathname === `/production-order/${productionOrderId}`);
        await popup.close();
      }
      await expectSingleToast(page, MATERIAL_LOT_UNIT_WITH_MOVEMENTS_MESSAGE);
      expect(await getDbMaterialLot(db, materialLot.id)).toEqual(materialLot);
      await workflowCloseDialog(dialogMaterialLotForm);
    });

    await test.step("delete a Lote and its certificate", async () => {
      const [materialLot] = newMaterialLots;
      await workflowDeleteMaterialLot(page, materialLot.id);
      await expectSingleSuccessToast(page, MATERIAL_LOT_DELETED_MESSAGE);
      await expect(getTableRowByTestId(tableMaterialLots, materialLot.id)).toHaveCount(0);
      expect(await getDbMaterialLot(db, materialLot.id)).toBeUndefined();
      expect(fs.existsSync(getMaterialCertificatePath(materialLot.id))).toBe(false);
    });

    await test.step("a certificate that is not there is not served", async () => {
      const [deletedMaterialLot, materialLotWithCertificate] = newMaterialLots;
      const withoutCertificateUrl = getCertificateUrl(mockMaterialLots[0].id);
      const deletedUrl = getCertificateUrl(deletedMaterialLot.id);
      const invalidUrl = "/api/files/material-certificate/invalid";
      const missingFileUrl = getCertificateUrl(materialLotWithCertificate.id);
      fs.rmSync(getMaterialCertificatePath(materialLotWithCertificate.id));

      expect((await page.goto(withoutCertificateUrl))?.status()).toBe(404);
      expect((await page.goto(deletedUrl))?.status()).toBe(404);
      expect((await page.goto(invalidUrl))?.status()).toBe(400);
      expect((await page.goto(missingFileUrl))?.status()).toBe(500);
      expectErrorsLog(
        httpRequestFailedEvent("GET", 404, withoutCertificateUrl),
        httpRequestFailedEvent("GET", 404, deletedUrl),
        invalidParamsEvent(LogMessages.invalidId, { id: "invalid" }),
        httpRequestFailedEvent("GET", 400, invalidUrl),
        {
          error: expect.objectContaining({ code: "ENOENT" }),
          id: materialLotWithCertificate.id,
          level: LoggerLevels.error,
          message: LogMessages.materialCertificateReadFailed,
        },
        httpRequestFailedEvent("GET", 500, missingFileUrl),
      );
    });

    await test.step("a Lote that changed meanwhile is neither deleted nor edited", async () => {
      const deletableMaterialLot = mockMaterialLots.find(
        (materialLot) => getMockMaterialLotMovements(materialLot.id).length === 0,
      )!;
      expect(deletableMaterialLot, "Wrong test set up: Some Lote should have no movements").toBeDefined();
      await workflowOpenMaterialLots(page, deletableMaterialLot.materialId);

      await holdRequestWhile({
        meanwhile: async () => takeDbMaterialLotStock(db, deletableMaterialLot.id, 1),
        page,
        procedurePath: "materialLot.delete",
        send: async () => workflowDeleteMaterialLot(page, deletableMaterialLot.id),
      });
      await expectRejectedToast(page, {
        code: "BAD_REQUEST",
        message: MATERIAL_LOT_WITH_MOVEMENTS_MESSAGE,
        procedurePath: "materialLot.delete",
      });
      expect(await getDbMaterialLot(db, deletableMaterialLot.id)).toEqual(deletableMaterialLot);
      // The movement taken meanwhile shows up, and with it the Lote can no longer be deleted
      await assertMaterialLotRow(tableMaterialLots, {
        deletable: false,
        materialLot: deletableMaterialLot,
        remaining: deletableMaterialLot.receivedQuantity - 1,
      });

      await holdRequestWhile({
        meanwhile: async () => deleteDbMaterialLot(db, deletableMaterialLot.id),
        page,
        procedurePath: "materialLot.update",
        send: async () => workflowSubmitMaterialLotForm(page, { heat: "H-GONE" }, deletableMaterialLot.id),
      });
      await expectSingleToast(page, MATERIAL_LOT_NOT_FOUND_MESSAGE(deletableMaterialLot.id));
      expectRejectedMutation({
        code: "NOT_FOUND",
        message: MATERIAL_LOT_NOT_FOUND_MESSAGE(deletableMaterialLot.id),
        procedurePath: "materialLot.update",
        formData: true,
      });
      expect(await getDbMaterialLot(db, deletableMaterialLot.id)).toBeUndefined();
    });

    await test.step("the database holds the same rules for the rows that do not come through the app", async () => {
      const { id: materialLotId, ...materialLot } = mockMaterialLots[0];
      await expectCheckViolation(
        db.insert(dbTableMaterialLot).values({ ...materialLot, receivedQuantity: 0 }),
        MATERIAL_LOT_RECEIVED_QUANTITY_CONSTRAINT,
      );
      await expectCheckViolation(
        db
          .insert(dbTableMaterialLotMovement)
          .values({ date: new Date(), materialLotId, productionOrderId: null, quantity: 0 }),
        MATERIAL_LOT_MOVEMENT_USE_CONSTRAINT,
      );
    });
  },
);

test("take and return the stock of a Lote without an Orden de producción", async ({ page, db }) => {
  const { dialogMaterialLotMovements, tableMaterialLotMovements, tableMaterialLots } = getMaterialLotLocators(page);
  const materialLot = mockMaterialLots.find(
    (mockMaterialLot) =>
      getMockMaterialLotMovements(mockMaterialLot.id).length > 0 && getMockMaterialLotRemaining(mockMaterialLot) > 1,
  )!;
  expect(materialLot, "Wrong test set up: Some Lote should have stock and movements").toBeDefined();
  const takeSchema = getMaterialLotMovementFormSchema(MaterialLotMovementMode.Take, null);
  let remaining = getMockMaterialLotRemaining(materialLot);
  const row = getTableRowByTestId(tableMaterialLots, materialLot.id);
  const assertMovements = async () => {
    await workflowOpenMaterialLotMovements(page, materialLot);
    await assertMaterialLotMovementsTable(tableMaterialLotMovements, {
      materialLots: mockMaterialLots,
      movements: await getDbMaterialLotMovements(db, { materialLotId: materialLot.id }),
    });
    await workflowCloseDialog(dialogMaterialLotMovements);
    expect(await getDbMaterialLotRemaining(db, materialLot.id)).toBe(remaining);
  };
  const expectStockExceeded = async (dialog: ReturnType<typeof getMaterialMovementDialog>) => {
    await expectSingleToast(page, MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE(remaining));
    expectRejectedMutation({
      code: "BAD_REQUEST",
      message: MATERIAL_LOT_STOCK_EXCEEDED_MESSAGE(remaining),
      procedurePath: "materialLot.move",
    });
    await workflowCloseDialog(dialog);
    await assertMovements();
  };

  await test.step("without an Orden de producción the quantity must be positive", async () => {
    await workflowOpenMaterialLots(page, materialLot.materialId);
    const dialog = await workflowOpenMaterialMovement(page, row, MaterialLotMovementMode.Take);
    // The Lote of the row is shown, not picked, and nothing hints at recording a use
    await expect(getMaterialMovementLotCombobox(dialog)).toHaveCount(0);
    await expect(dialog.getByTestId("material-lot")).toHaveText(getMaterialLotOptionText(materialLot, remaining));
    await expect(getFieldLabelTooltip(dialog, QUANTITY_LABEL)).toHaveCount(0);
    await expect(dialog.getByTestId("button-submit")).toBeDisabled();
    await getMaterialMovementQuantityInput(dialog).fill("0");
    await assertFormSchemaErrors(dialog, takeSchema, { materialLotId: materialLot.id, quantity: 0 });
    await workflowCloseDialog(dialog);
    expect(await getNewDbMaterialLotMovements(db)).toEqual([]);
  });

  await test.step("take never beyond what the Lote holds, return beyond what it was received with", async () => {
    await workflowMoveMaterial(page, row, { mode: MaterialLotMovementMode.Take, quantity: 1 });
    await expectSingleSuccessToast(page, MATERIAL_TAKEN_MESSAGE);
    remaining -= 1;
    expect(await getNewDbMaterialLotMovements(db)).toEqual([
      {
        date: expect.any(Date),
        id: expect.any(Number),
        materialLotId: materialLot.id,
        productionOrderId: null,
        quantity: -1,
      },
    ]);
    await assertMovements();

    await expectStockExceeded(
      await workflowMoveMaterial(page, row, { mode: MaterialLotMovementMode.Take, quantity: remaining + 1 }),
    );

    // It starts without the quantity of the rejected take
    const takeDialog = await workflowOpenMaterialMovement(page, row, MaterialLotMovementMode.Take);
    await expect(getMaterialMovementQuantityInput(takeDialog)).toHaveValue("");
    await workflowCloseDialog(takeDialog);

    // A Lote can hold more than it was received with
    const returnedQuantity = materialLot.receivedQuantity - remaining + 1;
    await workflowMoveMaterial(page, row, { mode: MaterialLotMovementMode.Return, quantity: returnedQuantity });
    await expectSingleSuccessToast(page, MATERIAL_RETURNED_MESSAGE);
    remaining += returnedQuantity;
    await assertMovements();
  });

  await test.step("taking all its stock uses the Lote up", async () => {
    await workflowMoveMaterial(page, row, { mode: MaterialLotMovementMode.Take, quantity: remaining });
    await expectSingleSuccessToast(page, MATERIAL_TAKEN_MESSAGE);
    remaining = 0;
    await expect(row).toHaveCount(0);
    await workflowShowUsedUpMaterialLots(page);
    await assertMaterialLotRow(tableMaterialLots, { deletable: false, materialLot, remaining: 0 });
    await expect(getMaterialMovementButton(row, MaterialLotMovementMode.Take)).toBeDisabled();
    await expect(getMaterialMovementButton(row, MaterialLotMovementMode.Return)).toBeEnabled();
    await assertMovements();
  });

  await test.step("a Lote emptied or deleted meanwhile does not move", async () => {
    const otherMaterialLot = mockMaterialLots.find(
      (mockMaterialLot) => getMockMaterialLotMovements(mockMaterialLot.id).length === 0,
    )!;
    expect(otherMaterialLot, "Wrong test set up: Some Lote should have no movements").toBeDefined();
    const movementsBefore = await getNewDbMaterialLotMovements(db);
    await workflowOpenMaterialLots(page, otherMaterialLot.materialId);
    await workflowShowUsedUpMaterialLots(page);
    const otherRow = getTableRowByTestId(tableMaterialLots, otherMaterialLot.id);

    await clearToasts(page);
    await holdRequestWhile({
      meanwhile: async () => takeDbMaterialLotStock(db, otherMaterialLot.id, otherMaterialLot.receivedQuantity),
      page,
      procedurePath: "materialLot.move",
      send: async () => {
        await workflowMoveMaterial(page, otherRow, { mode: MaterialLotMovementMode.Take, quantity: 1 });
      },
    });
    await expectRejectedToast(page, {
      code: "BAD_REQUEST",
      message: MATERIAL_LOT_WITHOUT_STOCK_MESSAGE,
      procedurePath: "materialLot.move",
    });
    await workflowCloseDialog(getMaterialMovementDialog(page, MaterialLotMovementMode.Take));
    expect(await getDbMaterialLotRemaining(db, otherMaterialLot.id)).toBe(0);

    await holdRequestWhile({
      meanwhile: async () => deleteDbMaterialLot(db, otherMaterialLot.id),
      page,
      procedurePath: "materialLot.move",
      send: async () => {
        await workflowMoveMaterial(page, otherRow, { mode: MaterialLotMovementMode.Return, quantity: 1 });
      },
    });
    await expectSingleToast(page, MATERIAL_LOT_NOT_FOUND_MESSAGE(otherMaterialLot.id));
    expectRejectedMutation({
      code: "NOT_FOUND",
      message: MATERIAL_LOT_NOT_FOUND_MESSAGE(otherMaterialLot.id),
      procedurePath: "materialLot.move",
    });
    expect(await getNewDbMaterialLotMovements(db)).toEqual(movementsBefore);
  });
});

test(
  "take the material of the active Orden de producción of a Máquina from the Materiales of its Artículo",
  { annotation: TestAnnotations.UserModeMachine },
  async ({ page, db }) => {
    const machine = mockMachines.find((mockMachine) => mockMachine.activeProductionOrderId !== null)!;
    const productionOrder = mockProductionOrders.find(({ id }) => id === machine.activeProductionOrderId)!;
    const [takenMaterialId, usedMaterialId] = getMockPartMaterialIds(productionOrder.partId).filter(
      (materialId) => getMockPickableMaterialLots(materialId).length > 0,
    );
    expect(usedMaterialId, "Wrong test set up: Two Materiales of the Artículo should have stock").toBeDefined();
    const [takenMaterialLot] = getMockPickableMaterialLots(takenMaterialId);
    const [usedMaterialLot] = getMockPickableMaterialLots(usedMaterialId);
    expect(
      mockMaterialLots.length,
      "Wrong test set up: Some Lote should be used up or of another Material",
    ).toBeGreaterThan(2);
    const remainingOf = new Map(
      mockMaterialLots.map((materialLot) => [materialLot.id, getMockMaterialLotRemaining(materialLot)]),
    );
    const getOptionText = (materialLot: BaseMaterialLot) =>
      getMaterialLotOptionText(materialLot, remainingOf.get(materialLot.id)!);
    const container = page.getByTestId("container-production");
    const takenMaterial = getPartMaterial(container, takenMaterialId);
    const usedMaterial = getPartMaterial(container, usedMaterialId);
    const assertRemaining = async () => {
      for (const materialLot of [takenMaterialLot, usedMaterialLot]) {
        expect(await getDbMaterialLotRemaining(db, materialLot.id)).toBe(remainingOf.get(materialLot.id));
      }
    };

    await test.step("each Material lists only its own Lotes with stock", async () => {
      await workflowOpenProduction(page, machine);
      for (const [material, materialLot] of [
        [takenMaterial, takenMaterialLot],
        [usedMaterial, usedMaterialLot],
      ] as const) {
        const dialog = await workflowOpenMaterialMovement(page, material, MaterialLotMovementMode.Take);
        await assertMaterialMovementLotOptions(
          page,
          dialog,
          getMockPickableMaterialLots(materialLot.materialId).map(getOptionText),
        );
        await workflowCloseDialog(dialog);
      }
    });

    await test.step("the quantity cannot be negative, and 0 or none is hinted as a use without taking stock", async () => {
      const dialog = await workflowOpenMaterialMovement(page, takenMaterial, MaterialLotMovementMode.Take);
      await getFieldLabelTooltip(dialog, QUANTITY_LABEL).hover();
      await expect(getPopoverContent(page)).toHaveText(ZERO_QUANTITY_HINT_MESSAGE);
      await page.mouse.move(0, 0);
      await expect(getPopoverContent(page)).not.toBeVisible();

      await getMaterialMovementQuantityInput(dialog).fill("-1");
      await expect(getMaterialMovementQuantityInput(dialog)).toHaveValue("1");
      await workflowCloseDialog(dialog);
      expect(await getNewDbMaterialLotMovements(db)).toEqual([]);
    });

    await test.step("take a package of a Material and record a Colada of another used without taking stock", async () => {
      await workflowMoveMaterial(page, takenMaterial, { mode: MaterialLotMovementMode.Take, quantity: 1 });
      await expectSingleSuccessToast(page, MATERIAL_TAKEN_MESSAGE);
      remainingOf.set(takenMaterialLot.id, remainingOf.get(takenMaterialLot.id)! - 1);
      await assertRemaining();
      await expect(takenMaterial.getByTestId(`used-material-lot-${takenMaterialLot.id}`)).toHaveText(
        formatUsedMaterialLot(takenMaterialLot, 1),
      );
      await expect(usedMaterial.getByTestId(/^used-material-lot-/)).toHaveCount(0);

      // An empty quantity is the same as 0
      await workflowMoveMaterial(page, usedMaterial, { mode: MaterialLotMovementMode.Take, quantity: null });
      await expectSingleSuccessToast(page, MATERIAL_TAKEN_MESSAGE);
      await assertRemaining();
      await expect(usedMaterial.getByTestId(`used-material-lot-${usedMaterialLot.id}`)).toHaveText(
        formatUsedMaterialLot(usedMaterialLot, 0),
      );

      const newMovement = { date: expect.any(Date), id: expect.any(Number), productionOrderId: productionOrder.id };
      expect(await getNewDbMaterialLotMovements(db)).toEqual([
        { ...newMovement, materialLotId: takenMaterialLot.id, quantity: -1 },
        { ...newMovement, materialLotId: usedMaterialLot.id, quantity: 0 },
      ]);
    });

    await test.step("recording again a Colada the order already moved stores no new movement", async () => {
      const movementsBefore = await getNewDbMaterialLotMovements(db);
      for (const material of [takenMaterial, usedMaterial]) {
        await workflowMoveMaterial(page, material, { mode: MaterialLotMovementMode.Take, quantity: 0 });
        await expectSingleSuccessToast(page, MATERIAL_TAKEN_MESSAGE);
      }
      await assertRemaining();
      expect(await getNewDbMaterialLotMovements(db)).toEqual(movementsBefore);
    });

    await test.step("a Colada emptied meanwhile cannot be recorded as used", async () => {
      await holdRequestWhile({
        meanwhile: async () => takeDbMaterialLotStock(db, usedMaterialLot.id, remainingOf.get(usedMaterialLot.id)!),
        page,
        procedurePath: "materialLot.move",
        send: async () => {
          await workflowMoveMaterial(page, usedMaterial, { mode: MaterialLotMovementMode.Take, quantity: 0 });
        },
      });
      await expectRejectedToast(page, {
        code: "BAD_REQUEST",
        message: MATERIAL_LOT_WITHOUT_STOCK_MESSAGE,
        procedurePath: "materialLot.move",
        userConfig: { machineId: machine.id, userMode: UserMode.Machine },
      });
      await workflowCloseDialog(getMaterialMovementDialog(page, MaterialLotMovementMode.Take));
      remainingOf.set(usedMaterialLot.id, 0);
      await assertRemaining();
    });

    await test.step("the page of the Orden de producción offers the same for each Material of its Artículo", async () => {
      await setUserMode(page, UserMode.Admin);
      await page.goto(`/production-order/${productionOrder.id}`);
      for (const materialId of getMockPartMaterialIds(productionOrder.partId)) {
        await expect(
          getMaterialMovementButton(getPartMaterial(page.locator("body"), materialId), MaterialLotMovementMode.Take),
        ).toBeVisible();
      }
    });
  },
);

test(
  "an Artículo without Materiales has nothing to take, and one whose Materiales have no stock takes none",
  { annotation: TestAnnotations.UserModeMachine },
  async ({ page }) => {
    const idleMachines = mockMachines.filter((machine) => machine.activeProductionOrderId === null);
    const [machineWithoutMaterials, productionOrderWithoutMaterials] =
      idleMachines
        .map((machine) => {
          const queue = mockMachineProductionOrderQueues.filter(({ machineId }) => machineId === machine.id);
          const productionOrder = mockProductionOrders.find(
            ({ id, partId }) =>
              queue.some((item) => item.productionOrderId === id) && getMockPartMaterialIds(partId).length === 0,
          );
          return [machine, productionOrder] as const;
        })
        .find(([, productionOrder]) => productionOrder !== undefined) ?? [];
    expect(
      productionOrderWithoutMaterials,
      "Wrong test set up: An idle Máquina should queue an Artículo without Materiales",
    ).toBeDefined();
    const otherIdleMachine = idleMachines.find((machine) => machine.id !== machineWithoutMaterials!.id)!;
    const productionOrderWithoutStock = (await getProductionOrdersByStatuses([ProductionOrderStatus.Pending])).find(
      (productionOrder) => {
        const materialIds = getMockPartMaterialIds(productionOrder.partId);
        return (
          materialIds.length > 0 &&
          materialIds.every((materialId) => getMockPickableMaterialLots(materialId).length === 0)
        );
      },
    )!;
    expect(
      productionOrderWithoutStock,
      "Wrong test set up: A pending Orden de producción should have no stock of its Materiales",
    ).toBeDefined();
    const container = page.getByTestId("container-production");

    await test.step("no Material means nothing to take", async () => {
      await workflowStartProductionOrderFromQueue(page, machineWithoutMaterials!, productionOrderWithoutMaterials!.id);
      await expect(getMaterialMovementButton(container, MaterialLotMovementMode.Take)).toHaveCount(0);
    });

    await test.step("nothing can be taken without stock of its Materiales", async () => {
      await workflowAssignMachineToProductionOrder(page, productionOrderWithoutStock.id, otherIdleMachine);
      await workflowStartProductionOrderFromQueue(page, otherIdleMachine, productionOrderWithoutStock.id);
      for (const materialId of getMockPartMaterialIds(productionOrderWithoutStock.partId)) {
        await expect(
          getMaterialMovementButton(getPartMaterial(container, materialId), MaterialLotMovementMode.Take),
        ).toBeDisabled();
      }
    });
  },
);
