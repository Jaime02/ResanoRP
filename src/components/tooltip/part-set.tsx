import type { PopoverRootChangeEventReason } from "@base-ui/react/popover";
import { FileIcon, LayersIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import DialogBlueprintViewer from "@/components/dialog/blueprint-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ButtonLink from "@/components/ui/button-link";
import { InfoPopoverTrigger } from "@/components/ui/info-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { BLUEPRINTS_OF_PART_TITLE, BLUEPRINTS_TITLE } from "@/messages/blueprint";
import { STATUS_DELETED_LABEL } from "@/messages/common";
import { PART_SET_LABEL } from "@/messages/part";
import type { TPartFormPartComponent } from "@/queries/part";
import { useQueryPartComponents } from "@/queries/part-component";

// After a blueprint dialog the pointer is usually away from the tooltip, which only an explicit dismissal should close
const PINNED_CLOSE_REASONS: Array<PopoverRootChangeEventReason> = ["outside-press", "escape-key", "trigger-press"];

interface TooltipPartSetProps {
  partId: number;
  componentsCount: number;
}

export default function TooltipPartSet({ partId, componentsCount }: TooltipPartSetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isBlueprintsOpen, setIsBlueprintsOpen] = useState(false);
  // Kept after closing, so the dialog still shows its blueprints during the closing animation
  const [blueprintsComponent, setBlueprintsComponent] = useState<TPartFormPartComponent | null>(null);

  if (componentsCount === 0) {
    return null;
  }

  return (
    <>
      <Popover
        open={isOpen}
        onOpenChange={(open, { reason }) => {
          if (open) {
            setIsOpen(true);
            return;
          }
          // Interacting with the blueprint dialog counts as leaving the tooltip
          if (isBlueprintsOpen || (isPinned && !PINNED_CLOSE_REASONS.includes(reason))) return;
          setIsOpen(false);
          setIsPinned(false);
        }}
      >
        <InfoPopoverTrigger data-testid="tooltip-part-set" aria-label={PART_SET_LABEL} Icon={LayersIcon} />
        <PopoverContent>
          <span className="font-bold">{PART_SET_LABEL}</span>
          <PartComponentTree
            partId={partId}
            onOpenBlueprints={(component) => {
              setIsPinned(true);
              setBlueprintsComponent(component);
              setIsBlueprintsOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>
      {/* Outside the popover, which unmounts its tree when it closes */}
      <DialogBlueprintViewer
        testId="dialog-part-set-blueprints"
        title={`${BLUEPRINTS_OF_PART_TITLE} "${blueprintsComponent?.part.description}"`}
        blueprints={blueprintsComponent?.blueprints}
        open={isBlueprintsOpen}
        onOpenChange={setIsBlueprintsOpen}
      />
    </>
  );
}

// Each level queries its own components, recursion ends because the server rejects cycles
function PartComponentTree({
  partId,
  onOpenBlueprints,
}: {
  partId: number;
  onOpenBlueprints: (component: TPartFormPartComponent) => void;
}) {
  const { data: components } = useQueryPartComponents(partId);

  if (components.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2 [li>&]:mt-2 [li>&]:ps-6" data-testid="part-set-tree">
      {components.map((component) => (
        <li key={component.componentPartId} data-testid="part-set-node">
          <div className="flex flex-row items-center gap-2" data-testid="part-set-node-row">
            <span className="flex flex-row items-center gap-2" data-testid="part-set-node-label">
              <span className="font-medium whitespace-nowrap">{component.quantity} ×</span>
              <ButtonLink testId="button-link-part-set-node" to="/part/$id" params={{ id: component.componentPartId }}>
                {component.part.description}
              </ButtonLink>
            </span>
            <Button
              testId="button-part-set-node-blueprints"
              variant="secondary"
              size="icon"
              aria-label={BLUEPRINTS_TITLE}
              disabled={component.blueprints.length === 0}
              onClick={() => onOpenBlueprints(component)}
            >
              <FileIcon />
            </Button>
            {component.part.deletedAt !== null && (
              <Badge variant="destructive" testId="badge-part-set-node-deleted">
                <TriangleAlertIcon className="size-icon" />
                {STATUS_DELETED_LABEL}
              </Badge>
            )}
          </div>
          <PartComponentTree partId={component.componentPartId} onOpenBlueprints={onOpenBlueprints} />
        </li>
      ))}
    </ul>
  );
}
