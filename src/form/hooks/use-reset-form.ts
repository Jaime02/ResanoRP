import type { AnyFormApi } from "@tanstack/react-form";
import { deepEqual } from "fast-equals";
import { useLayoutEffect, useRef } from "react";

// Compared by value, live query rows are new objects whenever any of their related rows sync
export default function useResetForm(form: AnyFormApi, ...resetKeys: Array<unknown>) {
  const lastResetKeys = useRef<Array<unknown> | null>(null);

  // Before paint, a passive effect lands after the user may have already typed into the newly shown values and wipes it
  useLayoutEffect(() => {
    if (lastResetKeys.current !== null && deepEqual(lastResetKeys.current, resetKeys)) return;
    lastResetKeys.current = resetKeys;
    form.reset();
  });
}
