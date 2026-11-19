import { powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { configurationSchema } from "@/schemas/configuration";

const configurationCollection = powerSyncCollection("configuration", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: configurationSchema,
    getKey: (item) => item.id,
  }),
);

export default configurationCollection;
