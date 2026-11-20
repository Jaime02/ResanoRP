import { createFileRoute } from "@tanstack/react-router";

import { getBlueprintById } from "@/db/functions/blueprint";
import { getBlueprintPath } from "@/files/blueprint";
import { pdfFileResponse, textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/blueprint/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { id: string }; request: Request }) => {
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
          return await pdfFileResponse(
            request,
            blueprintPath,
            `inline; filename*=UTF-8''${encodeURIComponent(blueprint.fileName)}`,
          );
        } catch (error) {
          logger.error(LogMessages.fileReadFailed, error);
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
