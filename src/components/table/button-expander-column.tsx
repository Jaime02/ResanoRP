import { ChevronRightIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ButtonExpanderColumn({
  isExpanded = false,
  ...props
}: ComponentProps<typeof Button> & { isExpanded?: boolean }) {
  return (
    <Button testId="button-expander" size="icon" variant="secondary" className="" {...props}>
      <ChevronRightIcon className={cn("transition-transform", isExpanded ? "rotate-90" : "rotate-0")} />
    </Button>
  );
}
