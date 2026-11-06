import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { DELIVERY_METHOD_NAME_CONSTRAINT, dbTableDeliveryMethod } from "@/db/schema";
import { DEFAULT_DELIVERY_METHOD_LABEL } from "@/messages/client";
import { STATUS_DELETED_LABEL, DELIVERY_METHOD_LABEL, NAME_LABEL } from "@/messages/common";
import {
  DELIVERY_METHOD_CREATE_TITLE,
  DELIVERY_METHOD_RESTORED_MESSAGE,
  SHOW_DELETED_DELIVERY_METHODS_LABEL,
} from "@/messages/delivery-method";
import { mockClients, mockDeliveryMethods, mockDeliveryNotes } from "@/tests/mock-data";
import { openAndConfirmAlertDialog } from "@/tests/utils/components/alert-dialog";
import { assertComboboxValue, fillComboboxFilter, openCombobox } from "@/tests/utils/components/combobox";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { getPopoverContent } from "@/tests/utils/components/popover";
import { filterByExactText, findTableRowByText, getTableRows } from "@/tests/utils/components/table";
import { clearToasts, getToastType } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";
import { TestAnnotations, test } from "@/tests/utils/fixtures";
import {
  EditButtonVisibility,
  workflowDeletedFilterAndRestore,
  workflowRestoreTaken,
} from "@/tests/workflows/deleted-filter";
import { workflowOpenEditDeliveryNote } from "@/tests/workflows/delivery-note";
import { ToastType } from "@/types";
import type { BaseClient } from "@/types/client";

const MAINTENANCE_DELIVERY_METHOD_URL = "/maintenance?tab=deliveryMethod";

test("manage the Transportes", { annotation: TestAnnotations.NonEmptyErrorsLogFile }, async ({ page, db, toasts }) => {
  const activeDeliveryMethods = mockDeliveryMethods.filter((deliveryMethod) => deliveryMethod.deletedAt === null);
  const tableDeliveryMethod = page.getByTestId("table-delivery-method");
  const dialogCreateEditDeliveryMethod = page.getByTestId("dialog-create-edit-delivery-method");

  const submitDeliveryMethodName = async (name: string) => {
    await expect(dialogCreateEditDeliveryMethod).toBeVisible();
    await getFormInputByLabel(dialogCreateEditDeliveryMethod, NAME_LABEL).fill(name);
    await dialogCreateEditDeliveryMethod.getByTestId("button-submit").click();
  };

  const assertDuplicatedNameRejected = async () => {
    await expect(toasts).toHaveCount(1);
    expect(await getToastType(toasts.first())).toBe(ToastType.Error);
    await expect(toasts.first()).toContainText("Existe un Transporte con el mismo nombre");
    await expect(dialogCreateEditDeliveryMethod).toBeVisible();

    await clearToasts(page);
    await dialogCreateEditDeliveryMethod.getByTestId("button-close").click();
    await expect(dialogCreateEditDeliveryMethod).not.toBeVisible();
  };

  await test.step("reject a Transporte with the name of any active one", async () => {
    expect(activeDeliveryMethods.length, "Wrong test set up: Some Transportes should be active").toBeGreaterThan(1);
    await page.goto(MAINTENANCE_DELIVERY_METHOD_URL);

    for (const [index, deliveryMethod] of activeDeliveryMethods.entries()) {
      await page.getByRole("button", { name: DELIVERY_METHOD_CREATE_TITLE }).click();
      await submitDeliveryMethodName(deliveryMethod.name);
      await assertDuplicatedNameRejected();

      await expectUniqueViolation(
        db.insert(dbTableDeliveryMethod).values({ name: deliveryMethod.name }),
        DELIVERY_METHOD_NAME_CONSTRAINT,
      );

      // Renaming another Transporte to it is rejected too
      const otherDeliveryMethod = activeDeliveryMethods[(index + 1) % activeDeliveryMethods.length];
      await (
        await findTableRowByText(tableDeliveryMethod, otherDeliveryMethod.name)
      )
        .getByTestId("button-edit")
        .click();
      await submitDeliveryMethodName(deliveryMethod.name);
      await assertDuplicatedNameRejected();
    }

    expect(await db.query.dbTableDeliveryMethod.findMany({ orderBy: { id: "asc" } })).toEqual(mockDeliveryMethods);
  });

  await test.step("deleting every Transporte frees its name and clears it as the default of its Clientes, but keeps it where it was used", async () => {
    expect(
      activeDeliveryMethods.some((deliveryMethod) =>
        mockClients.some((client) => client.defaultDeliveryMethodId === deliveryMethod.id),
      ),
      "Wrong test set up: Some Cliente should have a default Transporte",
    ).toBe(true);

    const deletedDeliveryMethodIds = new Set<number>();
    const getExpectedDefaultDeliveryMethodId = (client: BaseClient) =>
      client.defaultDeliveryMethodId !== null && deletedDeliveryMethodIds.has(client.defaultDeliveryMethodId)
        ? null
        : client.defaultDeliveryMethodId;
    const dialogCreateEditDeliveryNote = page.getByTestId("dialog-create-edit-delivery-note");
    const formClient = page.getByTestId("form-client");

    for (const deliveryMethod of activeDeliveryMethods) {
      await page.goto(MAINTENANCE_DELIVERY_METHOD_URL);
      await openAndConfirmAlertDialog(
        page,
        (await findTableRowByText(tableDeliveryMethod, deliveryMethod.name)).getByTestId("button-delete"),
        "dialog-delete-model-content",
      );
      deletedDeliveryMethodIds.add(deliveryMethod.id);

      await expect(filterByExactText(getTableRows(tableDeliveryMethod), deliveryMethod.name)).toHaveCount(0);
      for (const otherDeliveryMethod of activeDeliveryMethods.filter(
        (activeDeliveryMethod) => !deletedDeliveryMethodIds.has(activeDeliveryMethod.id),
      )) {
        await expect(filterByExactText(getTableRows(tableDeliveryMethod), otherDeliveryMethod.name)).toHaveCount(1);
      }

      expect(
        (await db.query.dbTableDeliveryMethod.findFirst({ where: { id: deliveryMethod.id } }))?.deletedAt,
      ).not.toBeNull();
      expect(
        await db.query.dbTableClient.findMany({
          columns: { defaultDeliveryMethodId: true, id: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(
        mockClients.map((client) => ({
          defaultDeliveryMethodId: getExpectedDefaultDeliveryMethodId(client),
          id: client.id,
        })),
      );
      expect(
        await db.query.dbTableDeliveryNote.findMany({
          columns: { deliveryMethodId: true, id: true },
          orderBy: { id: "asc" },
        }),
      ).toEqual(
        mockDeliveryNotes.map((deliveryNote) => ({
          deliveryMethodId: deliveryNote.deliveryMethodId,
          id: deliveryNote.id,
        })),
      );

      for (const client of mockClients.filter(
        (mockClient) => mockClient.deletedAt === null && mockClient.defaultDeliveryMethodId === deliveryMethod.id,
      )) {
        await page.goto(`/client/${client.id}`);
        await assertFormLoaded(formClient);
        await assertComboboxValue(
          getFormInputByLabel(formClient, DEFAULT_DELIVERY_METHOD_LABEL, InputElementType.Combobox),
          null,
        );
      }

      // The deleted Transporte is still shown in its pending Albaranes, although it can no longer be picked
      for (const deliveryNote of mockDeliveryNotes.filter(
        (mockDeliveryNote) =>
          mockDeliveryNote.invoiceId === null && mockDeliveryNote.deliveryMethodId === deliveryMethod.id,
      )) {
        await workflowOpenEditDeliveryNote(page, deliveryNote.id);
        const comboboxDeliveryMethod = getFormInputByLabel(
          dialogCreateEditDeliveryNote,
          DELIVERY_METHOD_LABEL,
          InputElementType.Combobox,
        );
        await assertComboboxValue(comboboxDeliveryMethod, String(deliveryMethod.id));
        await expect(comboboxDeliveryMethod.getByTestId("button-trigger")).toHaveText(deliveryMethod.name);
        await comboboxDeliveryMethod.getByTestId("tooltip-deleted").hover();
        const popoverDeleted = getPopoverContent(page);
        await expect(popoverDeleted).toContainText(STATUS_DELETED_LABEL);
        await popoverDeleted.getByTestId("button-link-delivery-methods").click();
        await expect(page).toHaveURL(/\/maintenance\?tab=deliveryMethod/);
        await expect(tableDeliveryMethod).toBeVisible();
        await page.goBack();
        await expect(dialogCreateEditDeliveryNote).toBeVisible();

        await openCombobox(comboboxDeliveryMethod);
        await fillComboboxFilter(page, deliveryMethod.name);
        await expect(page.getByTestId("combobox-list").locator("[role='option']")).toHaveCount(0);
      }

      // Its name can be used again...
      await page.goto(MAINTENANCE_DELIVERY_METHOD_URL);
      await page.getByRole("button", { name: DELIVERY_METHOD_CREATE_TITLE }).click();
      await submitDeliveryMethodName(deliveryMethod.name);
      await expect(dialogCreateEditDeliveryMethod).not.toBeVisible();
      await expect(filterByExactText(getTableRows(tableDeliveryMethod), deliveryMethod.name)).toHaveCount(1);

      // ...so the deleted Transporte can no longer be restored
      await expectUniqueViolation(
        db
          .update(dbTableDeliveryMethod)
          .set({ deletedAt: null })
          .where(eq(dbTableDeliveryMethod.id, deliveryMethod.id)),
        DELIVERY_METHOD_NAME_CONSTRAINT,
      );
    }
  });
});

const DELETED_DELIVERY_METHOD_FILTER_PARAMS = {
  url: MAINTENANCE_DELIVERY_METHOD_URL,
  tableTestId: "table-delivery-method",
  filterLabel: SHOW_DELETED_DELIVERY_METHODS_LABEL,
};

test("list the deleted Transportes only when asked for and restore them from the table", async ({ page, db }) => {
  await workflowDeletedFilterAndRestore({
    ...DELETED_DELIVERY_METHOD_FILTER_PARAMS,
    page,
    getDeletedAt: async (id) => (await db.query.dbTableDeliveryMethod.findFirst({ where: { id } }))?.deletedAt,
    ids: mockDeliveryMethods.filter((deliveryMethod) => deliveryMethod.deletedAt === null).map(({ id }) => id),
    editButton: EditButtonVisibility.OnlyActive,
    restoredToastTitle: DELIVERY_METHOD_RESTORED_MESSAGE,
  });
});

test(
  "a deleted Transporte cannot be restored from the table while another one has its name",
  { annotation: TestAnnotations.NonEmptyErrorsLogFile },
  async ({ page, db }) => {
    const deliveryMethod = mockDeliveryMethods.find((mockDeliveryMethod) => mockDeliveryMethod.deletedAt === null)!;
    await workflowRestoreTaken({
      ...DELETED_DELIVERY_METHOD_FILTER_PARAMS,
      page,
      getDeletedAt: async (id) => (await db.query.dbTableDeliveryMethod.findFirst({ where: { id } }))?.deletedAt,
      id: deliveryMethod.id,
      insertDuplicate: async () => db.insert(dbTableDeliveryMethod).values({ name: deliveryMethod.name }),
      errorMessage: "Existe un Transporte con el mismo nombre",
    });
  },
);
