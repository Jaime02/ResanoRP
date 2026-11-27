import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { TPartTableOnRowSelectParams } from "@/components/table/part";
import TablePart from "@/components/table/part";
import ButtonLink from "@/components/ui/button-link";
import type { PickerProps } from "@/components/ui/picker";
import Picker from "@/components/ui/picker";
import { useAppContext } from "@/contexts/app-context";
import { SELECT_PART_PLACEHOLDER } from "@/messages/combobox";
import { PART_CREATE_TITLE } from "@/messages/part";
import { DEFAULT_PART_SORTING } from "@/queries/part";
import type { TTableState } from "@/schemas";
import { tablePartStateSchema, type TPartFilters, type TTablePartState } from "@/schemas/part";
import type { TablePartPickerMode } from "@/types";
import { TableMode } from "@/types";
import { CREATE_PART_BUTTON_TEST_ID } from "@/types/part";

const DEFAULT_STATE: TTablePartState = {
  filters: [{ id: "includePartReferenceNullClientId", value: true }],
  sorts: DEFAULT_PART_SORTING,
};

export interface PickerPartProps extends Omit<PickerProps<TPartTableOnRowSelectParams>, "children"> {
  id?: string;
  currentClientId?: number | null;
  pickerMode: TablePartPickerMode;
  defaultFilters?: TPartFilters;
}

export default function PickerPart({
  id,
  currentClientId,
  label = SELECT_PART_PLACEHOLDER,
  onRowSelect,
  pickerMode,
  defaultFilters,
  ...props
}: PickerPartProps) {
  const { isAdmin } = useAppContext();
  const [state, setState] = useState<TTableState | undefined>();
  const tableState = useMemo(() => tablePartStateSchema.safeParse(state).data, [state]);
  const defaultState = useMemo(
    () =>
      defaultFilters ? { ...DEFAULT_STATE, filters: [...DEFAULT_STATE.filters!, ...defaultFilters] } : DEFAULT_STATE,
    [defaultFilters],
  );

  return (
    <Picker
      id={id}
      testId="picker-part"
      label={label}
      onRowSelect={onRowSelect}
      children={({ onRowSelect }) => (
        <TablePart
          testId="table-picker-part"
          highlightRowOnHover={false}
          tableMode={TableMode.Picker}
          currentClientId={currentClientId}
          defaultState={defaultState}
          state={tableState}
          onStateChange={setState}
          pickerMode={pickerMode}
          onRowSelect={onRowSelect}
          headerExtraComponents={
            isAdmin ? (
              <ButtonLink
                testId={CREATE_PART_BUTTON_TEST_ID}
                variant="success"
                to="/part"
                search={{ createPart: true }}
                target="_blank"
              >
                <PlusIcon /> {PART_CREATE_TITLE}
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      {...props}
    />
  );
}
