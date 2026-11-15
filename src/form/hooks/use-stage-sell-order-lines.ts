import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { DELIVERY_NOTE_CREATED_MESSAGE, LINES_ADDED_TO_DELIVERY_NOTE_MESSAGE } from "@/messages/delivery-note";
import { useQueryClientDefaultDeliveryMethod } from "@/queries/client";
import { useQueryPendingSellOrderLines } from "@/queries/sell-order-line";
import { appendLinesToDeliveryNoteSchema, createDeliveryNoteWithLinesSchema } from "@/schemas/delivery-note";
import type {
  TAppendLinesToDeliveryNote,
  TCreateDeliveryNoteWithLines,
  TStagedSellOrderLine,
} from "@/schemas/delivery-note";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

export enum StageSellOrderLinesFormMode {
  CreateNewDeliveryNote,
  AppendToExistingDeliveryNote,
}

interface UseStageSellOrderLinesFormProps {
  onSubmit?: () => Promise<void>;
}

export function useStageSellOrderLinesForm({ onSubmit }: UseStageSellOrderLinesFormProps = {}) {
  const { showToastOnTRPCMutation } = useAppContext();

  const [stageSellOrderLinesFormMode, setStageSellOrderLinesFormMode] = useState(
    StageSellOrderLinesFormMode.CreateNewDeliveryNote,
  );

  const userChangedDeliveryMethodRef = useRef(false);

  const validationSchema =
    stageSellOrderLinesFormMode === StageSellOrderLinesFormMode.CreateNewDeliveryNote
      ? createDeliveryNoteWithLinesSchema
      : appendLinesToDeliveryNoteSchema;

  const form = useAppForm({
    formId: "stageSellOrderLines",
    defaultValues: {
      clientId: null as number | null,
      deliveryMethodId: null as number | null,
      deliveryNoteId: null as number | null,
      stagedSellOrderLines: undefined as Array<TStagedSellOrderLine> | undefined,
    },
    listeners: {
      onChange: ({ fieldApi }) => {
        if (fieldApi.name === "deliveryMethodId") {
          userChangedDeliveryMethodRef.current = true;
        } else if (fieldApi.name === "clientId") {
          userChangedDeliveryMethodRef.current = false;
        }
      },
    },
    onSubmit: async ({ value }) => {
      const stagedSellOrderLines = value.stagedSellOrderLines!.map((line) => ({
        id: line.id,
        quantity: line.quantity,
      }));
      const result =
        stageSellOrderLinesFormMode === StageSellOrderLinesFormMode.CreateNewDeliveryNote
          ? await showToastOnTRPCMutation({
              mutation: trpc.deliveryNote.createWithLines.mutate({
                ...value,
                stagedSellOrderLines,
              } as TCreateDeliveryNoteWithLines),
              onSuccess: { title: DELIVERY_NOTE_CREATED_MESSAGE },
              onSubmit,
            })
          : await showToastOnTRPCMutation({
              mutation: trpc.deliveryNote.appendLines.mutate({
                deliveryNoteId: value.deliveryNoteId,
                stagedSellOrderLines,
              } as TAppendLinesToDeliveryNote),
              onSuccess: { title: LINES_ADDED_TO_DELIVERY_NOTE_MESSAGE },
              onSubmit,
            });
      if (result === null) {
        return;
      }
      form.setFieldValue("stagedSellOrderLines", undefined);
      setStageSellOrderLinesFormMode(StageSellOrderLinesFormMode.CreateNewDeliveryNote);
    },
    validators: {
      // @ts-expect-error Incompatible types between the schemas and Form fields
      onChange: validationSchema,
      // @ts-expect-error Incompatible types between the schemas and Form fields
      onSubmit: validationSchema,
    },
  });

  useEffect(() => {
    // The validity was computed with the schema of the other mode
    void form.validate("change");
  }, [form, validationSchema]);

  const clientId = useSelector(form.store, (state) => state.values.clientId);
  const stagedSellOrderLines = useSelector(form.store, (state) => state.values.stagedSellOrderLines);

  const {
    data: pendingSellOrderLines,
    isLoading: isLoadingPendingSellOrders,
    isLoadingError,
    isCrashed,
  } = useQueryPendingSellOrderLines({ clientId });

  const { data: defaultDeliveryMethodOfClient, isLoading: isLoadingDefaultDeliveryMethod } =
    useQueryClientDefaultDeliveryMethod(clientId);

  const suggestedDeliveryMethodId = useMemo(() => {
    if (clientId === null || defaultDeliveryMethodOfClient == null) {
      return null;
    }
    return defaultDeliveryMethodOfClient.id;
  }, [clientId, defaultDeliveryMethodOfClient]);

  const stageSellOrderLine = useCallback(
    async (stagedSellOrderLineId: number, stagedQuantity: number) => {
      const sellOrderLine = pendingSellOrderLines?.find((sellOrderLine) => sellOrderLine.id === stagedSellOrderLineId);
      if (!sellOrderLine) {
        await log(LoggerLevels.warning, LogMessages.stageNotPendingSellOrderLine);
        return;
      }
      const stagedSellOrderLine = { ...sellOrderLine, quantity: stagedQuantity };
      if (!stagedSellOrderLines) {
        // No staged lines yet, create the array with the new line
        form.setFieldValue("stagedSellOrderLines", [stagedSellOrderLine]);
        return;
      }
      const existingLineIndex = stagedSellOrderLines.findIndex((line) => line.id === stagedSellOrderLineId);
      if (existingLineIndex !== -1) {
        const updatedLines = [...stagedSellOrderLines];
        updatedLines[existingLineIndex] = stagedSellOrderLine;
        form.setFieldValue("stagedSellOrderLines", updatedLines);
      } else {
        form.setFieldValue("stagedSellOrderLines", [...stagedSellOrderLines, stagedSellOrderLine]);
      }
    },
    [form, pendingSellOrderLines, stagedSellOrderLines],
  );

  const unstageSellOrderLine = useCallback(
    async (sellOrderLineId: number) => {
      if (!stagedSellOrderLines) {
        await log(LoggerLevels.warning, LogMessages.unstageWithoutStagedLines);
        return;
      }
      const updatedLines = stagedSellOrderLines.filter((line) => line.id !== sellOrderLineId);
      form.setFieldValue("stagedSellOrderLines", updatedLines);
    },
    [form, stagedSellOrderLines],
  );

  const updateStagedSellOrderLineQuantity = useCallback(
    async (sellOrderLineId: number, quantity: number) => {
      if (!stagedSellOrderLines) {
        await log(LoggerLevels.warning, LogMessages.updateWithoutStagedLines);
        return;
      }
      const lineIndex = stagedSellOrderLines.findIndex((line) => line.id === sellOrderLineId);
      if (lineIndex === -1) {
        await log(LoggerLevels.warning, LogMessages.updateNotStagedSellOrderLine);
        return;
      }
      const updatedLines = [...stagedSellOrderLines];
      updatedLines[lineIndex] = {
        ...updatedLines[lineIndex],
        quantity,
      };
      form.setFieldValue("stagedSellOrderLines", updatedLines);
    },
    [form, stagedSellOrderLines],
  );

  useEffect(() => {
    if (pendingSellOrderLines === undefined || stagedSellOrderLines === undefined) {
      return;
    }
    // Whenever the pendingOrdersChange, check that the staged lines are still submitable
    const validStagedSellOrderLines = stagedSellOrderLines.filter((stagedSellOrderLine) =>
      pendingSellOrderLines.some((sellOrderLine) => sellOrderLine.id === stagedSellOrderLine.id),
    );

    // All the staged sell order lines are still valid, no need to update
    if (validStagedSellOrderLines.length === stagedSellOrderLines.length) {
      return;
    }

    const deletedSellOrderLines = stagedSellOrderLines.filter(
      (stagedSellOrderLine) =>
        !pendingSellOrderLines.some((sellOrderLine) => sellOrderLine.id === stagedSellOrderLine.id),
    );
    if (deletedSellOrderLines.length === 0) {
      void log(LoggerLevels.warning, LogMessages.stagedSellOrderLinesInvalid);
      return;
    }

    for (const deletedSellOrderLine of deletedSellOrderLines) {
      void unstageSellOrderLine(deletedSellOrderLine.id);
    }

    form.setFieldValue("stagedSellOrderLines", validStagedSellOrderLines);
  }, [pendingSellOrderLines, stagedSellOrderLines, form, unstageSellOrderLine]);

  useEffect(() => {
    // Set the delivery method if the user has not changed it
    if (
      suggestedDeliveryMethodId !== null &&
      !userChangedDeliveryMethodRef.current &&
      form.getFieldValue("deliveryMethodId") === null
    ) {
      form.setFieldValue("deliveryMethodId", suggestedDeliveryMethodId);
    }
  }, [form, suggestedDeliveryMethodId]);

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  const isLoading = isLoadingPendingSellOrders || isLoadingDefaultDeliveryMethod || isSubmitting;

  return {
    form,
    validationSchema,
    formMode: FormMode.Create,
    getPendingSellOrdersError:
      isLoadingError || isCrashed || (!isLoadingPendingSellOrders && pendingSellOrderLines === undefined),
    isLoading,
    pendingSellOrderLines,
    stageSellOrderLinesFormMode,
    setStageSellOrderLinesFormMode,
    stageSellOrderLine,
    stagedSellOrderLines,
    unstageSellOrderLine,
    updateStagedSellOrderLineQuantity,
  };
}
