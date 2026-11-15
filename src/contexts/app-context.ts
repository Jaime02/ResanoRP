import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import type { Transaction } from "@tanstack/react-db";
import { createContext, use } from "react";

import type { TToast, ToastFunction } from "@/components/ui/toast";
import { AppContextStorage, UserMode } from "@/contexts/app-context-storage";
import type { BaseMachine } from "@/types/machine";

export { AppContextStorage, UserMode };

// The index signature lets results without an item, like { fileName }, match the optional item
export type TBaseMutationResult<TItem = Record<string, unknown> | undefined> = TItem extends undefined
  ? { item?: TItem; [key: string]: unknown }
  : { item: TItem };

export interface ShowToastOnTRPCMutationProps<TMutation extends TBaseMutationResult> {
  // A mutation that writes nothing to the database, like printing a tag, resolves to undefined
  mutation: Promise<TMutation | void>;
  onSuccess?: ToastManagerAddOptions<TToast>;
  onSubmit?: (item: TMutation["item"]) => Promise<void>;
}

interface AppContextType {
  isDocumentHydrated: boolean;
  userMode?: UserMode;
  isAdmin: boolean;
  setUserMode: (mode: UserMode | null) => void;
  toaster: {
    success: ToastFunction;
    error: ToastFunction;
    info: ToastFunction;
  };
  userModeMachine?: BaseMachine;
  isLoadingUserModeMachine: boolean;
  setUserModeMachine: (machine: BaseMachine | null) => void;
  resetUserState: () => void;
  showToastOnTRPCMutation: <TMutation extends TBaseMutationResult>(
    props: ShowToastOnTRPCMutationProps<TMutation>,
  ) => Promise<TMutation | null>;
  showToastOnTransaction: ({
    transaction,
    onSuccess,
  }: {
    transaction: () => Transaction;
    onSuccess?: ToastManagerAddOptions<TToast>;
  }) => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const context = use(AppContext);
  if (!context) {
    throw new Error("AppContext must be used within an AppContextProvider");
  }
  return context;
}
