import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { electricCollection } from "@/collections/base";
import { invoiceSchema } from "@/schemas/invoice";

const invoiceCollection = electricCollection("invoice", (baseOptions) =>
  electricCollectionOptions({
    ...baseOptions,
    syncMode: "on-demand",
    schema: invoiceSchema,
    getKey: (item) => item.id,
  }),
);

export default invoiceCollection;
