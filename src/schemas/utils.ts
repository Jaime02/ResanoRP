import { z } from "zod";

import { formatAppDate } from "@/lib/dates";
import type { TFilterValue } from "@/schemas";

type TZodErrorTree = {
  errors: Array<string>;
  properties?: Record<string, TZodErrorTree | undefined>;
  items?: Array<TZodErrorTree | undefined>;
};

function formatZodErrorTree(tree: TZodErrorTree, path: Array<PropertyKey>): Array<string> {
  const dotPath = z.core.toDotPath(path);
  const lines = tree.errors.flatMap((message) =>
    dotPath === "" ? [`✖ ${message}`] : [`✖ ${message}`, `  → en ${dotPath}`],
  );

  for (const [key, subTree] of Object.entries(tree.properties ?? {})) {
    if (subTree) {
      lines.push(...formatZodErrorTree(subTree, [...path, key]));
    }
  }
  (tree.items ?? []).forEach((subTree, index) => {
    if (subTree) {
      lines.push(...formatZodErrorTree(subTree, [...path, index]));
    }
  });

  return lines;
}

// z.prettifyError keeps only the top-level issue of a union failure, which is a pathless
// "Entrada inválida"; z.treeifyError is the one that merges in the issues of every union option.
export function formatZodError(error: z.core.$ZodError): string {
  return formatZodErrorTree(z.treeifyError(error), []).join("\n");
}

export function sanitizePath(path: string): string | null {
  // Remove invalid characters and trim spaces and dots at the end
  let sanitized = path.replace(/[<>:"/\\|?*]+/g, "").replace(/[ .]+$/, "");

  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sanitized)) {
    return null;
  }

  sanitized = sanitized.slice(0, 255);

  if (sanitized.trim().length === 0) {
    return null;
  }
  return sanitized;
}

export function dateToFileName(date: Date): string {
  return formatAppDate(date, "dd_MM_yyyy__HH_mm_ss");
}

type TFilterEntry = {
  id: string;
  value: TFilterValue;
};

export function getFilterValue<TFilters extends ReadonlyArray<TFilterEntry>, TKey extends TFilters[number]["id"]>(
  filters: TFilters | undefined,
  key: TKey,
): Extract<TFilters[number], { id: TKey }>["value"] | undefined {
  return filters?.find((filter) => filter.id === key)?.value;
}

export function replaceFilters(
  filters: ReadonlyArray<TFilterEntry> | undefined,
  filterValues: Record<string, TFilterValue | undefined>,
): Array<TFilterEntry> {
  return [
    ...(filters ?? []).filter((filter) => !(filter.id in filterValues)),
    ...Object.entries(filterValues)
      .filter((entry): entry is [string, TFilterValue] => entry[1] != null && entry[1] !== "")
      .map(([id, value]) => ({ id, value })),
  ];
}
