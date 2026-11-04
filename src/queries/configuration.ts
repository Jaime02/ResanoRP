import { useLiveQuery } from "@tanstack/react-db";

import configurationCollection from "@/collections/configuration";

export function useQueryConfiguration() {
  return useLiveQuery((q) =>
    q
      .from({ configuration: configurationCollection })
      .orderBy(({ configuration }) => [configuration.id, "asc"])
      .findOne(),
  );
}
