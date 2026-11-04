import { TriangleAlertIcon } from "lucide-react";

import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { formatInactiveMaterialMessage } from "@/lib/formatters";

interface TooltipInactiveMaterialProps {
  material: Parameters<typeof formatInactiveMaterialMessage>[0];
  children: React.ReactNode;
}

export default function TooltipInactiveMaterial({ material, children }: TooltipInactiveMaterialProps) {
  const inactiveMaterialMessage = formatInactiveMaterialMessage(material);

  if (inactiveMaterialMessage === null) {
    return <>{children}</>;
  }

  return (
    <Popover>
      <InfoPopoverTrigger data-testid="tooltip-inactive-material" className="text-amber-600" Icon={TriangleAlertIcon}>
        {children}
      </InfoPopoverTrigger>
      <PopoverContent>{inactiveMaterialMessage}</PopoverContent>
    </Popover>
  );
}
