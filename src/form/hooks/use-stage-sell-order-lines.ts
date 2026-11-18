import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import { groupStagedSellOrderLines, splitQuantityFifo } from "@/lib/sell-order-line";
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
  defaultClientId?: number;
  onSubmit?: () => Promise<void>;
}

export function useStageSellOrderLinesForm({ defaultClientId, onSubmit }: UseStageSellOrderLinesFormProps = {}) {
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
      clientId: defaultClientId ?? (null as number | null),
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

  const stagedPartRows = useMemo(
    () => groupStagedSellOrderLines(pendingSellOrderLines, stagedSellOrderLines),
    [pendingSellOrderLines, stagedSellOrderLines],
  );
  // The schema leaves out the lines at 0 of a part, so it would silently skip a whole part set to 0
  const hasEmptyStagedPart = stagedPartRows.some((row) => row.quantity === 0);

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
      const updatedLines = [
        ...(stagedSellOrderLines ?? []).filter((line) => line.id !== stagedSellOrderLineId),
        { id: stagedSellOrderLineId, quantity: stagedQuantity },
      ];
      // The part keeps a single total, so a line joining it is filled in the order the lines are served in
      const partRow = groupStagedSellOrderLines(pendingSellOrderLines, updatedLines).find((row) =>
        row.lines.some((line) => line.id === stagedSellOrderLineId),
      );
      const splitQuantities = partRow ? splitQuantityFifo(partRow.lines, partRow.quantity) : [];
      form.setFieldValue(
        "stagedSellOrderLines",
        updatedLines.map((line) => splitQuantities.find((split) => split.id === line.id) ?? line),
      );
    },
    [form, pendingSellOrderLines, stagedSellOrderLines],
  );

  const unstageSellOrderLines = useCallback(
    async (sellOrderLineIds: Array<number>) => {
      if (!stagedSellOrderLines) {
        await log(LoggerLevels.warning, LogMessages.unstageWithoutStagedLines);
        return;
      }
      const updatedLines = stagedSellOrderLines.filter((line) => !sellOrderLineIds.includes(line.id));
      form.setFieldValue("stagedSellOrderLines", updatedLines);
    },
    [form, stagedSellOrderLines],
  );

  // The lines of a part are given in the order they are served in, so the total fills the earliest ones first
  const updateStagedGroupQuantity = useCallback(
    async (sellOrderLineIds: Array<number>, total: number) => {
      if (!stagedSellOrderLines) {
        await log(LoggerLevels.warning, LogMessages.updateWithoutStagedLines);
        return;
      }
      const groupLines = sellOrderLineIds
        .map((id) => pendingSellOrderLines?.find((line) => line.id === id))
        .filter((line) => line !== undefined);
      if (groupLines.length !== sellOrderLineIds.length) {
        await log(LoggerLevels.warning, LogMessages.updateNotStagedSellOrderLine);
        return;
      }
      const splitQuantities = splitQuantityFifo(groupLines, total);
      form.setFieldValue(
        "stagedSellOrderLines",
        stagedSellOrderLines.map((line) => splitQuantities.find((split) => split.id === line.id) ?? line),
      );
    },
    [form, pendingSellOrderLines, stagedSellOrderLines],
  );

  useEffect(() => {
    if (pendingSellOrderLines === undefined || stagedSellOrderLines === undefined) {
      return;
    }
    // A staged line that is no longer pending can not be served anymore
    const validStagedSellOrderLines = stagedSellOrderLines.filter((stagedSellOrderLine) =>
      pendingSellOrderLines.some((sellOrderLine) => sellOrderLine.id === stagedSellOrderLine.id),
    );
    if (validStagedSellOrderLines.length !== stagedSellOrderLines.length) {
      form.setFieldValue("stagedSellOrderLines", validStagedSellOrderLines);
    }
  }, [pendingSellOrderLines, stagedSellOrderLines, form]);

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
    hasEmptyStagedPart,
    pendingSellOrderLines,
    stagedPartRows,
    stageSellOrderLinesFormMode,
    setStageSellOrderLinesFormMode,
    stageSellOrderLine,
    stagedSellOrderLines,
    unstageSellOrderLines,
    updateStagedGroupQuantity,
  };
}
