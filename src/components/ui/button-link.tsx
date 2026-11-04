import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ButtonLinkProps extends LinkProps, Pick<ButtonProps, "onClick"> {
  testId?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  buttonClassName?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  showExternalLinkIcon?: boolean;
}

export default function ButtonLink({
  testId,
  disabled = false,
  children,
  className,
  buttonClassName,
  variant = "secondary",
  size,
  showExternalLinkIcon,
  onClick,
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} disabled={disabled} tabIndex={-1} className={cn("w-fit min-w-0", className)}>
      <Button
        testId={testId}
        disabled={disabled}
        className={cn("max-w-full min-w-0", buttonClassName)}
        variant={variant}
        size={size}
        onClick={onClick}
      >
        {typeof children === "string" || typeof children === "number" ? (
          <span className="truncate">{children}</span>
        ) : (
          children
        )}
        {showExternalLinkIcon !== false && props.to !== "." && <ExternalLinkIcon />}
      </Button>
    </Link>
  );
}
