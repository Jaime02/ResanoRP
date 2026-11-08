import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import DialogQueryError from "@/components/dialog/query-error";
import ButtonLink from "@/components/ui/button-link";
import { useAppContext } from "@/contexts/app-context";
import FormPart from "@/form/forms/part";
import usePartForm from "@/form/hooks/use-part";
import { PART_LABEL } from "@/messages/common";
import { PART_CREATE_TITLE, PART_FETCH_ERROR_MESSAGE, PART_FETCH_ERROR_TITLE, VIEW_PARTS_LABEL } from "@/messages/part";
import { optionalIdSchema, stringSchema } from "@/schemas";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const routeSearchSchema = z.object({
  createBlueprint: z.boolean().optional().catch(undefined),
  createPartComponent: z.boolean().optional().catch(undefined),
  createPartFeature: z.boolean().optional().catch(undefined),
  createPartReference: z.boolean().optional().catch(undefined),
  editPartPriceId: optionalIdSchema.catch(undefined),
  editPartReferenceId: optionalIdSchema.catch(undefined),
  tab: stringSchema().optional().catch(undefined),
});

export const Route = createFileRoute("/part/$id")({
  beforeLoad: () => ({
    title: PART_LABEL,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { id: partId } = Route.useParams();
  const {
    tab,
    editPartPriceId,
    createBlueprint,
    createPartComponent,
    createPartFeature,
    createPartReference,
    editPartReferenceId,
  } = Route.useSearch();

  const { isAdmin } = useAppContext();
  const navigate = useNavigate();

  const requestedFormMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;

  const onSubmit = useCallback(async () => {
    await navigate({
      search: (prev) => ({
        ...prev,
        createBlueprint: undefined,
        createPartComponent: undefined,
        createPartFeature: undefined,
        createPartReference: undefined,
        editPartPriceId: undefined,
        editPartReferenceId: undefined,
        tab: undefined,
      }),
      to: ".",
    });
  }, [navigate]);

  const { form, formMode, validationSchema, part, isLoading, getPartByIdError } = usePartForm({
    requestedFormMode,
    onSubmit,
    partId,
  });

  if (getPartByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-part-by-id-query"
        title={PART_FETCH_ERROR_TITLE}
        errorMessage={PART_FETCH_ERROR_MESSAGE}
        onClose={() => void navigate({ to: "/part" })}
      />
    );
  }

  return (
    <FormPart
      formMode={formMode}
      tab={tab}
      part={part}
      form={form}
      validationSchema={validationSchema}
      isLoading={isLoading}
      editPartPriceId={editPartPriceId}
      createBlueprint={createBlueprint}
      createPartComponent={createPartComponent}
      createPartFeature={createPartFeature}
      createPartReference={createPartReference}
      editPartReferenceId={editPartReferenceId}
      leftHeaderComponents={
        <ButtonLink to="/part" className="justify-self-start">
          {VIEW_PARTS_LABEL}
        </ButtonLink>
      }
      rightHeaderComponents={
        isAdmin && (
          <ButtonLink
            testId="button-create-part"
            variant="success"
            to="/part"
            search={(prev) => ({ ...prev, createPart: true })}
            className="justify-self-end"
          >
            {PART_CREATE_TITLE}
          </ButtonLink>
        )
      }
    />
  );
}
