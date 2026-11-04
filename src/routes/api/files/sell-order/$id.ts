import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";

import { getSellOrderById } from "@/db/functions/sell-order";
import { getSellOrderPath } from "@/files/sell-order";
import logger from "@/logging/logger";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/sell-order/$id")({
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

        const sellOrder = await getSellOrderById(id);
        if (!sellOrder) {
          logger.error("Sell Order not found", { id });
          return new Response("Sell Order not found", { status: 404 });
        }
        const sellOrderPath = await getSellOrderPath({ clientId: sellOrder.clientId, sellOrderId: sellOrder.id });
        if (sellOrderPath === null) {
          logger.error("Sell Order path not found", { sellOrder });
          return new Response("Sell Order path not found", { status: 500 });
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
          return new Response("Failed to read file", { status: 500 });
        }
      },
    },
  },
});
