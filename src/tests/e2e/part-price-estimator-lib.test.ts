import { expect, test } from "@playwright/test";

import {
  getEstimation,
  getEstimatorCalculatedMaterialCost,
  getMaterialCostPerPart,
  getProductionCostPerPart,
  getSectionArea,
  roundPrice,
} from "@/lib/part-price-estimator";
import type { EstimatorMaterial, EstimatorValues } from "@/lib/part-price-estimator";
import { partPriceEstimatorSchema } from "@/schemas/part-price-estimator";

const baseValues: EstimatorValues = {
  coatingCost: null,
  machinePricePerHour: 60,
  machineSetupTimeMinutes: 60,
  materialCost: "1",
  otherCost: null,
  partLength: "10",
  partsPerHour: 60,
  secondOperationCost: null,
  transportPercentage: "0",
  unexpectedPercentage: "0",
  wastePercentage: "0",
};

const roundMaterial: EstimatorMaterial = {
  rawMaterial: { density: "8", price: "2" },
  shape: { name: "ID-1 Redondo" },
  width: "10",
};

test("the part price estimator library", async () => {
  await test.step("getSectionArea computes the cross-section by shape name", () => {
    expect(getSectionArea("ID-1 Redondo", 10)).toBeCloseTo(Math.PI * 25);
    expect(getSectionArea("Circular", 10)).toBeCloseTo(Math.PI * 25);
    expect(getSectionArea("ID-2 Hexagonal", 10)).toBeCloseTo((Math.sqrt(3) / 2) * 100);
    expect(getSectionArea("ID-4 Cuadrado", 10)).toBe(100);
    // Accents and casing are ignored
    expect(getSectionArea("REDÓNDO", 10)).toBeCloseTo(Math.PI * 25);
    // Shapes without a known formula have no section
    expect(getSectionArea("ID-5 Otro", 10)).toBeNull();
    expect(getSectionArea("ID-3 Tubo", 10)).toBeNull();
    expect(getSectionArea(undefined, 10)).toBeNull();
  });

  await test.step("getMaterialCostPerPart is weight times price per kilo, divided by the usable share", () => {
    // 100 mm² * 10 mm * 8 g/cm³ = 0.008 kg, at 2 €/kg
    expect(
      getMaterialCostPerPart({ density: 8, partLength: 10, pricePerKilo: 2, sectionArea: 100, wastePercentage: 0 }),
    ).toBeCloseTo(0.016);
    // 20 % wasted means only 80 % of the bought material ends up in the part: 0.016 / 0.8
    expect(
      getMaterialCostPerPart({ density: 8, partLength: 10, pricePerKilo: 2, sectionArea: 100, wastePercentage: 20 }),
    ).toBeCloseTo(0.02);
  });

  await test.step("getProductionCostPerPart", () => {
    const params = {
      machinePricePerHour: 60,
      machineSetupTimeMinutes: 60,
      partsPerHour: 60,
      transportPercentage: 0,
      unexpectedPercentage: 0,
    };

    // setup: 60 €, machining: 1 € per part
    expect(getProductionCostPerPart(params, 10)).toBeCloseTo(7);
    expect(getProductionCostPerPart(params, 60)).toBeCloseTo(2);
    // It divides by the complement of the unexpected percentage and multiplies by the transport percentage
    expect(getProductionCostPerPart({ ...params, unexpectedPercentage: 50 }, 10)).toBeCloseTo(14);
    expect(getProductionCostPerPart({ ...params, transportPercentage: 10 }, 10)).toBeCloseTo(7.7);
    expect(getProductionCostPerPart({ ...params, transportPercentage: 10, unexpectedPercentage: 50 }, 10)).toBeCloseTo(
      15.4,
    );
  });

  await test.step("getEstimatorCalculatedMaterialCost", () => {
    expect(getEstimatorCalculatedMaterialCost(baseValues, roundMaterial)).toBeCloseTo(Math.PI * 25 * 10 * 8 * 1e-6 * 2);

    const withoutWaste = getEstimatorCalculatedMaterialCost(baseValues, roundMaterial)!;
    const withWaste = getEstimatorCalculatedMaterialCost({ ...baseValues, wastePercentage: "20" }, roundMaterial)!;
    expect(withWaste).toBeCloseTo(withoutWaste / 0.8);

    // It is null when something needed is missing
    expect(getEstimatorCalculatedMaterialCost(baseValues, undefined)).toBeNull();
    expect(
      getEstimatorCalculatedMaterialCost(baseValues, {
        ...roundMaterial,
        rawMaterial: { density: null, price: "2" },
      }),
    ).toBeNull();
    expect(
      getEstimatorCalculatedMaterialCost(baseValues, {
        ...roundMaterial,
        rawMaterial: { density: "8", price: null },
      }),
    ).toBeNull();
    expect(
      getEstimatorCalculatedMaterialCost(baseValues, { ...roundMaterial, shape: { name: "ID-5 Otro" } }),
    ).toBeNull();
    expect(getEstimatorCalculatedMaterialCost({ ...baseValues, partLength: null }, roundMaterial)).toBeNull();
    expect(getEstimatorCalculatedMaterialCost({ ...baseValues, wastePercentage: "" }, roundMaterial)).toBeNull();
  });

  await test.step("getEstimation", () => {
    const estimation = getEstimation(
      { ...baseValues, coatingCost: "0.1", otherCost: "0.3", secondOperationCost: "0.2" },
      undefined,
      10,
    );
    expect(estimation.materialCost).toBe(1);
    expect(estimation.productionCost).toBeCloseTo(7);
    expect(estimation.othersCost).toBeCloseTo(0.6);
    expect(estimation.basePrice).toBeCloseTo(8.6);

    // The manual material cost is preferred over the calculated one
    expect(getEstimation(baseValues, roundMaterial, 10).materialCost).toBe(1);
    expect(getEstimation({ ...baseValues, materialCost: null }, roundMaterial, 10).materialCost).toBeCloseTo(
      Math.PI * 25 * 10 * 8 * 1e-6 * 2,
    );

    // Empty unexpected and transport percentages are zero
    const estimationWithoutPercentages = getEstimation(
      { ...baseValues, transportPercentage: null, unexpectedPercentage: null },
      undefined,
      10,
    );
    expect(estimationWithoutPercentages.productionCost).toBeCloseTo(7);
    expect(estimationWithoutPercentages.basePrice).toBeCloseTo(8);

    // There is no base price without a material cost
    const estimationWithoutMaterialCost = getEstimation({ ...baseValues, materialCost: null }, undefined, 10);
    expect(estimationWithoutMaterialCost.materialCost).toBeNull();
    expect(estimationWithoutMaterialCost.basePrice).toBeNull();

    // There is no production cost with missing machine data or an invalid quantity
    expect(getEstimation({ ...baseValues, partsPerHour: 0 }, undefined, 10).basePrice).toBeNull();
    expect(getEstimation({ ...baseValues, partsPerHour: null }, undefined, 10).basePrice).toBeNull();
    expect(getEstimation({ ...baseValues, machinePricePerHour: null }, undefined, 10).basePrice).toBeNull();
    expect(getEstimation({ ...baseValues, machineSetupTimeMinutes: null }, undefined, 10).basePrice).toBeNull();
    expect(getEstimation(baseValues, undefined, 0).basePrice).toBeNull();
  });

  await test.step("roundPrice keeps three decimals", () => {
    expect(roundPrice(1.23456)).toBe("1.235");
    expect(roundPrice(2)).toBe("2.000");
  });

  await test.step("partPriceEstimatorSchema", () => {
    const validEstimator = {
      coatingCost: null,
      machinePricePerHour: 35,
      machineSetupTimeMinutes: 20,
      materialCost: null,
      materialId: null,
      otherCost: null,
      partId: 1,
      partLength: "4",
      partsPerHour: 400,
      secondOperationCost: null,
      transportPercentage: "1",
      unexpectedPercentage: "0.5",
      wastePercentage: "2.5",
    };

    expect(partPriceEstimatorSchema.safeParse(validEstimator).success).toBe(true);
    // The unexpected and transport percentages are not required
    expect(
      partPriceEstimatorSchema.safeParse({ ...validEstimator, transportPercentage: null, unexpectedPercentage: null })
        .success,
    ).toBe(true);
    // ...but the waste percentage is
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, wastePercentage: "" }).success).toBe(false);
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, wastePercentage: null }).success).toBe(false);
    // Percentages above 99 are rejected
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, wastePercentage: "100" }).success).toBe(false);
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, unexpectedPercentage: "100" }).success).toBe(false);
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, transportPercentage: "99.5" }).success).toBe(false);
    // The machine and part data are still required
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, machinePricePerHour: "" }).success).toBe(false);
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, partLength: "" }).success).toBe(false);
    expect(partPriceEstimatorSchema.safeParse({ ...validEstimator, partsPerHour: 0 }).success).toBe(false);
  });
});
