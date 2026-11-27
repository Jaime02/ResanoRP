import { expect, test } from "@playwright/test";

import { isFieldRequired } from "@/form/utils";
import { REQUIRED_FIELD_MESSAGE } from "@/messages/common";
import { stringSchema } from "@/schemas";
import { createSellOrderFormDataSchema, updateSellOrderFormDataSchema } from "@/schemas/sell-order";

test("the string schema", () => {
  const requiredSchema = stringSchema();
  const nullableSchema = stringSchema({ nullable: true });

  expect(requiredSchema.parse("  value  ")).toBe("value");
  expect(requiredSchema.safeParse("   ")).toMatchObject({
    error: { issues: [{ message: REQUIRED_FIELD_MESSAGE }] },
    success: false,
  });
  expect(requiredSchema.safeParse("").success).toBe(false);
  expect(requiredSchema.safeParse(null).success).toBe(false);

  expect(nullableSchema.parse("  value  ")).toBe("value");
  expect(nullableSchema.parse("   ")).toBeNull();
  expect(nullableSchema.parse("")).toBeNull();
  expect(nullableSchema.parse(null)).toBeNull();
});

test("the required field detection", () => {
  for (const schema of [createSellOrderFormDataSchema, updateSellOrderFormDataSchema]) {
    expect(isFieldRequired("receptionDate", schema)).toBe(true);
    expect(isFieldRequired("notes", schema)).toBe(false);
    expect(isFieldRequired("clientReference", schema)).toBe(false);
    expect(isFieldRequired("paymentMethodId", schema)).toBe(false);
  }
});
