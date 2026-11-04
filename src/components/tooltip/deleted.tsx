import { TriangleAlertIcon } from "lucide-react";

import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";

interface TooltipDeletedProps {
  children: React.ReactNode;
}

export default function TooltipDeleted({ children }: TooltipDeletedProps) {
  return (
    <Popover>
      <InfoPopoverTrigger data-testid="tooltip-deleted" className="text-destructive" Icon={TriangleAlertIcon} />
      <PopoverContent className="flex flex-col items-center gap-2">{children}</PopoverContent>
    </Popover>
  );
}
