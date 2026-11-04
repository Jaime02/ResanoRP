import type { AnyColumn } from "drizzle-orm";

export function isSortableColumn<T extends Record<string, AnyColumn>>(
  columns: T,
  id: string,
): id is Extract<keyof T, string> {
  return Object.hasOwn(columns, id);
}
