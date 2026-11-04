import fs from "node:fs/promises";

import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { getConfiguration } from "@/db/functions/configuration";
import { getInvoiceWithClientInvoiceEmails } from "@/db/functions/invoice";
import { getInvoiceEmail, getInvoicePath } from "@/files/invoice";
import { ADMIN_SESSION_COOKIE_NAME, isAdminSession } from "@/lib/admin-session";
import logger from "@/logging/logger";
import { coercedIdObjectSchema } from "@/schemas";

const routeSearchSchema = z.object({
  format: z.enum(["pdf", "eml"]).default("pdf"),
});

export const Route = createFileRoute("/api/files/invoice/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: { id: string }; request: Request }) => {
        if (!isAdminSession(getCookie(ADMIN_SESSION_COOKIE_NAME))) {
          return new Response("Esta acción solo la puede hacer el Administrador", { status: 403 });
        }

        let id: number;
        try {
          ({ id } = coercedIdObjectSchema.parse(params));
        } catch {
          logger.error("Invalid ID received", { params });
          return new Response("Invalid ID received", { status: 400 });
        }

        const { format } = routeSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

        try {
          const fileBuffer = await fs.readFile(getInvoicePath(id));
          if (format === "eml") {
            const invoice = await getInvoiceWithClientInvoiceEmails(id);
            const configuration = await getConfiguration();
            const invoiceEmail = getInvoiceEmail({
              from: configuration?.invoiceSenderEmail ?? null,
              invoiceId: id,
              pdf: fileBuffer,
              to: invoice?.client.invoiceEmails.map(({ email }) => email) ?? [],
            });
            return new Response(invoiceEmail, {
              headers: {
                "Content-Disposition": `attachment; filename="Factura ${id}.eml"`,
                "Content-Type": "message/rfc822",
              },
              status: 200,
            });
          }
          const fileUint8Array = new Uint8Array(fileBuffer);
          return new Response(fileUint8Array, {
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Disposition": `inline; filename="Factura ${id}.pdf"`,
              "Content-Type": "application/pdf",
            },
            status: 200,
          });
        } catch (error) {
          logger.error("Error reading Invoice file", { error, id });
          return new Response("Failed to read file", { status: 500 });
        }
      },
    },
  },
});
