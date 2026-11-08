import { eq, materialize, useLiveQuery } from "@tanstack/react-db";
import type { InitialQueryBuilder, Ref } from "@tanstack/react-db";

import blueprintCollection from "@/collections/blueprint";
import partCollection from "@/collections/part";
import partComponentCollection from "@/collections/part-component";

export function partComponentsQuery(q: InitialQueryBuilder, parentPartId: number | Ref<{ id: number }>["id"]) {
  return q
    .from({ partComponent: partComponentCollection })
    .where(({ partComponent }) => eq(partComponent.parentPartId, parentPartId))
    .innerJoin({ componentPart: partCollection }, ({ partComponent, componentPart }) =>
      eq(componentPart.id, partComponent.componentPartId),
    )
    .select(({ partComponent, componentPart }) => ({
      ...partComponent,
      id: componentPart.id,
      part: componentPart,
      blueprints: materialize(
        q
          .from({ blueprint: blueprintCollection })
          .where(({ blueprint }) => eq(blueprint.partId, partComponent.componentPartId)),
      ),
    }))
    .orderBy(({ componentPart }) => componentPart.description, "asc");
}

export function useQueryPartComponents(parentPartId: number) {
  return useLiveQuery((q) => partComponentsQuery(q, parentPartId));
}
