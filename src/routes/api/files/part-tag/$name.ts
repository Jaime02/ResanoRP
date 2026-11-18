import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";

import { getPartTagPath } from "@/files/part-tag";
import { PART_TAG_NAME_PATTERN } from "@/lib/part-tag";
import { textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";

export const Route = createFileRoute("/api/files/part-tag/$name")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { name: string } }) => {
        // The name becomes a path, so only the names the server gives its tags are read
        if (!PART_TAG_NAME_PATTERN.test(params.name)) {
          logger.error(LogMessages.invalidId, { params });
          return textResponse("Invalid tag name received", 400);
        }

        try {
          const tagPath = getPartTagPath(params.name);
          const fileBuffer = await fs.readFile(tagPath);
          // A tag is only read to be printed, and printing it again renders it again. A tag that stays is no reason
          // to fail a print that was read
          await fs
            .rm(tagPath, { force: true })
            .catch((error: unknown) => logger.error(LogMessages.partTagRemoveFailed, { error, name: params.name }));
          return new Response(new Uint8Array(fileBuffer), {
            headers: {
              "Content-Disposition": `inline; filename="etiqueta-${params.name}.pdf"`,
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error(LogMessages.partTagReadFailed, { error, name: params.name });
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
