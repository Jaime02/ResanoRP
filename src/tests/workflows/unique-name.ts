import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { NAME_LABEL } from "@/messages/common";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { expectSingleToast, getToasts } from "@/tests/utils/components/toast";
import { expectUniqueViolation } from "@/tests/utils/db";

interface TNamedItem {
  id: number;
  name: string;
}

// Fills the create form as the item, but with the given name. Only the name by default
type TFillCreateForm<T extends TNamedItem> = (item: T, name: string) => Promise<void>;

const fillName = (form: Locator) => async (_item: TNamedItem, name: string) =>
  getFormInputByLabel(form, NAME_LABEL).fill(name);

// Neither the case nor the spaces around it make another name
const getSameNameVariant = (name: string) => `  ${name.toLowerCase()}  `;

interface WorkflowRejectRenameToTakenNameParams<T extends TNamedItem> {
  page: Page;
  items: Array<T>;
  form: Locator;
  openEdit: (item: T) => Promise<void>;
  closeEdit?: () => Promise<void>;
  getName: (id: number) => Promise<string | undefined>;
  errorMessage: string;
}

export async function workflowRejectRenameToTakenName<T extends TNamedItem>({
  page,
  items,
  form,
  openEdit,
  closeEdit,
  getName,
  errorMessage,
}: WorkflowRejectRenameToTakenNameParams<T>) {
  expect(items.length, "Wrong test set up: Some items should be active").toBeGreaterThan(1);

  for (const [index, item] of items.entries()) {
    await openEdit(item);
    await assertFormLoaded(form);
    await getFormInputByLabel(form, NAME_LABEL).fill(getSameNameVariant(items[(index + 1) % items.length].name));
    await form.getByTestId("button-submit").click();

    await expectSingleToast(page, errorMessage);
    await expect(form).toBeVisible();
    expect(await getName(item.id)).toBe(item.name);

    await closeEdit?.();
  }
}

interface WorkflowRejectCreateWithTakenNameParams<T extends TNamedItem> {
  page: Page;
  items: Array<T>;
  form: Locator;
  openCreate: () => Promise<void>;
  closeCreate: () => Promise<void>;
  fill?: TFillCreateForm<T>;
  insertDuplicate: (name: string) => Promise<unknown>;
  constraintName: string;
  errorMessage: string;
}

// Ends with the exact name of the last item typed, as the create forms keep a cancelled draft
export async function workflowRejectCreateWithTakenName<T extends TNamedItem>({
  page,
  items,
  form,
  openCreate,
  closeCreate,
  fill = fillName(form),
  insertDuplicate,
  constraintName,
  errorMessage,
}: WorkflowRejectCreateWithTakenNameParams<T>) {
  expect(items.length, "Wrong test set up: Some items should be active").toBeGreaterThan(0);
  const buttonSubmit = form.getByTestId("button-submit");

  // A name of only spaces is no name
  await openCreate();
  await fill(items[0], "   ");
  await buttonSubmit.click();
  await expect(form.getByText("Campo obligatorio")).toHaveCount(1);
  await expect(getToasts(page)).toHaveCount(0);
  await closeCreate();

  for (const item of items) {
    for (const name of [getSameNameVariant(item.name), item.name]) {
      await openCreate();
      await fill(item, name);
      await buttonSubmit.click();
      await expectSingleToast(page, errorMessage);
      await expect(form).toBeVisible();
      await closeCreate();
    }
    await expectUniqueViolation(insertDuplicate(item.name.toLowerCase()), constraintName);
  }
}

interface WorkflowReuseDeletedNameParams<T extends TNamedItem> {
  page: Page;
  item: T;
  form: Locator;
  openCreate: () => Promise<void>;
  fill?: TFillCreateForm<T>;
  restoreDeleted: () => Promise<unknown>;
  constraintName: string;
}

// The item has to be deleted already. The new one is typed with spaces around its name, so the deleted one could only
// be restored if they were kept
export async function workflowReuseDeletedName<T extends TNamedItem>({
  page,
  item,
  form,
  openCreate,
  fill = fillName(form),
  restoreDeleted,
  constraintName,
}: WorkflowReuseDeletedNameParams<T>) {
  await openCreate();
  await fill(item, `  ${item.name}  `);
  await form.getByTestId("button-submit").click();
  await expectSingleToast(page);
  await expect(form).toBeHidden();

  await expectUniqueViolation(restoreDeleted(), constraintName);
}
