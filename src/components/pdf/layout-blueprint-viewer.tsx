import { useDbClient } from "@tanstack/react-db";
import { PrinterIcon } from "lucide-react";
import { useState } from "react";

import blueprintCollection from "@/collections/blueprint";
import DialogEditBlueprint from "@/components/dialog/edit-blueprint";
import LayoutPDFViewer from "@/components/pdf/layout-pdf-viewer";
import PDFViewer from "@/components/pdf/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { ModelActions } from "@/components/ui/model-actions";
import { useAppContext } from "@/contexts/app-context";
import { serializeBlueprint } from "@/lib/serializers";
import {
  BLUEPRINT_DELETED_MESSAGE,
  BLUEPRINTS_EMPTY_MESSAGE,
  DELETE_BLUEPRINT_MESSAGE,
  DELETE_BLUEPRINT_TITLE,
} from "@/messages/blueprint";
import type { TClientBlueprint, TPartForm } from "@/queries/part";

export interface LayoutBlueprintViewerProps extends Pick<
  React.ComponentProps<typeof LayoutPDFViewer>,
  "stackedFiles" | "layoutClassName"
> {
  blueprints?: TPartForm["blueprints"];
  pdfViewerClassName?: string;
  fullScreenContent?: React.ReactNode;
}

export default function LayoutBlueprintViewer({
  blueprints,
  pdfViewerClassName,
  fullScreenContent,
  ...props
}: LayoutBlueprintViewerProps) {
  const dbClient = useDbClient();
  const { isAdmin, showToastOnTransaction } = useAppContext();
  const [editBlueprintId, setEditBlueprintId] = useState<number | null>(null);

  const renderCard = (blueprint: NonNullable<TClientBlueprint>, navigation?: React.ReactNode) => (
    <Card key={blueprint.id} data-testid={`card-blueprint-${blueprint.id}`} className="min-h-0 flex-1">
      <PDFViewer
        url={blueprint.fileUrl}
        pdfViewerClassName={pdfViewerClassName}
        fullScreenContent={fullScreenContent}
        renderHeader={(toolbar, disabled) => (
          <CardHeader className="w-full">
            <CardTitle>{blueprint.fileName}</CardTitle>
            <CardAction>
              <ModelActions
                {...(isAdmin
                  ? {
                      deleteButton: {
                        dialogTitle: DELETE_BLUEPRINT_TITLE,
                        dialogDescription: DELETE_BLUEPRINT_MESSAGE,
                        serializedModel: serializeBlueprint(blueprint),
                        onConfirm: async () =>
                          showToastOnTransaction({
                            transaction: () =>
                              dbClient.collection(blueprintCollection).delete(blueprint.id, {
                                optimistic: import.meta.env.VITE_ENV_NAME !== "test",
                              }),
                            onSuccess: {
                              title: BLUEPRINT_DELETED_MESSAGE,
                              description: `El plano ${blueprint.fileName} ha sido eliminado correctamente`,
                            },
                          }),
                      },
                      onEdit: async () => setEditBlueprintId(blueprint.id),
                    }
                  : {})}
                extraComponentsStart={
                  <>
                    {navigation}
                    {toolbar}
                    <Button
                      testId="button-print-blueprint"
                      size="icon"
                      disabled={disabled}
                      onClick={() => {
                        // TODO
                        console.log("Print blueprint");
                      }}
                    >
                      <PrinterIcon />
                    </Button>
                  </>
                }
              />
            </CardAction>
          </CardHeader>
        )}
      />
    </Card>
  );

  return (
    <>
      <LayoutPDFViewer
        files={blueprints}
        renderCard={renderCard}
        noFilesMessage={BLUEPRINTS_EMPTY_MESSAGE}
        {...props}
      />
      <DialogEditBlueprint
        blueprint={blueprints?.find((blueprint) => blueprint.id === editBlueprintId) ?? null}
        onClose={async () => setEditBlueprintId(null)}
      />
    </>
  );
}
