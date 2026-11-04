import { createFileRoute } from "@tanstack/react-router";

import { prepareElectricUrl, proxyElectricRequest } from "@/lib/electric";

const TABLES = new Set([
  "blueprint",
  "client",
  "client_invoice_email",
  "coating",
  "configuration",
  "delivery_method",
  "delivery_note",
  "delivery_note_line",
  "invoice",
  "machine",
  "machine_production_order_queue",
  "material",
  "part",
  "part_feature",
  "part_material",
  "part_price",
  "part_price_estimator",
  "part_production",
  "part_reference",
  "part_stock",
  "payment_method",
  "production_order",
  "quality_check",
  "raw_material",
  "sell_order",
  "sell_order_line",
  "shape",
  "treatment_reception",
  "treatment_shipment",
]);

async function proxyTable({ request, params }: { request: Request; params: { table: string } }) {
  if (!TABLES.has(params.table)) {
    return new Response("Not found", { status: 404 });
  }
  const originUrl = prepareElectricUrl(request.url);
  originUrl.searchParams.set(`table`, `"${params.table}"`);
  return proxyElectricRequest(originUrl, request);
}

export const Route = createFileRoute("/api/models/$table")({
  server: {
    handlers: {
      GET: proxyTable,
      POST: proxyTable,
    },
  },
});
