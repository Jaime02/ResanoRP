import { flexRender } from "@tanstack/react-table";
import type { Cell } from "@tanstack/react-table";
import { useCallback, useRef, useState } from "react";

import type { TBaseTableFeatures } from "@/components/table/base-table";
import { isCellEditable } from "@/components/table/column-helper";
import { Checkbox } from "@/components/ui/checkbox";
import DateInput from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import NumberInput from "@/components/ui/number-input";
import PriceInput from "@/components/ui/price-input";
import { goToNextFocusableElement } from "@/form/utils";
import { getTranslatedEnumValues } from "@/lib/translations";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import type { TBaseModel } from "@/schemas";
import { CellDataType } from "@/types";

interface EditableCellProps<TRowType extends TBaseModel> {
  cell: Cell<TBaseTableFeatures, TRowType>;
  onRowEdit?: (cell: Cell<TBaseTableFeatures, TRowType>, value: unknown) => void | Promise<void>;
  onRowChange?: (cell: Cell<TBaseTableFeatures, TRowType, unknown>, value: unknown) => void;
}

export interface EditableCellRenderProps<TRowType extends TBaseModel> extends EditableCellProps<TRowType> {
  value: unknown;
  setValue: (value: unknown) => void;
  onBlur: () => void;
}

export default function EditableCell<TRowType extends TBaseModel>({
  cell,
  onRowEdit: onRowEditProp,
  onRowChange,
}: EditableCellProps<TRowType>) {
  const initialValue = cell.getValue();
  const ref = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  // Only holds what is typed until the edit settles, so a rejected or rolled back edit, or a change synced from
  // elsewhere, shows the value of the row again
  const [draft, setDraft] = useState<{ value: unknown } | null>(null);
  const value = draft !== null ? draft.value : initialValue;
  const setValue = useCallback((newValue: unknown) => setDraft({ value: newValue }), []);

  const onRowEdit = useCallback(
    async (editedCell: Cell<TBaseTableFeatures, TRowType>, editedValue: unknown) => {
      try {
        await onRowEditProp?.(editedCell, editedValue);
      } finally {
        setDraft((current) => (current?.value === editedValue ? null : current));
      }
    },
    [onRowEditProp],
  );

  const onBlur = useCallback(() => {
    if (draft === null) return;
    if (draft.value !== initialValue) {
      void onRowEdit(cell, draft.value);
    } else {
      setDraft(null);
    }
  }, [draft, initialValue, onRowEdit, cell]);

  const readOnly = cell.row.original.deletedAt != null;

  if (!isCellEditable(cell)) {
    void log(LoggerLevels.error, LogMessages.cellNotEditable(cell.column.id));
    return <>{flexRender(cell.column.columnDef.cell, cell.getContext())}</>;
  }

  switch (cell.column.columnDef.meta?.dataType) {
    case CellDataType.String:
      return (
        <Input
          ref={ref as React.Ref<HTMLInputElement>}
          testId="editable-cell-input"
          value={(value as string | null) !== null ? (value as string) : ""}
          onChange={(e) => {
            setValue(e.target.value);
            onRowChange?.(cell, e.target.value);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            goToNextFocusableElement(ref, e);
          }}
          readOnly={readOnly}
        />
      );
    case CellDataType.Number:
      return (
        <NumberInput
          ref={ref as React.Ref<HTMLInputElement>}
          testId="editable-cell-input"
          value={(value as number | null) !== null ? String(value) : ""}
          onValueChange={(newValue) => {
            const nextValue = newValue !== null ? Number(newValue) : null;
            setValue(nextValue);
            onRowChange?.(cell, nextValue);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            goToNextFocusableElement(ref, e);
          }}
          readOnly={readOnly}
          className="w-full"
          min={cell.column.columnDef.meta.min}
        />
      );
    case CellDataType.Price:
      return (
        <PriceInput
          ref={ref as React.Ref<HTMLInputElement>}
          testId="editable-cell-input"
          value={value === null ? null : (value as string)}
          onValueChange={(newValue) => {
            setValue(newValue);
            onRowChange?.(cell, newValue);
          }}
          min={cell.column.columnDef.meta.min}
          onBlur={onBlur}
          onKeyDown={(e) => {
            goToNextFocusableElement(ref, e);
          }}
          readOnly={readOnly}
        />
      );
    case CellDataType.Decimal:
      return (
        <NumberInput
          ref={ref as React.Ref<HTMLInputElement>}
          testId="editable-cell-input"
          value={value === null ? null : (value as string)}
          onValueChange={(newValue) => {
            setValue(newValue);
            onRowChange?.(cell, newValue);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            goToNextFocusableElement(ref, e);
          }}
          readOnly={readOnly}
          className="w-full"
          decimalScale={2}
          min={cell.column.columnDef.meta.min}
        />
      );
    case CellDataType.Boolean:
      return (
        <Checkbox
          ref={ref}
          testId="editable-cell-input"
          checked={value as boolean}
          onCheckedChange={(val) => {
            setValue(val);
            void onRowEdit(cell, val);
          }}
          readOnly={readOnly}
          onKeyDown={(e) => goToNextFocusableElement(ref, e)}
        />
      );
    case CellDataType.Date:
      return (
        <DateInput
          ref={ref as React.Ref<HTMLButtonElement>}
          testId="editable-cell-input"
          date={(value as string | null) !== null ? new Date(value as string) : null}
          onValueChange={(val) => {
            setValue(val);
            void onRowEdit(cell, val);
          }}
          disabled={readOnly}
          className="w-fit"
        />
      );
    case CellDataType.Picker:
    case CellDataType.Combobox: {
      const renderEditableCell = cell.column.columnDef.meta.renderEditableCell;
      if (!renderEditableCell) {
        void log(LoggerLevels.error, LogMessages.cellRenderEditableCellMissing(cell.column.id));
        return <>{flexRender(cell.column.columnDef.cell, cell.getContext())}</>;
      }
      // Called as a function rather than rendered as a component: column definitions are rebuilt whenever their
      // memo deps change, and a new component identity would remount the inputs and discard what the user typed
      return <>{renderEditableCell({ cell, onRowEdit, onRowChange, value, setValue, onBlur })}</>;
    }
    case CellDataType.Enum: {
      // TODO editable enums
      if (!cell.column.columnDef.meta.enumName) {
        void log(LoggerLevels.error, LogMessages.cellEnumNameMissing(cell.column.id));
        return <>{flexRender(cell.column.columnDef.cell, cell.getContext())}</>;
      }
      const { enumName } = cell.column.columnDef.meta;
      return <p>Values: {getTranslatedEnumValues(enumName).join(", ")}</p>;
    }
  }
}
