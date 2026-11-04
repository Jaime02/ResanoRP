import type { EditableCellRenderProps } from "@/components/table/editable-cell";
import type { translatedEnums } from "@/lib/translations";
import type { TBaseFilters, TBaseModel, TFilterValue, TPagination, TSort } from "@/schemas";

export enum CellDataType {
  String = "string",
  Number = "number",
  Price = "price",
  Decimal = "decimal",
  Boolean = "boolean",
  Date = "date",
  Combobox = "combobox",
  Picker = "picker",
  Enum = "enum",
}

export enum TableMode {
  Disabled = "disabled",
  ReadOnly = "readonly",
  Editable = "editable",
  Picker = "picker",
  Radio = "radio",
}

export enum FormMode {
  ReadOnly = "readOnly",
  Create = "create",
  Update = "update",
  NotApplicable = "notApplicable",
}

export enum ToastType {
  Success = "success",
  Error = "error",
  Info = "info",
}

export enum TablePartPickerMode {
  PickReferences,
  PickParts,
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TFeatures, TData, TValue> {
    dataType?: CellDataType;
    editable?: boolean | ((row: TData) => boolean);
    min?: number;
    filterFieldName?: string;
    cellClassName?: string;
    renderFilter?: (props: {
      value: number | undefined;
      onChange: (value: number | null) => void;
      getFilterValue: (filterId: string) => TFilterValue | undefined;
      setFilterValues: (filterValues: Record<string, TFilterValue>) => void;
    }) => React.ReactNode;
    renderEditableCell?: (props: EditableCellRenderProps<TData & TBaseModel>) => React.ReactNode;
    enumName?: keyof typeof translatedEnums;
  }
}

export interface TBaseQueryProps<TFilters extends TBaseFilters> {
  filters?: TFilters;
  sorts?: Array<TSort>;
  pagination?: TPagination | null;
}
export const DEFAULT_PAGINATION: TPagination = { pageIndex: 0, pageSize: 10 };

export type TFormFieldLabel<TModel> = Partial<Record<keyof TModel, string>>;

type SerializeDateField<T> = T extends Date ? string : T;
export type SerializeDateFields<T> = {
  [K in keyof T]: SerializeDateField<T[K]>;
};
