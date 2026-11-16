export enum ToastType {
  Success = "success",
  Error = "error",
  Info = "info",
}

export interface TToast<TContent = React.ReactNode> {
  id: string;
  type: ToastType;
  title: TContent;
  description?: TContent;
}
