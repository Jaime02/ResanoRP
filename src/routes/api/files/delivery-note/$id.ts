import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDeliveryNotePath } from "@/files/delivery-note";
import logger from "@/logging/logger";
import { coercedIdObjectSchema } from "@/schemas";

const routeSearchSchema = z.object({
  copies: z.coerce.number().int().positive().max(2).default(1),
});

export const Route = createFileRoute("/api/files/delivery-note/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { id: string }; request: Request }) => {
        let id: number;
        try {
          ({ id } = coercedIdObjectSchema.parse(params));
        } catch {
          logger.error("Invalid ID received", { params });
          return new Response("Invalid ID received", { status: 400 });
        }

        const { copies } = routeSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

        try {
          const fileBuffer = await fs.readFile(getDeliveryNotePath(id, copies));
          const fileUint8Array = new Uint8Array(fileBuffer);
          return new Response(fileUint8Array, {
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Disposition": `inline; filename="albaran-${id}.pdf"`,
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error("Error reading Delivery Note file", { error, id });
          return new Response("Failed to read file", { status: 500 });
        }
      },
    },
  },
});
