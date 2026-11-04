import { createFormHookContexts, type AppFieldExtendedReactFormApi } from "@tanstack/react-form";
import { createContext, use } from "react";
import type z from "zod";

import type { fieldComponents, formComponents } from "@/form/component-map";
import type { FormMode } from "@/types";

/*
 * The form contexts live in this leaf module on purpose.
 *
 * `createFormHookContexts()` and `createContext()` mint brand new context objects every time the
 * module that calls them is evaluated. `@/form` imports every field component and each field
 * component imports the contexts back, so `@/form` sits inside an import cycle: a Vite HMR update
 * can re-execute it under a fresh `?t=` url while parts of the live tree still reference the
 * previous copy. When that happened the provider published on one context while consumers read from
 * another, so `useFormContext` threw "must be used within a BaseForm component" on every render and
 * the router catch boundary retried forever.
 *
 * This module imports nothing that imports it back (`@/form/component-map` is type-only, `@/types`
 * has no runtime imports), so it is only ever evaluated once per session and every copy of `@/form`
 * shares the same context objects.
 */
const { fieldContext, formContext, useFieldContext } = createFormHookContexts();

export { fieldContext, formContext, useFieldContext };

export type TAppForm = AppFieldExtendedReactFormApi<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  typeof fieldComponents,
  typeof formComponents
>;

export interface BaseFormContextProps {
  form: TAppForm;
  formMode: FormMode;
  isLoading: boolean;
  validationSchema?: z.ZodTypeAny;
}

export const BaseFormContext = createContext<BaseFormContextProps | undefined>(undefined);

export function useFormContext() {
  const baseContext = use(BaseFormContext);

  if (!baseContext) {
    throw new Error("useFormContext must be used within a FormContextProvider component");
  }

  return baseContext;
}
