import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";

import { getBlueprintById } from "@/db/functions/blueprint";
import { getBlueprintPath } from "@/files/blueprint";
import logger from "@/logging/logger";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/blueprint/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        let id: number;
        try {
          ({ id } = coercedIdObjectSchema.parse(params));
        } catch {
          logger.error("Invalid ID received", { params });
          return new Response("Invalid ID received", { status: 400 });
        }

        const blueprint = await getBlueprintById(id);
        if (!blueprint) {
          logger.error("Blueprint not found", { id });
          return new Response("Blueprint not found", { status: 404 });
        }
        const blueprintPath = await getBlueprintPath({ ...blueprint, checkIfFileExists: true });
        if (blueprintPath === null) {
          logger.error("Blueprint path not found", { blueprint });
          return new Response("Blueprint path not found", { status: 500 });
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
          logger.error("Error reading file", error);
          return new Response("Failed to read file", { status: 500 });
        }
      },
    },
  },
});
