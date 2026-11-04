import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CLOSE_LABEL } from "@/messages/common";

function Dialog({ ...props }: React.ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof BaseDialog.Trigger> & React.ComponentProps<typeof Button>) {
  return <BaseDialog.Trigger render={(_props) => <Button {..._props} />} {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof BaseDialog.Portal>) {
  return <BaseDialog.Portal {...props} />;
}

function DialogBackdrop({ className, ...props }: React.ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        "fixed inset-0 bg-black/50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      forceRender
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  isLoading = false,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup> & { isLoading?: boolean }) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <BaseDialog.Popup
        className={cn(
          "fixed top-[50%] left-[50%] flex max-h-[98vh] w-max max-w-[98vw] translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg bg-background shadow-dialog transition-all duration-200 outline-none data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0",
          className,
        )}
        {...props}
        render={(popupProps, { open }) => (
          <div {...popupProps} data-loading={isLoading && open}>
            <div className="relative flex max-h-full min-h-0 flex-1 flex-col items-center gap-3 overflow-auto p-4">
              {children}
              {isLoading && open && <LoadingOverlay />}
            </div>
          </div>
        )}
      />
    </DialogPortal>
  );
}

function DialogHeader({ className, closable = true, ...props }: React.ComponentProps<"div"> & { closable?: boolean }) {
  return (
    <>
      <div className={cn("flex w-full items-center justify-between gap-2", className)} {...props}>
        <div className="flex flex-1 flex-col gap-2 text-center text-lg sm:text-left">{props.children}</div>
        {closable && <DialogClose />}
      </div>
      <Separator />
    </>
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <>
      <Separator />
      <div className={cn("flex w-full flex-row flex-wrap justify-end gap-2", className)} {...props} />
    </>
  );
}

function DialogTitle({ ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title render={(_props) => <Header level={2} {..._props} />} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogClose() {
  return (
    <BaseDialog.Close
      render={(_props) => (
        <Button testId="button-close" variant="secondary" size="icon" aria-label={CLOSE_LABEL} {..._props}>
          <XIcon />
        </Button>
      )}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
