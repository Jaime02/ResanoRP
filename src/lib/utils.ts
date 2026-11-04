import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      size: ["size-icon", "size-sm-icon"],
      w: ["w-base-input", "w-base-number-input"],
    },
  },
});

export function cn(...inputs: Array<ClassValue>) {
  return customTwMerge(clsx(inputs));
}

export function objectToFormData(obj: Record<string, any>): FormData {
  const formData = new FormData();
  Object.entries(obj).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    formData.append(key, value instanceof Date ? value.toISOString() : value);
  });
  return formData;
}

export function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

// Names are typed without accents, so "laton" finds "LATÓN"
export function includesIgnoringAccents(text: string | null, search: string): boolean {
  return text !== null && removeAccents(text).toLowerCase().includes(removeAccents(search).toLowerCase());
}

// Electric can't push unaccent down to Postgres, so any letter that may carry an accent matches any character and
// includesIgnoringAccents narrows the loaded rows down
// ponytail: a search made only of those letters loads almost every row, an unaccented generated column if that hurts
export function getAccentInsensitiveLikePattern(search: string): string {
  return `%${removeAccents(search).replace(/[aeiounc]/gi, "_")}%`;
}
