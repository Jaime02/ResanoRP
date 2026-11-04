import { removeAccents } from "@/lib/utils";

const KG_PER_MM3_PER_G_CM3 = 1e-6;

export const DEFAULT_ESTIMATION_QUANTITIES = [10, 100, 1000];

// Shapes are user-editable rows without a type, so the cross-section formula is chosen by name
export function getSectionArea(shapeName: string | undefined, width: number): number | null {
  const name = removeAccents(shapeName ?? "").toLowerCase();
  if (name.includes("redond") || name.includes("circular")) {
    return Math.PI * (width / 2) ** 2;
  }
  if (name.includes("hexag")) {
    return (Math.sqrt(3) / 2) * width ** 2;
  }
  if (name.includes("cuadrad")) {
    return width ** 2;
  }
  return null;
}

interface MaterialCostParams {
  sectionArea: number;
  partLength: number;
  wastePercentage: number;
  density: number;
  pricePerKilo: number;
}

export function getMaterialCostPerPart({
  sectionArea,
  partLength,
  wastePercentage,
  density,
  pricePerKilo,
}: MaterialCostParams): number {
  const weightKg = (sectionArea * partLength * density * KG_PER_MM3_PER_G_CM3) / (1 - wastePercentage / 100);
  return weightKg * pricePerKilo;
}

interface ProductionCostParams {
  machineSetupTimeMinutes: number;
  partsPerHour: number;
  machinePricePerHour: number;
  unexpectedPercentage: number;
  transportPercentage: number;
}

export function getProductionCostPerPart(
  {
    machineSetupTimeMinutes,
    partsPerHour,
    machinePricePerHour,
    unexpectedPercentage,
    transportPercentage,
  }: ProductionCostParams,
  quantity: number,
): number {
  const setupCost = (machineSetupTimeMinutes / 60) * machinePricePerHour;
  const machiningCost = machinePricePerHour / partsPerHour;
  return ((setupCost / quantity + machiningCost) / (1 - unexpectedPercentage / 100)) * (1 + transportPercentage / 100);
}

export function roundPrice(price: number): string {
  return price.toFixed(3);
}

export interface EstimatorValues {
  coatingCost: string | null;
  machinePricePerHour: number | null;
  machineSetupTimeMinutes: number | null;
  materialCost: string | null;
  partLength: string | null;
  partsPerHour: number | null;
  otherCost: string | null;
  secondOperationCost: string | null;
  transportPercentage: string | null;
  unexpectedPercentage: string | null;
  wastePercentage: string | null;
}

export interface EstimatorMaterial {
  width: string;
  shape: { name: string } | null;
  rawMaterial: { density: string | null; price: string | null };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getEstimatorCalculatedMaterialCost(values: EstimatorValues, material: EstimatorMaterial | undefined) {
  const sectionArea = material ? getSectionArea(material.shape?.name, Number(material.width)) : null;
  const partLength = toNumber(values.partLength);
  const wastePercentage = toNumber(values.wastePercentage);
  const density = toNumber(material?.rawMaterial.density);
  const pricePerKilo = toNumber(material?.rawMaterial.price);
  if (
    sectionArea === null ||
    partLength === null ||
    wastePercentage === null ||
    density === null ||
    pricePerKilo === null
  ) {
    return null;
  }
  return getMaterialCostPerPart({ density, partLength, pricePerKilo, sectionArea, wastePercentage });
}

function getEstimatorMaterialCost(values: EstimatorValues, material: EstimatorMaterial | undefined) {
  return toNumber(values.materialCost) ?? getEstimatorCalculatedMaterialCost(values, material);
}

function getEstimatorOthersCost(values: EstimatorValues) {
  return (
    (toNumber(values.coatingCost) ?? 0) +
    (toNumber(values.secondOperationCost) ?? 0) +
    (toNumber(values.otherCost) ?? 0)
  );
}

export function getEstimation(values: EstimatorValues, material: EstimatorMaterial | undefined, quantity: number) {
  const materialCost = getEstimatorMaterialCost(values, material);
  const machineSetupTimeMinutes = toNumber(values.machineSetupTimeMinutes);
  const partsPerHour = toNumber(values.partsPerHour);
  const machinePricePerHour = toNumber(values.machinePricePerHour);
  const unexpectedPercentage = toNumber(values.unexpectedPercentage) ?? 0;
  const transportPercentage = toNumber(values.transportPercentage) ?? 0;
  const productionCost =
    machineSetupTimeMinutes === null ||
    partsPerHour === null ||
    partsPerHour <= 0 ||
    machinePricePerHour === null ||
    quantity <= 0
      ? null
      : getProductionCostPerPart(
          { machinePricePerHour, machineSetupTimeMinutes, partsPerHour, transportPercentage, unexpectedPercentage },
          quantity,
        );
  const othersCost = getEstimatorOthersCost(values);
  return {
    basePrice: materialCost !== null && productionCost !== null ? materialCost + productionCost + othersCost : null,
    materialCost,
    othersCost,
    productionCost,
  };
}
