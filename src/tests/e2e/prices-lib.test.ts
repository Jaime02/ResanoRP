import { expect, test } from "@playwright/test";

import { formatPrice } from "@/lib/formatters";
import { formatCents, getLineTotalInCents, getVatBreakdown } from "@/lib/prices";

test("the price library", async () => {
  await test.step("line totals round the half cents away from zero", () => {
    expect(getLineTotalInCents({ quantity: 1, unitPrice: "1.004" })).toBe(100);
    expect(getLineTotalInCents({ quantity: 1, unitPrice: "1.005" })).toBe(101);
    expect(getLineTotalInCents({ quantity: 1, unitPrice: "-1.004" })).toBe(-100);
    expect(getLineTotalInCents({ quantity: 1, unitPrice: "-1.005" })).toBe(-101);
    expect(getLineTotalInCents({ quantity: 1000, unitPrice: "-0.004" })).toBe(-400);
  });

  await test.step("a returned line is negative, and a returned discount positive", () => {
    expect(getLineTotalInCents({ quantity: -3, unitPrice: "1.005" })).toBe(-302);
    expect(getLineTotalInCents({ quantity: -2, unitPrice: "-1.50" })).toBe(300);
    // The integer part of a price below 1 € keeps its sign as "-0"
    expect(getLineTotalInCents({ quantity: 1, unitPrice: "-0.5" })).toBe(-50);
    expect(getLineTotalInCents({ quantity: -170, unitPrice: "0.82" })).toBe(-13940);
  });

  await test.step("the documents print the negative amounts with their sign", () => {
    expect(formatCents(-13940)).toMatch(/^-139,40\s€$/);
    expect(formatPrice("-0.5")).toMatch(/^-0,50\s€$/);
    expect(formatPrice("-0.004")).toMatch(/^-0,004\s€$/);
  });

  await test.step("the VAT of a negative base is the opposite of the VAT of the positive one", () => {
    const getVatInCents = (unitPrice: string) =>
      getVatBreakdown([{ quantity: 1, unitPrice, vatPercentage: 21 }])[0].vatInCents;
    expect(getVatInCents("2.50")).toBe(53);
    expect(getVatInCents("-2.50")).toBe(-53);
    expect(getVatInCents("-0.01")).toBe(0);
  });

  await test.step("the VAT is rounded once for each rate, which are listed from the highest", () => {
    // 21 % of each 2 cent line rounds to nothing, but 21 % of the 4 cents of the rate does not
    expect(
      getVatBreakdown([
        { quantity: 1, unitPrice: "0.02", vatPercentage: 21 },
        { quantity: 1, unitPrice: "1", vatPercentage: 10 },
        { quantity: 1, unitPrice: "0.02", vatPercentage: 21 },
      ]),
    ).toEqual([
      { taxableBaseInCents: 4, vatInCents: 1, vatPercentage: 21 },
      { taxableBaseInCents: 100, vatInCents: 10, vatPercentage: 10 },
    ]);
  });
});
