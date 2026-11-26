import { createFileRoute } from "@tanstack/react-router";

import db from "@/db";
import { getMaterialCertificatePath } from "@/files/material-certificate";
import { pdfFileResponse, textResponse } from "@/lib/responses";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { coercedIdObjectSchema } from "@/schemas";

export const Route = createFileRoute("/api/files/material-certificate/$id")({
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

        const materialLot = await db.query.dbTableMaterialLot.findFirst({ where: { id } });
        if (materialLot?.hasCertificate !== true) {
          return textResponse("Certificate not found", 404);
        }

        try {
          return await pdfFileResponse(
            request,
            getMaterialCertificatePath(id),
            `inline; filename*=UTF-8''${encodeURIComponent(`Certificado ${materialLot.heat ?? materialLot.id}.pdf`)}`,
          );
        } catch (error) {
          logger.error(LogMessages.materialCertificateReadFailed, { error, id });
          return textResponse("Failed to read file", 500);
        }
      },
    },
  },
});
