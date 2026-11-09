import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";

import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderPath } from "@/files/sell-order";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/sell-order/$id")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { id: string } }) => {
        if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
          return textResponse("Esta acción solo la puede hacer el Administrador", 403);
        }

        let id: number;
        try {
          ({ id } = coercedIdObjectSchema.parse(params));
        } catch {
          logger.error("Invalid ID received", { params });
          return textResponse("Invalid ID received", 400);
        }

        const sellOrder = await getSellOrderById(id);
        if (!sellOrder) {
          logger.error("Sell Order not found", { id });
          return textResponse("Sell Order not found", 404);
        }
        const sellOrderPath = await getSellOrderPath({ clientId: sellOrder.clientId, sellOrderId: sellOrder.id });
        if (sellOrderPath === null) {
          logger.error("Sell Order path not found", { sellOrder });
          return textResponse("Sell Order path not found", 500);
        }

        try {
          const fileBuffer = await fs.readFile(sellOrderPath);
          const fileUint8Array = new Uint8Array(fileBuffer);
          return new Response(fileUint8Array, {
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Disposition": "inline",
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error("Error reading file", error);
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
