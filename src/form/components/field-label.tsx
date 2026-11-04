import { AsteriskIcon } from "lucide-react";

import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent } from "@/components/ui/popover";

interface FieldLabelProps {
  children: React.ReactNode;
  tooltipContent?: React.ReactNode;
  labelFor?: string;
  required?: boolean;
}

export default function FieldLabel({ children, tooltipContent, labelFor, required = false }: FieldLabelProps) {
  const labelContent = (
    <>
      {children}
      {required && <AsteriskIcon size="18" color="red" />}
    </>
  );

  return (
    <Label htmlFor={labelFor} className="min-h-6 max-w-full">
      {tooltipContent !== undefined ? (
        <Popover>
          <InfoPopoverTrigger>{labelContent}</InfoPopoverTrigger>
          <PopoverContent>{tooltipContent}</PopoverContent>
        </Popover>
      ) : (
        labelContent
      )}
    </Label>
  );
}
