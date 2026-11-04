import { TRPCError } from "@trpc/server";

import type { TDatabase } from "@/db";
import db from "@/db";
import type { BaseConfiguration } from "@/types/configuration";

export async function getConfiguration(dbConnection: TDatabase = db): Promise<BaseConfiguration | undefined> {
  return dbConnection.query.dbTableConfiguration.findFirst();
}

export async function getConfigurationVatPercentage(dbConnection: TDatabase = db): Promise<number> {
  const configuration = await getConfiguration(dbConnection);
  if (!configuration) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No se ha configurado los datos de la empresa",
    });
  }
  return configuration.vatPercentage;
}
