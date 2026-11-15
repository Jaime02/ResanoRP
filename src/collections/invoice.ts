import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { invoiceSchema } from "@/schemas/invoice";

const invoiceCollection = powerSyncCollection("invoice", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: invoiceSchema,
    getKey: (item) => item.id,
  }),
);

export default invoiceCollection;
