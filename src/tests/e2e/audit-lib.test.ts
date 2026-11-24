import { expect, test } from "@playwright/test";
import { max } from "drizzle-orm";

import db from "@/db";
import { dbTableDeliveryNoteLine, dbTableSellOrderLine } from "@/db/schema";
import { AUDIT_REDACTED_VALUE, getAuditDocumentId, redactAuditInput } from "@/logging/audit";

test("the audit log hides the secrets and the files of an input", () => {
  const formData = new FormData();
  formData.append("name", "Plano");
  formData.append("file", new File(["content"], "plano.pdf"));

  expect(
    redactAuditInput({
      id: 1,
      name: "Mesa",
      password: "secret",
      nested: [{ Password: "secret", shareName: "Albaranes" }],
      empty: null,
    }),
  ).toEqual({
    id: 1,
    name: "Mesa",
    password: AUDIT_REDACTED_VALUE,
    nested: [{ Password: AUDIT_REDACTED_VALUE, shareName: "Albaranes" }],
    empty: null,
  });
  expect(redactAuditInput(formData)).toEqual({ name: "Plano", file: { name: "plano.pdf", size: 7 } });
  expect(redactAuditInput(undefined)).toBeUndefined();
});

test("the audit log names the document a change was made to, the parent one for a line", async () => {
  const [deliveryNoteLine] = await db.select().from(dbTableDeliveryNoteLine).limit(1);
  const [{ maxId }] = await db.select({ maxId: max(dbTableSellOrderLine.id) }).from(dbTableSellOrderLine);
  const missingLineId = (maxId ?? 0) + 1;

  await test.step("a document is read from the row it returns, else from its id or its own key in the input", async () => {
    expect(await getAuditDocumentId("deliveryNote.create", { item: { id: 7 } }, { clientId: 1 })).toBe("7");
    expect(await getAuditDocumentId("sellOrder.restore", undefined, 4)).toBe("4");
    expect(await getAuditDocumentId("invoice.delete", undefined, { id: 3 })).toBe("3");
    expect(await getAuditDocumentId("sellOrder.update", undefined, { id: "5", name: "Plano" })).toBe("5");
    expect(await getAuditDocumentId("deliveryNote.appendLines", undefined, { deliveryNoteId: 2 })).toBe("2");
    expect(await getAuditDocumentId("productionOrder.printTag", {}, { productionOrderId: 9, partQuantity: 1 })).toBe(
      "9",
    );
  });

  await test.step("a line is of its parent, which a failed change of it reads from the line", async () => {
    expect(await getAuditDocumentId("sellOrderLine.update", { item: { id: 40, sellOrderId: 6 } }, { id: 40 })).toBe(
      "6",
    );
    expect(await getAuditDocumentId("sellOrderLine.create", undefined, { sellOrderId: 8, quantity: 1 })).toBe("8");
    expect(await getAuditDocumentId("deliveryNoteLine.delete", undefined, { id: deliveryNoteLine.id })).toBe(
      String(deliveryNoteLine.deliveryNoteId),
    );
    expect(await getAuditDocumentId("sellOrderLine.delete", undefined, { id: missingLineId })).toBeUndefined();
  });

  await test.step("a change that is not of a document has none", async () => {
    expect(await getAuditDocumentId("client.update", { item: { id: 1 } }, { id: 1 })).toBeUndefined();
  });
});
