import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { dbTablePrinter } from "@/db/schema";
import { IPP_PORT } from "@/files/printer";
import { AUDIT_REDACTED_VALUE } from "@/logging/audit";
import { LoggerLevels, LogMessages } from "@/logging/types";
import {
  PRINTER_CREATED_MESSAGE,
  PRINTER_NOT_RESPONDING_MESSAGE,
  PRINTER_PASSWORD_LABEL,
  PRINTER_REACHABLE_MESSAGE,
} from "@/messages/printer";
import { readAuditLog } from "@/tests/utils/audit-log";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { filterByExactText, getTableRows } from "@/tests/utils/components/table";
import { expectSingleSuccessToast, expectSingleToast } from "@/tests/utils/components/toast";
import { rejectedMutationEvents } from "@/tests/utils/errors-log";
import { expectErrorsLog, test } from "@/tests/utils/fixtures";
import {
  getMockPrinterShareCredentials,
  MOCK_LABELS_SHARE_NAME,
  MOCK_OFFLINE_PRINTER_HOST,
  MOCK_PRINTER_HOST,
  MOCK_PRINTER_SHARE_HOST,
  MOCK_REJECTING_PRINTER_HOST,
} from "@/tests/utils/mock-printer";
import {
  findPrinterRow,
  getDialogCreateEditPrinter,
  getTablePrinter,
  MAINTENANCE_PRINTER_URL,
  workflowCreatePrinter,
  workflowDeletePrinter,
  workflowEditPrinter,
  workflowFillPrinter,
  workflowOpenCreatePrinter,
  workflowPingPrinter,
} from "@/tests/workflows/printer";
import { PrinterKind } from "@/types/printer";

test("manage the Impresoras", async ({ page, db }) => {
  const dialogCreateEditPrinter = getDialogCreateEditPrinter(page);
  const printer = { address: MOCK_PRINTER_HOST, name: "Oficina" };

  await page.goto(MAINTENANCE_PRINTER_URL);

  await test.step("reject an address that is not only a host", async () => {
    await workflowOpenCreatePrinter(page);
    for (const address of [
      `http://${MOCK_PRINTER_HOST}`,
      `${MOCK_PRINTER_HOST}:${IPP_PORT}`,
      `${MOCK_PRINTER_HOST}/ipp`,
      "mock printer",
      " ",
    ]) {
      await workflowFillPrinter(page, { address, name: printer.name });
      await expect(dialogCreateEditPrinter).toBeVisible();
    }
    expect(await db.select().from(dbTablePrinter).orderBy(dbTablePrinter.id)).toHaveLength(0);
  });

  await test.step("create an Impresora, trimming its fields, and check that it answers", async () => {
    await workflowFillPrinter(page, { address: ` ${printer.address} `, name: ` ${printer.name} ` });
    await expect(dialogCreateEditPrinter).not.toBeVisible();
    await expectSingleSuccessToast(page, PRINTER_CREATED_MESSAGE);
    await workflowCreatePrinter(page, { address: MOCK_REJECTING_PRINTER_HOST, name: "Taller" });
    await expect(getTableRows(getTablePrinter(page))).toHaveCount(2);
    expect(await db.select().from(dbTablePrinter).orderBy(dbTablePrinter.id)).toMatchObject([
      printer,
      { name: "Taller" },
    ]);

    await workflowPingPrinter(page, printer.name);
    await expectSingleSuccessToast(page, PRINTER_REACHABLE_MESSAGE(printer.name));
    // The ping only asks the Impresora for its state, so one that refuses every job still answers
    await workflowPingPrinter(page, "Taller");
    await expectSingleSuccessToast(page, PRINTER_REACHABLE_MESSAGE("Taller"));
  });

  await test.step("an Impresora edited to an address that does not answer fails its ping", async () => {
    const editedPrinter = { address: MOCK_OFFLINE_PRINTER_HOST, name: "Almacén" };
    await workflowEditPrinter(page, printer.name, editedPrinter);
    const [{ id: printerId }] = await db
      .select()
      .from(dbTablePrinter)
      .where(eq(dbTablePrinter.name, editedPrinter.name));
    expect(await db.select().from(dbTablePrinter).orderBy(dbTablePrinter.id)).toMatchObject([
      editedPrinter,
      { name: "Taller" },
    ]);

    const message = PRINTER_NOT_RESPONDING_MESSAGE(editedPrinter.name);
    expectErrorsLog(
      { error: expect.any(Object), level: LoggerLevels.error, message: LogMessages.printerPingFailed, printerId },
      ...rejectedMutationEvents({
        code: "INTERNAL_SERVER_ERROR",
        message,
        procedurePath: "printer.ping",
        serverError: null,
      }),
    );
    await workflowPingPrinter(page, editedPrinter.name);
    await expectSingleToast(page, message);
  });

  await test.step("a label printer shared by a Windows computer needs its share and its labels, and hides its password", async () => {
    const labelPrinter = {
      ...getMockPrinterShareCredentials(),
      address: MOCK_PRINTER_SHARE_HOST,
      kind: PrinterKind.IntermecShare,
      labelLengthMm: 107,
      labelWidthMm: 52,
      name: "Etiquetas",
      shareName: MOCK_LABELS_SHARE_NAME,
    };
    const getLabelPrinter = async () =>
      (await db.select().from(dbTablePrinter).where(eq(dbTablePrinter.name, labelPrinter.name))).at(0);

    await workflowOpenCreatePrinter(page);
    await workflowFillPrinter(page, {
      address: labelPrinter.address,
      kind: labelPrinter.kind,
      name: labelPrinter.name,
    });
    await expect(dialogCreateEditPrinter).toBeVisible();
    // The share is only its name, not the path Windows writes
    await workflowFillPrinter(page, {
      ...labelPrinter,
      shareName: `\\\\${MOCK_PRINTER_SHARE_HOST}\\${MOCK_LABELS_SHARE_NAME}`,
    });
    await expect(dialogCreateEditPrinter).toBeVisible();
    expect(await getLabelPrinter()).toBeUndefined();

    await workflowFillPrinter(page, labelPrinter);
    await expect(dialogCreateEditPrinter).not.toBeVisible();
    await expectSingleSuccessToast(page, PRINTER_CREATED_MESSAGE);
    expect(await getLabelPrinter()).toMatchObject(labelPrinter);
    // The audit log records the creation but never the password
    const auditLog = await readAuditLog();
    expect(auditLog).toContainEqual(
      expect.objectContaining({
        ok: true,
        isAdmin: true,
        input: expect.objectContaining({ name: labelPrinter.name, password: AUDIT_REDACTED_VALUE }),
      }),
    );
    expect(JSON.stringify(auditLog)).not.toContain(labelPrinter.password);
    await workflowPingPrinter(page, labelPrinter.name);
    await expectSingleSuccessToast(page, PRINTER_REACHABLE_MESSAGE(labelPrinter.name));

    // The form never shows the password, and leaving it empty keeps it
    await (await findPrinterRow(page, labelPrinter.name)).getByTestId("button-edit").click();
    await assertFormLoaded(dialogCreateEditPrinter);
    await expect(getFormInputByLabel(dialogCreateEditPrinter, PRINTER_PASSWORD_LABEL)).toHaveValue("");
    await dialogCreateEditPrinter.getByTestId("button-close").click();
    await expect(dialogCreateEditPrinter).not.toBeVisible();
    await workflowEditPrinter(page, labelPrinter.name, { ...labelPrinter, labelWidthMm: 50, password: undefined });
    expect(await getLabelPrinter()).toMatchObject({ ...labelPrinter, labelWidthMm: 50 });

    const { id: printerId } = (await getLabelPrinter())!;
    const message = PRINTER_NOT_RESPONDING_MESSAGE(labelPrinter.name);
    expectErrorsLog(
      { error: expect.any(Object), level: LoggerLevels.error, message: LogMessages.printerPingFailed, printerId },
      ...rejectedMutationEvents({
        code: "INTERNAL_SERVER_ERROR",
        message,
        procedurePath: "printer.ping",
        serverError: null,
      }),
    );
    await workflowEditPrinter(page, labelPrinter.name, { ...labelPrinter, password: "wrong-password" });
    expect(await getLabelPrinter()).toMatchObject({ password: "wrong-password" });
    await workflowPingPrinter(page, labelPrinter.name);
    await expectSingleToast(page, message);

    // On the network it has no share, user, password or labels anymore
    await workflowEditPrinter(page, labelPrinter.name, {
      address: MOCK_PRINTER_HOST,
      kind: PrinterKind.Ipp,
      name: labelPrinter.name,
    });
    expect(await getLabelPrinter()).toMatchObject({
      address: MOCK_PRINTER_HOST,
      kind: PrinterKind.Ipp,
      labelLengthMm: null,
      labelWidthMm: null,
      password: null,
      shareName: null,
      username: null,
    });
  });

  await test.step("delete the Impresoras", async () => {
    for (const name of ["Almacén", "Taller", "Etiquetas"]) {
      await workflowDeletePrinter(page, name);
      await expect(filterByExactText(getTableRows(getTablePrinter(page)), name)).toHaveCount(0);
    }
    expect(await db.select().from(dbTablePrinter).orderBy(dbTablePrinter.id)).toHaveLength(0);
  });
});
