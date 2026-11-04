import { TRPCError } from "@trpc/server";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DatabaseError } from "pg";

import logger from "@/logging/logger";

export const PG_UNIQUE_VIOLATION = "23505";
const PG_NOT_NULL_VIOLATION = "23502";

export function handleMutationError({
  error,
  uniqueConstraints = [],
}: {
  error: unknown;
  uniqueConstraints?: Array<{ constraintName: string; errorMessage: string }>;
}): never {
  logger.error("Error en la mutación", { error });

  if (error instanceof TRPCError) throw error;
  if (error instanceof DrizzleQueryError) {
    if (error.cause instanceof DatabaseError) {
      const dbError = error.cause;
      if (dbError.code === PG_UNIQUE_VIOLATION) {
        for (const uniqueConstraint of uniqueConstraints) {
          if (dbError.constraint === uniqueConstraint.constraintName) {
            throw new TRPCError({
              code: "CONFLICT",
              message: uniqueConstraint.errorMessage,
            });
          }
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: `Se ha producido un error de restricción única en la base de datos: ${dbError.constraint}`,
        });
      }
      if (dbError.code === PG_NOT_NULL_VIOLATION) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            dbError.column !== undefined
              ? `El campo '${dbError.column}' no puede ser nulo`
              : "Faltan campos obligatorios en la solicitud.",
        });
      }
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error en la base de datos",
    });
  }
  throw error;
}
