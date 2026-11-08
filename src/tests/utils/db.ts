import { expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DatabaseError } from "pg";

import type { TDatabase } from "@/db";
import * as schema from "@/db/schema";
import { PG_UNIQUE_VIOLATION } from "@/lib/handlers";
import logger from "@/logging/logger";
import * as mockData from "@/tests/mock-data";

const removeRowId = <T extends { id: number }>(rows: Array<T>): Array<Omit<T, "id">> =>
  // oxlint-disable-next-line no-unused-vars
  [...rows].sort((a, b) => a.id - b.id).map(({ id, ...rest }) => rest);

export async function seedDatabase(db: TDatabase) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET session_replication_role = 'replica';`);

      await tx.insert(schema.dbTableClient).values(removeRowId(mockData.mockClients));
      await tx.insert(schema.dbTableClientInvoiceEmail).values(removeRowId(mockData.mockClientInvoiceEmails));
      await tx.insert(schema.dbTableCoating).values(removeRowId(mockData.mockCoatings));
      await tx.insert(schema.dbTableConfiguration).values(removeRowId(mockData.mockConfigurations));
      await tx.insert(schema.dbTableShape).values(removeRowId(mockData.mockShapes));
      await tx.insert(schema.dbTableRawMaterial).values(removeRowId(mockData.mockRawMaterials));
      await tx.insert(schema.dbTablePartPrice).values(removeRowId(mockData.mockPartPrices));
      await tx.insert(schema.dbTableMaterial).values(removeRowId(mockData.mockMaterials));
      await tx.insert(schema.dbTableBlueprint).values(removeRowId(mockData.mockBlueprints));
      await tx.insert(schema.dbTablePartMaterial).values(mockData.mockPartMaterials);
      await tx.insert(schema.dbTablePartComponent).values(mockData.mockPartComponents);
      await tx.insert(schema.dbTablePartPriceEstimator).values(mockData.mockPartPriceEstimators);
      await tx.insert(schema.dbTablePartReference).values(removeRowId(mockData.mockPartReferences));
      await tx.insert(schema.dbTablePaymentMethod).values(removeRowId(mockData.mockPaymentMethods));
      await tx.insert(schema.dbTablePart).values(removeRowId(mockData.mockParts));
      await tx.insert(schema.dbTablePartFeature).values(removeRowId(mockData.mockPartFeatures));
      await tx.insert(schema.dbTableDeliveryMethod).values(removeRowId(mockData.mockDeliveryMethods));
      await tx.insert(schema.dbTableMachine).values(removeRowId(mockData.mockMachines));
      await tx.insert(schema.dbTableInvoice).values(removeRowId(mockData.mockInvoices));
      await tx.insert(schema.dbTableDeliveryNote).values(removeRowId(mockData.mockDeliveryNotes));
      await tx.insert(schema.dbTableDeliveryNoteLine).values(removeRowId(mockData.mockDeliveryNoteLines));
      await tx.insert(schema.dbTableSellOrder).values(removeRowId(mockData.mockSellOrders));
      await tx.insert(schema.dbTableSellOrderLine).values(removeRowId(mockData.mockSellOrderLines));
      await tx.insert(schema.dbTableProductionOrder).values(removeRowId(mockData.mockProductionOrders));
      await tx.insert(schema.dbTableMachineProductionOrderQueue).values(mockData.mockMachineProductionOrderQueues);
      await tx.insert(schema.dbTablePartProduction).values(removeRowId(mockData.mockPartProduction));
      await tx.insert(schema.dbTableQualityCheck).values(removeRowId(mockData.mockQualityChecks));
      await tx.insert(schema.dbTablePartStock).values(removeRowId(mockData.mockPartStock));
      await tx.insert(schema.dbTableTreatmentShipment).values(removeRowId(mockData.mockTreatmentShipments));
      await tx.insert(schema.dbTableTreatmentReception).values(removeRowId(mockData.mockTreatmentReceptions));

      await tx.execute(sql`SET session_replication_role = 'origin';`);
    });
  } catch (error) {
    logger.crit("Error seding database: Foreign key violations or seeding error found", { error });
    process.exit(1);
  }
}

const PG_CHECK_VIOLATION = "23514";

async function expectConstraintViolation(query: Promise<unknown>, constraintName: string, code: string) {
  let caught: unknown;
  try {
    await query;
  } catch (error) {
    caught = error;
  }
  const databaseError = caught instanceof DrizzleQueryError ? caught.cause : caught;
  expect(databaseError, `Expected the query to violate "${constraintName}"`).toBeInstanceOf(DatabaseError);
  expect((databaseError as DatabaseError).code).toBe(code);
  expect((databaseError as DatabaseError).constraint).toBe(constraintName);
}

export async function expectUniqueViolation(query: Promise<unknown>, constraintName: string) {
  await expectConstraintViolation(query, constraintName, PG_UNIQUE_VIOLATION);
}

export async function expectCheckViolation(query: Promise<unknown>, constraintName: string) {
  await expectConstraintViolation(query, constraintName, PG_CHECK_VIOLATION);
}
