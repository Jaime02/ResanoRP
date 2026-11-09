import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";

import { getBlueprintById } from "@/db/functions/blueprint";
import { getBlueprintPath } from "@/files/blueprint";
import { textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/blueprint/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        let id: number;
        try {
          ({ id } = coercedIdObjectSchema.parse(params));
        } catch {
          logger.error(LogMessages.invalidId, { params });
          return textResponse("Invalid ID received", 400);
        }

        const blueprint = await getBlueprintById(id);
        if (!blueprint) {
          logger.error(LogMessages.blueprintNotFound, { id });
          return textResponse(LogMessages.blueprintNotFound, 404);
        }
        const blueprintPath = await getBlueprintPath({ ...blueprint, checkIfFileExists: true });
        if (blueprintPath === null) {
          logger.error(LogMessages.blueprintPathNotFound, { blueprint });
          return textResponse(LogMessages.blueprintPathNotFound, 500);
        }

        try {
          const fileBuffer = await fs.readFile(blueprintPath);
          const fileUint8Array = new Uint8Array(fileBuffer);
          return new Response(fileUint8Array, {
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(blueprint.fileName)}`,
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error(LogMessages.fileReadFailed, error);
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
