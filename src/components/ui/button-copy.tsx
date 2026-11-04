import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/app-context";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";

interface ButtonCopyProps extends React.ComponentProps<typeof Button> {
  value?: string;
  html?: string;
  copiedTitle?: string;
}

export default function ButtonCopy({ value, html, copiedTitle, ...props }: ButtonCopyProps) {
  const { toaster } = useAppContext();
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (hasCopied) {
      const timer = setTimeout(() => {
        setHasCopied(false);
      }, 2000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [hasCopied]);

  const handleCopy = useCallback(async () => {
    if (value === undefined) {
      return;
    }
    try {
      await (html === undefined
        ? navigator.clipboard.writeText(value)
        : navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([value], { type: "text/plain" }),
            }),
          ]));
      toaster.info({ timeout: 2000, title: copiedTitle ?? `Copiado "${value}"` });
      setHasCopied(true);
    } catch (err) {
      await clientLog(LoggerLevels.error, "Failed to copy to clipboard", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [copiedTitle, html, toaster, value]);

  return (
    <Button variant={hasCopied ? "success" : "secondary"} size="icon" onClick={async () => handleCopy()} {...props}>
      {hasCopied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

export function ButtonCopyLayout({ children, ...props }: ButtonCopyProps) {
  return (
    <div className="flex flex-row items-center gap-1">
      {props.value !== undefined && <ButtonCopy {...props} />}
      {children}
    </div>
  );
}
