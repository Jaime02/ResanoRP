import { awaitSynced, powerSyncCollection, powerSyncCollectionOptions } from "@/collections/base";
import { userSchema } from "@/schemas/user";
import trpc from "@/trpc/trpc-client";

const userCollection = powerSyncCollection("user", (baseOptions) =>
  powerSyncCollectionOptions({
    ...baseOptions,
    schema: userSchema,
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      const { original: deletedUser } = transaction.mutations[0];
      await trpc.user.delete.mutate({ id: deletedUser.id });
      await awaitSynced();
    },
  }),
);

export default userCollection;
