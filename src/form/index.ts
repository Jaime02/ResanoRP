import { createFormHook } from "@tanstack/react-form";

import { fieldComponents, formComponents } from "@/form/component-map";
import { fieldContext, formContext } from "@/form/context";

export type { BaseFormContextProps, TAppForm } from "@/form/context";
export { useFieldContext, useFormContext } from "@/form/context";
export type { FormContextProps } from "@/form/components/form-context-provider";
export { FormContextProvider } from "@/form/components/form-context-provider";

export const { useAppForm, withForm } = createFormHook({
  fieldComponents,
  fieldContext,
  formComponents,
  formContext,
});
