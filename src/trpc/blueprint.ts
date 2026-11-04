import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { TDatabase } from "@/db";
import { getBlueprintById } from "@/db/functions/blueprint";
import { dbTableBlueprint } from "@/db/schema";
import { archiveBlueprintFiles, getBlueprintPath } from "@/files/blueprint";
import { removeOnRollback, renameFile, saveUpload } from "@/files/functions";
import { handleMutationError } from "@/lib/handlers";
import { requiredIdObjectSchema } from "@/schemas";
import { updateBlueprintSchema, createBlueprintFormDataSchema } from "@/schemas/blueprint";
import { router, generateTxId } from "@/trpc";
import { adminProcedure } from "@/trpc";

// Writing or renaming over the file of another Plano would replace it
async function assertBlueprintFileNameIsFree({ partId, fileName }: { partId: number; fileName: string }) {
  if ((await getBlueprintPath({ checkIfFileExists: true, fileName, logErrors: false, partId })) !== null) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `El Artículo ya tiene un Plano llamado ${fileName}`,
    });
  }
}

export async function createBlueprint(
  tx: TDatabase,
  input: { blueprint: File; fileName: string; partId: number },
  createdPaths: Array<string>,
) {
  const filePath = await getBlueprintPath({
    createFoldersIfNotExist: true,
    fileName: input.fileName,
    partId: input.partId,
  });
  if (filePath == null) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Error al obtener la ruta del archivo para el Plano ${input.fileName}`,
    });
  }

  const newBlueprint = (
    await tx
      .insert(dbTableBlueprint)
      .values({ createdAt: new Date(), fileName: input.fileName, partId: input.partId })
      .returning()
  ).at(0);

  if (!newBlueprint) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error al crear el Plano en la base de datos",
    });
  }

  createdPaths.push(filePath);
  await saveUpload({
    fileUpload: input.blueprint,
    location: filePath,
  });
  return newBlueprint;
}

export default router({
  create: adminProcedure.input(createBlueprintFormDataSchema).mutation(async ({ ctx, input }) =>
    removeOnRollback(async (createdPaths) =>
      ctx.db.transaction(async (tx) => {
        try {
          const txid = await generateTxId(tx);
          await assertBlueprintFileNameIsFree(input);
          const newBlueprint = await createBlueprint(tx, input, createdPaths);
          return { item: newBlueprint, txid };
        } catch (error) {
          handleMutationError({ error });
        }
      }),
    ),
  ),
  update: adminProcedure.input(updateBlueprintSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);
        const blueprint = await getBlueprintById(input.id, tx);
        if (!blueprint) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se encontró el Plano con ID ${input.id}`,
          });
        }

        const filePath = await getBlueprintPath({
          ...blueprint,
          checkIfFileExists: true,
        });
        if (filePath === null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se encontró la ruta del archivo para el Plano con ID ${input.id}`,
          });
        }
        await assertBlueprintFileNameIsFree({ fileName: input.fileName, partId: blueprint.partId });

        await renameFile({
          filePath,
          newFileName: `${input.fileName}.pdf`,
        });

        const updatedBlueprint = (
          await tx
            .update(dbTableBlueprint)
            .set({ fileName: input.fileName })
            .where(eq(dbTableBlueprint.id, input.id))
            .returning()
        ).at(0);

        if (!updatedBlueprint) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se pudo editar el Plano con ID ${input.id}`,
          });
        }
        return { item: updatedBlueprint, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
  delete: adminProcedure.input(requiredIdObjectSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      try {
        const txid = await generateTxId(tx);

        const deletedBlueprint = (
          await tx.delete(dbTableBlueprint).where(eq(dbTableBlueprint.id, input.id)).returning()
        ).at(0);
        if (!deletedBlueprint) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Plano con ID ${input.id} no encontrado`,
          });
        }
        if ((await archiveBlueprintFiles([deletedBlueprint])) !== undefined) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No se encontró la ruta del archivo para el Plano con ID ${input.id}`,
          });
        }
        return { item: deletedBlueprint, txid };
      } catch (error) {
        handleMutationError({ error });
      }
    }),
  ),
});
