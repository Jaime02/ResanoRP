import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getAccountingExportPath } from "@/files/invoice";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import logger from "@/logging/logger";

const routeParamsSchema = z.object({
  fileName: z.string().regex(/^facturas-\d+-\d+\.csv$/),
});

export const Route = createFileRoute("/api/files/accounting-export/$fileName")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { fileName: string } }) => {
        if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
          return new Response("Esta acción solo la puede hacer el Administrador", { status: 403 });
        }

        let fileName: string;
        try {
          ({ fileName } = routeParamsSchema.parse(params));
        } catch {
          logger.error("Invalid file name received", { params });
          return new Response("Invalid file name received", { status: 400 });
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
          logger.error("Error reading Accounting Export file", { error, fileName });
          return new Response("Failed to read file", { status: 500 });
        }
      },
    },
  },
});
