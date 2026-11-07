import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { NAME_LABEL } from "@/messages/common";
import { assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { expectSingleToast } from "@/tests/utils/components/toast";

interface WorkflowRejectRenameToTakenNameParams<T extends { id: number; name: string }> {
  page: Page;
  items: Array<T>;
  form: Locator;
  openEdit: (item: T) => Promise<void>;
  closeEdit?: () => Promise<void>;
  getName: (id: number) => Promise<string | undefined>;
  errorMessage: string;
}

export async function workflowRejectRenameToTakenName<T extends { id: number; name: string }>({
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
    await getFormInputByLabel(form, NAME_LABEL).fill(items[(index + 1) % items.length].name);
    await form.getByTestId("button-submit").click();

    await expectSingleToast(page, errorMessage);
    await expect(form).toBeVisible();
    expect(await getName(item.id)).toBe(item.name);

    await closeEdit?.();
  }
}
