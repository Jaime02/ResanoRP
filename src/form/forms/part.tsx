import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import partCollection from "@/collections/part";
import DialogCreateBlueprint from "@/components/dialog/create-blueprint";
import LayoutBlueprint from "@/components/pdf/layout-blueprint-viewer";
import ButtonRestoreModel from "@/components/table/button-restore-model";
import TablePartComponents from "@/components/table/part-component";
import TablePartFeatures from "@/components/table/part-feature";
import TablePartMaterials from "@/components/table/part-material";
import TablePartPrice from "@/components/table/part-price";
import TablePartProductionHistory from "@/components/table/part-production-history";
import PartReferencesTable from "@/components/table/part-reference";
import TablePartTransactions from "@/components/table/part-transactions";
import { Badge } from "@/components/ui/badge";
import ButtonLink from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import { FormCreateBlueprint } from "@/form/forms/blueprint";
import type usePartForm from "@/form/hooks/use-part";
import { serializePart } from "@/lib/serializers";
import { ADD_BLUEPRINT_LABEL, BLUEPRINTS_TITLE } from "@/messages/blueprint";
import { DESCRIPTION_LABEL, HISTORY_LABEL, NOTES_LABEL, REFERENCE_LABEL, RESTORE_LABEL } from "@/messages/common";
import { MATERIALS_LABEL } from "@/messages/material";
import {
  CLIENT_REFERENCE_DESCRIPTION_LABEL,
  PART_COMPONENTS_TITLE,
  PART_CREATE_TITLE,
  PART_EDIT_TITLE,
  PART_FEATURES_TITLE,
  PART_LENGTH_LABEL,
  PART_REFERENCES_TITLE,
  PART_RESTORE_MESSAGE,
  PART_RESTORE_TITLE,
  PART_RESTORED_MESSAGE,
  PART_DELETED_MESSAGE,
  GENERAL_LABEL,
  PART_TRANSACTIONS_TITLE,
} from "@/messages/part";
import { PRICES_TITLE } from "@/messages/part-price";
import { PRODUCTION_HISTORY_TITLE } from "@/messages/production-order";
import type { TPartForm } from "@/queries/part";
import trpc from "@/trpc/trpc-client";
import { FormMode, TableMode } from "@/types";

const formModeToTableModeMap: Record<FormMode, TableMode> = {
  [FormMode.Create]: TableMode.Disabled,
  [FormMode.Update]: TableMode.Editable,
  [FormMode.ReadOnly]: TableMode.ReadOnly,
  [FormMode.NotApplicable]: TableMode.ReadOnly,
};

interface FormPartProps extends Pick<
  ReturnType<typeof usePartForm>,
  "form" | "isLoading" | "validationSchema" | "formMode"
> {
  testId?: string;
  part?: TPartForm;
  tab?: string;
  showCreatePartPrice?: boolean;
  editPartPriceId?: number;
  createBlueprint?: boolean;
  createPartReference?: boolean;
  createPartFeature?: boolean;
  createPartComponent?: boolean;
  editPartReferenceId?: number;
  leftHeaderComponents?: React.ReactNode;
  rightHeaderComponents?: React.ReactNode;
}

const defaultTab = "info";

export default function FormPart({
  testId = "form-part",
  formMode,
  tab = defaultTab,
  showCreatePartPrice = true,
  part,
  editPartPriceId,
  createBlueprint,
  createPartReference,
  createPartFeature,
  createPartComponent,
  editPartReferenceId,
  leftHeaderComponents,
  rightHeaderComponents,
  form,
  validationSchema,
  isLoading,
}: FormPartProps) {
  const navigate = useNavigate();
  const { isAdmin, showToastOnTRPCMutation } = useAppContext();

  const handleTabChange = useCallback(
    (value: string) => {
      void navigate({
        replace: true,
        search: (prev) => ({ ...prev, tab: value !== defaultTab ? value : undefined }),
        to: ".",
      });
    },
    [navigate],
  );

  const infoSection = {
    content: (
      <>
        {formMode !== FormMode.Create && (
          <PartReferencesTable
            tableMode={formModeToTableModeMap[formMode]}
            partReferences={part?.references}
            skeletonRowsCount={2}
            createPartReference={createPartReference}
            editPartReferenceId={editPartReferenceId}
            editPartId={part?.id}
            title={PART_REFERENCES_TITLE}
          />
        )}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
          {formMode === FormMode.Create && (
            <Card>
              <form.AppField
                name="reference.reference"
                children={(field) => (
                  <field.TextInput id="dialog-create-edit-part-reference-reference" label={REFERENCE_LABEL} />
                )}
              />
              <form.AppField
                name="reference.clientDescription"
                children={(field) => (
                  <field.TextInput
                    id="dialog-create-edit-part-reference-client-description"
                    label={CLIENT_REFERENCE_DESCRIPTION_LABEL}
                  />
                )}
              />
              <form.AppField
                name="reference.clientId"
                children={(field) => (
                  <field.ClientCombobox
                    testId="combobox-client"
                    id="dialog-create-edit-part-reference-client-id"
                    nullable
                  />
                )}
              />
            </Card>
          )}
          <div className="mx-auto flex w-fit flex-col items-start gap-3 sm:grid sm:grid-cols-2">
            <form.AppField
              name="description"
              children={(field) => (
                <field.TextInput id="dialog-create-edit-part-description" label={DESCRIPTION_LABEL} />
              )}
            />
            <form.AppField
              name="notes"
              children={(field) => <field.TextareaInput id="dialog-create-edit-part-notes" label={NOTES_LABEL} />}
            />
            <form.AppField
              name="shapeId"
              children={(field) => (
                <field.ShapeCombobox testId="combobox-shape" id="dialog-create-edit-part-shape" nullable />
              )}
            />
            <form.AppField
              name="coatingId"
              children={(field) => (
                <field.CoatingCombobox testId="combobox-coating" id="dialog-create-edit-part-coating" nullable />
              )}
            />
            <form.AppField
              name="width"
              children={(field) => (
                <field.WidthInput
                  id="input-width-create-edit-part-dialog"
                  testId="input-width"
                  layoutClassName="justify-self-end"
                />
              )}
            />
            <form.AppField
              name="length"
              children={(field) => (
                <field.DecimalInput
                  id="input-length-create-edit-part-dialog"
                  testId="input-length"
                  label={PART_LENGTH_LABEL}
                  suffix=" mm"
                  decimalScale={2}
                />
              )}
            />
          </div>
          {formMode === FormMode.Create && (
            <Card>
              <FormCreateBlueprint />
            </Card>
          )}
        </div>
        {formMode !== FormMode.ReadOnly && (
          <form.ButtonSubmit
            className="self-end"
            customText={formMode === FormMode.Create ? PART_CREATE_TITLE : PART_EDIT_TITLE}
          />
        )}
      </>
    ),
    label: GENERAL_LABEL,
    value: "info",
  };

  const sections =
    formMode === FormMode.Create
      ? [infoSection]
      : [
          infoSection,
          {
            content: (
              <>
                <LayoutBlueprint blueprints={part?.blueprints} />
                {formMode !== FormMode.ReadOnly && (
                  <ButtonLink
                    testId="button-add-blueprint"
                    variant="success"
                    to="."
                    search={(prev) => ({ ...prev, createBlueprint: true })}
                  >
                    <PlusIcon />
                    {ADD_BLUEPRINT_LABEL}
                  </ButtonLink>
                )}
                <DialogCreateBlueprint open={createBlueprint} partId={part?.id} />
                <TablePartFeatures
                  tableMode={formModeToTableModeMap[formMode]}
                  partFeatures={part?.features}
                  partId={part?.id}
                  createPartFeature={createPartFeature}
                  skeletonRowsCount={2}
                  title={PART_FEATURES_TITLE}
                />
              </>
            ),
            label: BLUEPRINTS_TITLE,
            value: "blueprints",
          },
          ...(isAdmin
            ? [
                {
                  content: (
                    <TablePartPrice
                      testId="table-part-prices"
                      tableMode={formModeToTableModeMap[formMode]}
                      partId={part?.id}
                      partPrices={part?.prices}
                      editPartPriceId={editPartPriceId}
                      skipQueries={isLoading}
                      skeletonRowsCount={2}
                      collapsibleCreatePartPrice={false}
                      showCreatePartPrice={showCreatePartPrice && part?.deletedAt == null}
                      title={null}
                    />
                  ),
                  label: PRICES_TITLE,
                  value: "prices",
                },
              ]
            : []),
          {
            content: (
              <form.Subscribe
                selector={(state) => [state.values.width, state.values.shapeId] as const}
                children={([width, shapeId]) => (
                  <TablePartMaterials
                    tableMode={formModeToTableModeMap[formMode]}
                    part={part}
                    width={width}
                    shapeId={shapeId}
                    skipQueries={isLoading}
                  />
                )}
              />
            ),
            label: MATERIALS_LABEL,
            value: "materials",
          },
          {
            content: (
              <TablePartComponents
                tableMode={formModeToTableModeMap[formMode]}
                partComponents={part?.components}
                partId={part?.id}
                createPartComponent={createPartComponent}
                showCreatePartComponent={part?.deletedAt == null}
                skeletonRowsCount={2}
                title={PART_COMPONENTS_TITLE}
              />
            ),
            label: PART_COMPONENTS_TITLE,
            value: "components",
          },
          {
            content: (
              <>
                <TablePartProductionHistory
                  title={PRODUCTION_HISTORY_TITLE}
                  partId={part?.id}
                  skipQueries={isLoading}
                />
                <TablePartTransactions
                  testId="table-part-delivery-note-consumptions"
                  title={PART_TRANSACTIONS_TITLE}
                  partId={part?.id}
                  rows={part?.stockTransactions}
                  isLoading={part === undefined}
                />
              </>
            ),
            label: HISTORY_LABEL,
            value: "history",
          },
        ];

  return (
    <FormContextProvider
      form={form as any}
      testId={testId}
      formMode={formMode}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      {part?.deletedAt && (
        <div className="flex flex-row items-center gap-2">
          <Badge variant="destructive" size="lg" testId="badge-part-deleted">
            <TriangleAlertIcon className="size-icon" />
            {PART_DELETED_MESSAGE}
          </Badge>
          {isAdmin && (
            <ButtonRestoreModel
              dialogTitle={PART_RESTORE_TITLE}
              dialogDescription={PART_RESTORE_MESSAGE}
              serializedModel={serializePart(part)}
              triggerExtraComponents={RESTORE_LABEL}
              size="default"
              onConfirm={() =>
                void showToastOnTRPCMutation({
                  mutation: trpc.part.restore.mutate({ id: part.id }),
                  onSuccess: { title: PART_RESTORED_MESSAGE },
                  collection: partCollection,
                })
              }
            />
          )}
        </div>
      )}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
          {leftHeaderComponents}
          {formMode !== FormMode.Create && (
            <TabsList className="mx-auto">
              {sections.map((section) => (
                <TabsTrigger key={section.value} value={section.value}>
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          {rightHeaderComponents}
        </div>
        {sections.map((section) => (
          <TabsContent key={section.value} value={section.value} className="items-center">
            {section.content}
          </TabsContent>
        ))}
      </Tabs>
    </FormContextProvider>
  );
}
