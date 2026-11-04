import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import PickerPart from "@/components/picker/picker-part";
import TableTreatmentBatch from "@/components/table/treatment-batch";
import TableTreatmentPending from "@/components/table/treatment-pending";
import DateInput from "@/components/ui/date-input";
import Header from "@/components/ui/header";
import { Separator } from "@/components/ui/separator";
import { startOfAppDay } from "@/lib/dates";
import { useNow } from "@/lib/use-now";
import {
  IN_TREATMENT_TITLE,
  NO_PARTS_IN_TREATMENT_MESSAGE,
  TREATMENT_HISTORY_EMPTY_MESSAGE,
  TREATMENT_HISTORY_TITLE,
  TREATMENT_LABEL,
} from "@/messages/treatment";
import { useQueryTreatmentBatches } from "@/queries/treatment";
import type { TTreatmentBatch } from "@/queries/treatment";
import type { TPartFilters } from "@/schemas/part";
import { tableTreatmentPendingStateSchema } from "@/schemas/treatment";
import { TablePartPickerMode } from "@/types";

const HISTORY_PART_FILTERS: TPartFilters = [{ id: "hasCoating", value: true }];

const routeSearchSchema = z.object({
  "table-treatment-pending": tableTreatmentPendingStateSchema.optional().catch(undefined),
});

export const Route = createFileRoute("/treatment")({
  beforeLoad: () => ({
    title: TREATMENT_LABEL,
  }),
  component: RouteComponent,
  validateSearch: routeSearchSchema,
});

function RouteComponent() {
  const { "table-treatment-pending": tableTreatmentPendingState } = Route.useSearch();
  const [historyPartId, setHistoryPartId] = useState<number | null>(null);
  const now = useNow();
  const [pickedHistoryDate, setHistoryDate] = useState<Date | null>();
  const historyDate = pickedHistoryDate !== undefined ? pickedHistoryDate : now && startOfAppDay(now);
  const isHistoryFiltered = historyPartId != null || historyDate != null;
  const { data: batches } = useQueryTreatmentBatches();
  const { data: historyBatches } = useQueryTreatmentBatches({
    partId: historyPartId,
    date: historyDate,
    enabled: isHistoryFiltered,
  });

  return (
    <div className="mx-auto flex flex-col gap-6">
      <TableTreatmentPending state={tableTreatmentPendingState} />
      <section data-testid="section-treatment-out" className="flex flex-col gap-3">
        <Separator />
        <Header>{IN_TREATMENT_TITLE}</Header>
        <TreatmentBatches batches={batches.filter((batch) => !batch.isReceived)} />
      </section>
      <section data-testid="section-treatment-history" className="flex flex-col gap-3">
        <Separator />
        <Header>{TREATMENT_HISTORY_TITLE}</Header>
        <div className="flex flex-row flex-wrap justify-center gap-3">
          <DateInput testId="input-treatment-history-date" date={historyDate} onValueChange={setHistoryDate} />
          <PickerPart
            testId="picker-treatment-history-part"
            pickerMode={TablePartPickerMode.PickParts}
            defaultFilters={HISTORY_PART_FILTERS}
            onRowSelect={(row) => setHistoryPartId(row?.partId ?? null)}
          />
        </div>
        {isHistoryFiltered ? (
          <TreatmentBatches batches={historyBatches.filter((batch) => batch.isReceived)} />
        ) : (
          <p className="text-center">{TREATMENT_HISTORY_EMPTY_MESSAGE}</p>
        )}
      </section>
    </div>
  );
}

function TreatmentBatches({ batches }: { batches: Array<TTreatmentBatch> }) {
  if (batches.length === 0) return <p className="text-center">{NO_PARTS_IN_TREATMENT_MESSAGE}</p>;
  return batches.map((batch) => <TableTreatmentBatch key={batch.sentAt.getTime()} batch={batch} />);
}
