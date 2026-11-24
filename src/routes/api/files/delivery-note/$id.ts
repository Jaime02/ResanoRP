import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getDeliveryNotePath } from "@/files/delivery-note";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { pdfFileResponse, textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";
import { coercedIdObjectSchema } from "@/schemas";

const routeSearchSchema = z.object({
  copies: z.coerce.number().int().positive().max(2).default(1),
  withPrices: z.stringbool().default(false),
});

export const Route = createFileRoute("/api/files/delivery-note/$id")({
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

        const { copies, withPrices } = routeSearchSchema.parse(
          Object.fromEntries(new URL(request.url).searchParams.entries()),
        );
        if (withPrices && !isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
          return textResponse(ADMIN_ONLY_MESSAGE, 403);
        }

        try {
          return await pdfFileResponse(
            request,
            getDeliveryNotePath(id, copies, withPrices),
            `inline; filename="albaran-${id}.pdf"`,
          );
        } catch (error) {
          logger.error(LogMessages.deliveryNoteReadFailed, { error, id });
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
