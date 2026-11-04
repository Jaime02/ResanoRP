import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";

interface TooltipQualityCheckIssueProps {
  notes: string;
}

export default function TooltipQualityCheckIssue({ notes }: TooltipQualityCheckIssueProps) {
  return (
    <Popover>
      <InfoPopoverTrigger data-testid="tooltip-quality-check-issue" className="text-destructive" />
      <PopoverContent className="max-w-80 whitespace-pre-wrap text-destructive">{notes}</PopoverContent>
    </Popover>
  );
}
