import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getClientById } from "@/db/functions/client";
import { getPendingSellOrderLinesByClientId, getSellOrderLineStatus } from "@/db/functions/sell-order-line";
import { renderPendingSellOrders } from "@/files/pending-sell-orders";
import { DateFormat, formatDate } from "@/lib/formatters";
import { sortPendingSellOrderLines } from "@/lib/sell-order-line";
import logger from "@/logging/logger";
import { sanitizePath } from "@/schemas/utils";

const routeParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

const routeSearchSchema = z.object({
  withCheckboxes: z.stringbool().default(false),
});

export const Route = createFileRoute("/api/files/pending-sell-orders/$clientId")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { clientId: string }; request: Request }) => {
        let clientId: number;
        try {
          ({ clientId } = routeParamsSchema.parse(params));
        } catch {
          logger.error("Invalid Client ID received", { params });
          return new Response("Invalid Client ID received", { status: 400 });
        }

        const { withCheckboxes } = routeSearchSchema.parse(
          Object.fromEntries(new URL(request.url).searchParams.entries()),
        );

        const [client, lines] = await Promise.all([
          getClientById(clientId),
          getPendingSellOrderLinesByClientId(clientId),
        ]);
        if (!client) {
          return new Response("Client not found", { status: 404 });
        }

        const now = new Date();

        try {
          const pdf = await renderPendingSellOrders({
            clientName: client.name,
            date: formatDate(now, DateFormat.Datetime) ?? "",
            lines: await Promise.all(
              sortPendingSellOrderLines(lines).map(async (line) => ({
                description: line.partReference?.part.description ?? line.description,
                id: line.id,
                notes: line.notes,
                pendingQuantity: line.pendingQuantity,
                quantity: line.quantity,
                reference: line.partReference?.reference ?? null,
                requestedDeliveryDate: formatDate(line.requestedDeliveryDate),
                sellOrderReference: line.sellOrder?.clientReference ?? String(line.sellOrderId),
                status: await getSellOrderLineStatus({ sellOrder: line.sellOrder ?? undefined, sellOrderLine: line }),
              })),
            ),
            withCheckboxes,
          });
          const fileName = `Pedidos Pendientes ${sanitizePath(client.name) ?? clientId} ${(formatDate(now) ?? "").replaceAll("/", "-")}.pdf`;
          return new Response(new Uint8Array(pdf), {
            headers: {
              // Client names can contain non-ASCII characters, which are only allowed in the RFC 5987 form
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error("Error generating Pending Sell Orders file", { clientId, error });
          return new Response("Failed to generate file", { status: 500 });
        }
      },
    },
  },
});
