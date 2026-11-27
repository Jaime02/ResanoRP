import { Toast } from "@base-ui/react/toast";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import type { Transaction } from "@tanstack/react-db";
import { rootRouteId, useRouteContext, useRouter } from "@tanstack/react-router";
import { useHydrated } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { awaitSynced } from "@/collections/base";
import { AppContext, AppContextStorage, UserMode } from "@/contexts/app-context";
import type { ShowToastOnTRPCMutationProps, TBaseMutationResult } from "@/contexts/app-context";
import { logoutAdminFn } from "@/lib/admin-session-fns";
import { forgetPowerSyncToken } from "@/lib/powersync";
import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";
import { ERROR_TITLE, UNKNOWN_ERROR_MESSAGE } from "@/messages/common";
import { ADMIN_LOGOUT_FAILED_MESSAGE } from "@/messages/home";
import { useQueryMachineById } from "@/queries/machine";
import type { BaseMachine } from "@/types/machine";
import type { TToast } from "@/types/toast";
import { ToastType } from "@/types/toast";

const DEFAULT_TOAST_TIMEOUT = 5000; // 5 seconds

// The cookie is read again only when the storage notifies a change: something outside the page, like the browser
// clearing it, can change it between the two reads React does in one render, and React reports that as an uncached
// snapshot. Stable references so useSyncExternalStore does not resubscribe on every render.
let storageSnapshot: string | undefined;
let isStorageSnapshotStale = true;
const subscribeToStorage = (callback: () => void) => {
  isStorageSnapshotStale = true;
  return AppContextStorage.subscribe(() => {
    isStorageSnapshotStale = true;
    callback();
  });
};
const getStorageSnapshot = () => {
  if (isStorageSnapshotStale) {
    storageSnapshot = AppContextStorage.readCookie();
    isStorageSnapshotStale = false;
  }
  return storageSnapshot;
};

const toaster = Toast.createToastManager();

// The token of an admin session syncs the audit log, so the next sync request must get one without the session
async function closeAdminSession() {
  await logoutAdminFn();
  forgetPowerSyncToken();
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const activeToasts = useRef(new Set<TToast>());

  // The server renders with the cookie of the request, which the browser then reads from document.cookie
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

  const setSelectedMachine = useCallback(
    (machine: BaseMachine | null) => {
      new AppContextStorage(persistedState.userMode, machine?.id).save();
    },
    [persistedState.userMode],
  );

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

  const isClosingAdminSession = useRef(false);

  // The server only takes the Administrador from its session cookie. Saving the new user mode before the logout
  // answers would let a navigation abort the logout, and the browser would keep the session while it shows another mode.
  // A pick made meanwhile is ignored, as its logout would still carry the session and close it a second time
  const saveClosingAdminSession = useCallback(
    async (storage: AppContextStorage) => {
      if (isClosingAdminSession.current) return;
      isClosingAdminSession.current = true;
      try {
        await closeAdminSession();
      } catch (error) {
        toasterError({ title: ADMIN_LOGOUT_FAILED_MESSAGE });
        void log(LoggerLevels.error, LogMessages.clientError, { error });
        return;
      } finally {
        isClosingAdminSession.current = false;
      }
      storage.save();
    },
    [toasterError],
  );

  const setUserMode = useCallback(
    async (mode: UserMode | null) => {
      const storage = new AppContextStorage(mode ?? undefined, persistedState.userModeMachineId);
      if (mode === UserMode.Admin) {
        storage.save();
        return;
      }
      await saveClosingAdminSession(storage);
    },
    [persistedState.userModeMachineId, saveClosingAdminSession],
  );

  const resetUserState = useCallback(
    async () => saveClosingAdminSession(new AppContextStorage()),
    [saveClosingAdminSession],
  );

  // A deleted Machine can no longer operate, so its session is closed and the user mode has to be picked again
  const isUserModeMachineDeleted = !isLoadingUserModeMachine && userModeMachine?.deletedAt != null;

  useEffect(() => {
    if (isUserModeMachineDeleted) {
      void resetUserState();
    }
  }, [isUserModeMachineDeleted, resetUserState]);

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
