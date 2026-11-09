import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getAccountingExportPath } from "@/files/invoice";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import { textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";

const routeParamsSchema = z.object({
  fileName: z.string().regex(/^facturas-\d+-\d+\.csv$/),
});

export const Route = createFileRoute("/api/files/accounting-export/$fileName")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { fileName: string } }) => {
        if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
          return textResponse(ADMIN_ONLY_MESSAGE, 403);
        }

        let fileName: string;
        try {
          ({ fileName } = routeParamsSchema.parse(params));
        } catch {
          logger.error(LogMessages.invalidFileName, { params });
          return textResponse(LogMessages.invalidFileName, 400);
        }

        try {
          const fileBuffer = await fs.readFile(getAccountingExportPath(fileName));
          return new Response(new Uint8Array(fileBuffer), {
            headers: {
              "Content-Disposition": `attachment; filename="${fileName}"`,
              // Prisma reads the file as ISO-8859-1
              "Content-Type": "text/csv; charset=ISO-8859-1",
            },
            status: 200,
          });
        } catch (error) {
          logger.error(LogMessages.accountingExportReadFailed, { error, fileName });
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
