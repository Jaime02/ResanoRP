import type { AnyFormApi } from "@tanstack/react-form";
import { useEffect } from "react";
import type z from "zod";

// The change validators only run on a change, and a new schema runs nothing either. Running them at once disables the
// submit button of an invalid form, and every change recomputes them for all the fields, where errors of the onMount
// validators would stay on the fields that are never changed by hand. A passive effect, because the form takes its new
// validators in a layout effect of the component that creates it, which runs after the layout effects of its children
export default function useValidateForm(form: AnyFormApi, validationSchema: z.ZodTypeAny | undefined) {
  useEffect(() => {
    void form.validate("change");
  }, [form, validationSchema]);
}
