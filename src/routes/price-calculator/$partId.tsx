import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import DialogQueryError from "@/components/dialog/query-error";
import ButtonLink from "@/components/ui/button-link";
import { ResizablePanel, ResizablePanelGroup, ResizablePanelSeparator } from "@/components/ui/resizable";
import { UserMode, useAppContext } from "@/contexts/app-context";
import FormPart from "@/form/forms/part";
import FormPartPriceEstimator from "@/form/forms/part-price-estimator";
import usePartForm from "@/form/hooks/use-part";
import usePartPriceEstimatorForm from "@/form/hooks/use-part-price-estimator";
import { OPEN_PART_LABEL, PART_FETCH_ERROR_MESSAGE, PART_FETCH_ERROR_TITLE } from "@/messages/part";
import { PENDING_PRICES_LABEL, PRICE_CALCULATOR_TITLE } from "@/messages/part-price";
import { optionalIdSchema, stringSchema } from "@/schemas";
import { FormMode } from "@/types";

const routeParamsSchema = z.object({
  partId: z.coerce.number().int().positive(),
});

const routeSearchSchema = z.object({
  createBlueprint: z.boolean().optional().catch(undefined),
  createPartReference: z.boolean().optional().catch(undefined),
  editPartPriceId: optionalIdSchema.catch(undefined),
  editPartReferenceId: optionalIdSchema.catch(undefined),
  tab: stringSchema().optional().catch(undefined),
});

export const Route = createFileRoute("/price-calculator/$partId")({
  beforeLoad: () => ({
    title: PRICE_CALCULATOR_TITLE,
  }),
  component: RouteComponent,
  params: routeParamsSchema,
  staticData: { userModes: [UserMode.Admin] },
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { partId } = Route.useParams();
  const { tab, editPartPriceId, createBlueprint, createPartReference, editPartReferenceId } = Route.useSearch();

  const { isAdmin } = useAppContext();
  const navigate = useNavigate();

  const requestedFormMode = isAdmin ? FormMode.Update : FormMode.ReadOnly;

  const onSubmit = useCallback(async () => {
    await navigate({
      search: (prev) => ({
        ...prev,
        createBlueprint: undefined,
        createPartReference: undefined,
        editPartPriceId: undefined,
        editPartReferenceId: undefined,
      }),
      to: ".",
    });
  }, [navigate]);

  const {
    form: formPart,
    formMode,
    validationSchema: validationSchemaPart,
    part,
    isLoading: isLoadingPart,
    getPartByIdError,
  } = usePartForm({ requestedFormMode, onSubmit, partId });

  const {
    form: formEstimator,
    validationSchema: validationSchemaEstimator,
    pendingPartPrices,
    isLoading: isLoadingEstimator,
  } = usePartPriceEstimatorForm({ partId, part, isLoadingPart });

  if (getPartByIdError) {
    return (
      <DialogQueryError
        testId="dialog-error-get-part-by-id-query"
        title={PART_FETCH_ERROR_TITLE}
        errorMessage={PART_FETCH_ERROR_MESSAGE}
        onClose={() => void navigate({ to: "/price-calculator" })}
      />
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-auto">
      <ResizablePanel minSize="25" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-row justify-center gap-2">
          <ButtonLink to="/price-calculator">{PENDING_PRICES_LABEL}</ButtonLink>
          <ButtonLink to="/part/$id" params={{ id: partId }} target="_blank">
            {OPEN_PART_LABEL}
          </ButtonLink>
        </div>
        <FormPart
          showCreatePartPrice={false}
          tab={tab}
          formMode={formMode}
          part={part}
          form={formPart}
          validationSchema={validationSchemaPart}
          isLoading={isLoadingPart}
          editPartPriceId={editPartPriceId}
          createBlueprint={createBlueprint}
          createPartReference={createPartReference}
          editPartReferenceId={editPartReferenceId}
        />
      </ResizablePanel>
      <ResizablePanelSeparator />
      <ResizablePanel minSize="25" className="flex min-w-0 flex-col gap-3">
        <FormPartPriceEstimator
          form={formEstimator}
          validationSchema={validationSchemaEstimator}
          part={part}
          pendingPartPrices={pendingPartPrices}
          isLoading={isLoadingEstimator}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
