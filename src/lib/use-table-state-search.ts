import { useNavigate } from "@tanstack/react-router";
import { deepEqual } from "fast-equals";
import { useCallback, type SetStateAction } from "react";

import type { TTableState } from "@/schemas";

export function useTableStateSearch<TState extends TTableState>(key: string, defaultState?: TState) {
  const navigate = useNavigate();
  return useCallback(
    (updater: SetStateAction<TState | undefined>) => {
      void navigate({
        to: ".",
        search: (prev) => {
          const prevRecord = prev as Record<string, unknown>;
          const nextValue = typeof updater === "function" ? updater(prevRecord[key] as TState | undefined) : updater;
          const rest = Object.fromEntries(Object.entries(prevRecord).filter(([field]) => field !== key));
          if (nextValue == null) return rest;
          const defaultRecord = (defaultState ?? {}) as Record<string, unknown>;
          const diff = Object.fromEntries(
            Object.entries(nextValue).filter(
              ([field, value]) => !deepEqual(value, defaultRecord[field] ?? (Array.isArray(value) ? [] : undefined)),
            ),
          );
          return Object.keys(diff).length === 0 ? rest : { ...rest, [key]: diff };
        },
        replace: true,
      });
    },
    [navigate, key, defaultState],
  );
}
