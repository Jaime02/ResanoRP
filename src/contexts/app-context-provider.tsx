import { Toast } from "@base-ui/react/toast";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import type { Transaction } from "@tanstack/react-db";
import { rootRouteId, useRouteContext, useRouter } from "@tanstack/react-router";
import { useHydrated } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { awaitSynced } from "@/collections/base";
import type { TToast } from "@/components/ui/toast";
import { AppContext, AppContextStorage, UserMode } from "@/contexts/app-context";
import type { ShowToastOnTRPCMutationProps, TBaseMutationResult } from "@/contexts/app-context";
import { logoutAdminFn } from "@/lib/admin-session-fns";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { ERROR_TITLE, UNKNOWN_ERROR_MESSAGE } from "@/messages/common";
import { useQueryMachineById } from "@/queries/machine";
import { ToastType } from "@/types";
import type { BaseMachine } from "@/types/machine";

const DEFAULT_TOAST_TIMEOUT = 5000; // 5 seconds

// Stable references so useSyncExternalStore does not resubscribe on every render.
const subscribeToStorage = (callback: () => void) => AppContextStorage.subscribe(callback);
const getStorageSnapshot = () => AppContextStorage.readCookie();

const toaster = Toast.createToastManager();

export function AppContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const activeToasts = useRef(new Set<TToast>());

  // Data-only SSR renders this only in the browser, after hydration. The server snapshot, the cookie of the request,
  // only matters if the root route is ever rendered on the server again
  const { userStateCookie } = useRouteContext({ from: rootRouteId });
  const persistedStateCookie = useSyncExternalStore(subscribeToStorage, getStorageSnapshot, () => userStateCookie);
  const persistedState = AppContextStorage.parse(persistedStateCookie);

  const { data: userModeMachine, isLoading: isLoadingUserModeMachine } = useQueryMachineById(
    persistedState.userModeMachineId,
  );

  const isDocumentHydrated = useHydrated();
  useEffect(() => {
    document.body.setAttribute("data-hydrated", "");
  }, []);

  useEffect(() => {
    // Close all existing toasts on route change. A navigation to the current href is not one, and closing
    // on it would drop the toast of a mutation that resolves while such a navigation is in flight.
    const unsubscribe = router.subscribe("onBeforeLoad", ({ hrefChanged }) => {
      if (hrefChanged) {
        activeToasts.current.forEach((toast) => toaster.close(toast.id));
      }
    });
    return () => {
      unsubscribe();
    };
  }, [router]);

  const setUserMode = useCallback(
    (mode: UserMode | null) => {
      new AppContextStorage(mode ?? undefined, persistedState.userModeMachineId).save();
      if (mode !== UserMode.Admin) {
        void logoutAdminFn();
      }
    },
    [persistedState.userModeMachineId],
  );

  const setSelectedMachine = useCallback(
    (machine: BaseMachine | null) => {
      new AppContextStorage(persistedState.userMode, machine?.id).save();
    },
    [persistedState.userMode],
  );

  const resetUserState = useCallback(() => {
    new AppContextStorage().save();
    void logoutAdminFn();
  }, []);

  // A deleted Machine can no longer operate, so its session is closed and the user mode has to be picked again
  const isUserModeMachineDeleted = !isLoadingUserModeMachine && userModeMachine?.deletedAt != null;

  useEffect(() => {
    if (isUserModeMachineDeleted) {
      resetUserState();
    }
  }, [isUserModeMachineDeleted, resetUserState]);

  const addToast = useCallback((type: ToastType, timeout: number, options: ToastManagerAddOptions<TToast>) => {
    for (const activeToast of activeToasts.current) {
      if (
        activeToast.type === type &&
        activeToast.title === options.title &&
        activeToast.description === options.description
      ) {
        toaster.close(activeToast.id);
      }
    }

    const toastObject: TToast = {
      id: "", // Will be set after toaster.add
      type,
      title: options.title,
      description: options.description,
    };

    const toastId = toaster.add({
      data: { type },
      onRemove: () => {
        if (!activeToasts.current.delete(toastObject)) {
          console.warn("Tried to remove a toast that was not in activeToasts");
        }
      },
      timeout,
      ...options,
    });
    toastObject.id = toastId;
    activeToasts.current.add(toastObject);
  }, []);

  // Do not auto-dismiss toasts during tests
  const defaultTimeout = import.meta.env.VITE_ENV_NAME === "test" ? 0 : DEFAULT_TOAST_TIMEOUT;

  const toasterSuccess = useCallback(
    (options: ToastManagerAddOptions<TToast>) => addToast(ToastType.Success, defaultTimeout, options),
    [addToast, defaultTimeout],
  );

  const toasterError = useCallback(
    (options: ToastManagerAddOptions<TToast>) => addToast(ToastType.Error, 0, options),
    [addToast],
  );

  const toasterInfo = useCallback(
    (options: ToastManagerAddOptions<TToast>) => addToast(ToastType.Info, defaultTimeout, options),
    [addToast, defaultTimeout],
  );

  const showToastOnTRPCMutation = useCallback(
    async <TMutation extends TBaseMutationResult>({
      mutation,
      onSuccess,
      onSubmit,
    }: ShowToastOnTRPCMutationProps<TMutation>): Promise<TMutation | null> => {
      try {
        const mutationResult = await mutation;
        if (mutationResult !== undefined) {
          await awaitSynced();
        }
        await onSubmit?.(mutationResult?.item);
        if (onSuccess) {
          toasterSuccess(onSuccess);
        }
        return mutationResult ?? null;
      } catch (error) {
        let errorMessage = UNKNOWN_ERROR_MESSAGE;
        if (error instanceof TRPCClientError) {
          errorMessage = error.data?.zodError ?? error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        toasterError({ title: ERROR_TITLE, description: errorMessage });
        void log(LoggerLevels.error, LogMessages.clientError, { error });
        return null;
      }
    },
    [toasterSuccess, toasterError],
  );

  const showToastOnTransaction = useCallback(
    async ({
      transaction,
      onSuccess,
    }: {
      transaction: () => Transaction;
      onSuccess?: ToastManagerAddOptions<TToast>;
    }) => {
      try {
        await transaction().when("settled");
      } catch (error) {
        const message = error instanceof Error ? error.message : undefined;
        void log(LoggerLevels.error, LogMessages.clientError, { error });
        toasterError({ title: ERROR_TITLE, description: message });
        return;
      }
      if (onSuccess) {
        toasterSuccess(onSuccess);
      }
    },
    [toasterSuccess, toasterError],
  );

  return (
    <AppContext
      value={{
        isDocumentHydrated,
        resetUserState,
        setUserMode,
        setUserModeMachine: setSelectedMachine,
        toaster: { error: toasterError, info: toasterInfo, success: toasterSuccess },
        userMode: persistedState.userMode,
        isAdmin: persistedState.userMode === UserMode.Admin,
        userModeMachine,
        isLoadingUserModeMachine,
        showToastOnTRPCMutation,
        showToastOnTransaction,
      }}
    >
      <Toast.Provider toastManager={toaster}>{children}</Toast.Provider>
    </AppContext>
  );
}
