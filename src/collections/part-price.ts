import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { partPriceSchema } from "@/schemas/part-price";
import trpc from "@/trpc/trpc-client";

const partPriceCollection = powerSyncCollection("part_price", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: partPriceSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedPartPrice } = transaction.mutations[0];
      await trpc.partPrice.delete.mutate({
        id: deletedPartPrice.id,
      });
      await awaitSynced();
    },
  }),
);

export default partPriceCollection;
