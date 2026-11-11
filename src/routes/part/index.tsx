import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import TablePart from "@/components/table/part";
import { useAppContext } from "@/contexts/app-context";
import FormPart from "@/form/forms/part";
import usePartForm from "@/form/hooks/use-part";
import { PARTS_LABEL } from "@/messages/common";
import { PART_CREATE_TITLE } from "@/messages/part";
import { tablePartStateSchema } from "@/schemas/part";
import { FormMode, TableMode } from "@/types";
import type { BasePartSerialized } from "@/types/part";

const routeSearchSchema = z.object({
  createPart: z.boolean().optional().catch(undefined),
  "table-part": tablePartStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/part/")({
  beforeLoad: ({ search }) => ({
    title: search.createPart === true ? PART_CREATE_TITLE : PARTS_LABEL,
  }),
  component: RouteComponent,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { createPart, "table-part": tablePartState } = Route.useSearch();
  const { isAdmin } = useAppContext();
  const navigate = useNavigate();

  const onFormSubmit = useCallback(
    async (part: BasePartSerialized) => {
      await navigate({
        params: { id: part.id },
        to: "/part/$id",
      });
    },
    [navigate],
  );

  const { form, formMode, validationSchema, isLoading } = usePartForm({
    requestedFormMode: FormMode.Create,
    onSubmit: onFormSubmit,
  });

  if (createPart === true) {
    return <FormPart formMode={formMode} form={form} isLoading={isLoading} validationSchema={validationSchema} />;
  }

  return (
    <TablePart
      tableMode={isAdmin ? TableMode.Editable : TableMode.ReadOnly}
      className="mx-auto"
      state={tablePartState}
    />
  );
}
