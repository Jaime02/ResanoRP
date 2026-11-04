import { expect } from "@playwright/test";

import { getMachines } from "@/db/functions/machine";
import { getProductionOrders } from "@/db/functions/production-order";
import { getSellOrders } from "@/db/functions/sell-order";
import { mockMachines, mockParts, mockProductionOrders, mockSellOrders } from "@/tests/mock-data";
import { test } from "@/tests/utils/fixtures";
import { getMockSellOrdersOfPart } from "@/tests/utils/mock-data-utils";

function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function idsOf(rows: Array<{ id: number }>) {
  return rows.map((row) => row.id).sort((a, b) => a - b);
}

test("the list queries of the database", async () => {
  await test.step("text filters ignore accents and casing", async () => {
    const search = "torno pequeno";
    const expectedMachines = mockMachines.filter(
      (machine) => machine.deletedAt === null && normalizeText(machine.name).includes(normalizeText(search)),
    );
    expect(expectedMachines.length, `"${search}" should match some mock rows`).toBeGreaterThan(0);
    expect(idsOf(await getMachines({ filters: [{ id: "name", value: search }] }))).toEqual(idsOf(expectedMachines));
  });

  await test.step("filter the sell orders by part", async () => {
    let filteredParts = 0;
    for (const part of mockParts) {
      const expectedSellOrders = getMockSellOrdersOfPart(part.id);
      if (expectedSellOrders.length > 0) {
        filteredParts++;
      }
      expect(idsOf(await getSellOrders({ filters: [{ id: "partId", value: part.id }] }))).toEqual(
        idsOf(expectedSellOrders),
      );
    }
    expect(filteredParts, "Some part should be in a sell order").toBeGreaterThan(0);
  });

  await test.step("an empty list of ids matches no machine and excludes none", async () => {
    const activeMachines = mockMachines.filter((machine) => machine.deletedAt === null);
    expect(await getMachines({ filters: [{ id: "activeProductionOrderIds", value: [] }] })).toEqual([]);
    expect(idsOf(await getMachines({ filters: [{ id: "excludeItemIds", value: [] }] }))).toEqual(idsOf(activeMachines));
  });

  await test.step("sort by the columns of the joined tables without repeating rows", async () => {
    for (const desc of [false, true]) {
      expect(idsOf(await getSellOrders({ sorts: [{ desc, id: "clientName" }] }))).toEqual(idsOf(mockSellOrders));
      for (const id of ["clientName", "requestedDeliveryDate", "dimension"]) {
        expect(idsOf(await getProductionOrders({ sorts: [{ desc, id }] }))).toEqual(idsOf(mockProductionOrders));
      }
    }
  });
});
