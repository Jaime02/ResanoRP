import { useSelector } from "@tanstack/react-store";

import { useAppContext } from "@/contexts/app-context";
import { useAppForm } from "@/form";
import useResetForm from "@/form/hooks/use-reset-form";
import { USER_CREATED_MESSAGE, USER_EDITED_MESSAGE } from "@/messages/backoffice";
import { useQueryUserById } from "@/queries/user";
import { createUserSchema, updateUserSchema } from "@/schemas/user";
import type { TCreateUser, TUpdateUser } from "@/schemas/user";
import trpc from "@/trpc/trpc-client";
import { FormMode } from "@/types";

interface UseUserFormProps {
  formMode?: FormMode;
  editUserId?: number;
  onSubmit?: () => Promise<void>;
}

export default function useUserForm({ formMode, editUserId, onSubmit }: UseUserFormProps) {
  const { showToastOnTRPCMutation } = useAppContext();

  const { data: user, isLoading: isLoadingUser, isLoadingError, isCrashed } = useQueryUserById(editUserId);

  const validationSchema = formMode === FormMode.Create ? createUserSchema : updateUserSchema;

  const defaultValues = {
    ...(formMode !== FormMode.Create ? { id: user?.id } : {}),
    ip: formMode === FormMode.Create ? null : user?.ip,
    name: formMode === FormMode.Create ? null : user?.name,
  };

  const form = useAppForm({
    formId: "user",
    defaultValues,
    onSubmit: async ({ value: userFormData }) => {
      if (formMode !== FormMode.Create && formMode !== FormMode.Update) return;
      const mutation =
        formMode === FormMode.Create
          ? trpc.user.create.mutate(userFormData as TCreateUser)
          : trpc.user.update.mutate(userFormData as TUpdateUser);
      await showToastOnTRPCMutation({
        mutation,
        onSuccess: { title: formMode === FormMode.Create ? USER_CREATED_MESSAGE : USER_EDITED_MESSAGE },
        onSubmit,
      });
    },
    validators: {
      onSubmit: validationSchema,
    },
  });

  useResetForm(form, defaultValues, formMode);

  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const isLoading = (formMode !== FormMode.Create && isLoadingUser) || isSubmitting;

  return {
    validationSchema,
    form,
    getUserByIdError: isLoadingError || isCrashed || (editUserId !== undefined && !isLoadingUser && user === undefined),
    isLoading,
  };
}
