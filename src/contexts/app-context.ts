import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import type { Transaction } from "@tanstack/react-db";
import { createContext, use } from "react";

import type { TElectricCollection } from "@/collections/base";
import type { TToast, ToastFunction } from "@/components/ui/toast";
import { AppContextStorage, UserMode } from "@/contexts/app-context-storage";
import type { BaseMachine } from "@/types/machine";

export { AppContextStorage, UserMode };
export type { TElectricCollection };

export type TBaseMutationResult<TItem = Record<string, unknown> | undefined> = TItem extends undefined
  ? { txid: number; item?: TItem }
  : { txid: number; item: TItem };

export interface ShowToastOnTRPCMutationProps<TMutation extends TBaseMutationResult> {
  // A mutation that writes nothing to the database, like printing a tag, resolves to undefined
  mutation: Promise<TMutation | void>;
  onSuccess?: ToastManagerAddOptions<TToast>;
  /**
   * Collections whose txId is awaited before the success toast. Awaiting a collection the mutation did not actually
   * write to always times out, so pass a function when only the mutation result can tell which tables were written.
   */
  collection?:
    | TElectricCollection
    | Array<TElectricCollection>
    | ((result: TMutation) => TElectricCollection | Array<TElectricCollection>);
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
