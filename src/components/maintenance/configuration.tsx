import { useAppContext } from "@/contexts/app-context";
import { FormContextProvider } from "@/form";
import FormConfiguration from "@/form/forms/configuration";
import useConfigurationForm from "@/form/hooks/use-configuration";
import { FormMode } from "@/types";

export default function MaintenanceConfiguration() {
  const { isAdmin } = useAppContext();

  const { form, formMode, validationSchema, isLoading } = useConfigurationForm({
    formMode: isAdmin ? FormMode.Update : FormMode.ReadOnly,
  });

  return (
    <FormContextProvider
      testId="form-configuration"
      form={form}
      formMode={formMode}
      isLoading={isLoading}
      validationSchema={validationSchema}
      className="items-center"
    >
      <FormConfiguration />
    </FormContextProvider>
  );
}
