import { Toast } from "@base-ui/react/toast";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLOSE_LABEL } from "@/messages/common";
import type { ToastType } from "@/types";

export interface TToast {
  id: string;
  type: ToastType;
  title: React.ReactNode;
  description?: React.ReactNode;
}

export type ToastFunction = (options: ToastManagerAddOptions<TToast>) => void;

export function ToastList() {
  const toastManager = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport
        data-testid="toast-viewport"
        className="fixed top-2 right-0 bottom-auto left-0 z-10 mx-auto flex w-full"
      >
        {toastManager.toasts.map((toast: Toast.Root.ToastObject<TToast>) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            data-testid="toast-root"
            data-type={toast.data?.type}
            swipeDirection={["up", "right", "left", "down"]}
            className={cn(
              "transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))]",
              "[--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s] after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-ending-style:opacity-0 data-expanded:h-(--toast-height) data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:transform-[translateY(-150%)] data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(-150%)]",
              "absolute top-0 right-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto h-[--height] w-fit min-w-75 origin-top rounded-lg bg-clip-padding p-4 shadow-lg select-none [--gap:0.75rem]",
              "data-[type=error]:bg-red-600 data-[type=info]:bg-primary data-[type=success]:bg-dark-green",
            )}
          >
            <Toast.Content className="flex flex-col gap-3 overflow-hidden text-white transition-opacity duration-250 data-behind:pointer-events-none data-behind:opacity-0 data-expanded:pointer-events-auto data-expanded:opacity-100">
              <div className="flex items-center gap-2">
                <Toast.Title className="grow font-bold text-nowrap" />
                <Toast.Close
                  render={(props) => (
                    <Button
                      data-testid="button-close"
                      size="icon"
                      aria-label={CLOSE_LABEL}
                      variant="outline"
                      {...props}
                    >
                      <XIcon className="text-black" />
                    </Button>
                  )}
                />
              </div>
              <Toast.Description className="max-w-150 wrap-break-word whitespace-pre-line" />
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
