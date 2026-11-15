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

// One popup at a time, so the tooltip never competes with the dialog for its focus, keys or clicks
enum PartSetView {
  Closed,
  Tooltip,
  // After the dialog the pointer is usually away from the tooltip, so only an explicit dismissal closes it
  PinnedTooltip,
  Blueprints,
}

interface TooltipPartSetProps {
  partId: number;
  componentsCount: number;
}

export default function TooltipPartSet({ partId, componentsCount }: TooltipPartSetProps) {
  const [view, setView] = useState(PartSetView.Closed);
  // Kept after closing, so the dialog still shows its blueprints during the closing animation
  const [blueprintsComponent, setBlueprintsComponent] = useState<TPartFormPartComponent | null>(null);

  if (componentsCount === 0) {
    return null;
  }

  return (
    <>
      <Popover
        open={view === PartSetView.Tooltip || view === PartSetView.PinnedTooltip}
        onOpenChange={(open) => {
          // Already closed for the dialog, the tooltip still reports the end of its hover
          if (view === PartSetView.Blueprints) return;
          setView(open ? PartSetView.Tooltip : PartSetView.Closed);
        }}
      >
        <InfoPopoverTrigger
          data-testid="tooltip-part-set"
          aria-label={PART_SET_LABEL}
          Icon={LayersIcon}
          openOnHover={view !== PartSetView.PinnedTooltip}
        />
        <PopoverContent>
          <span className="font-bold">{PART_SET_LABEL}</span>
          <PartComponentTree
            partId={partId}
            onOpenBlueprints={(component) => {
              setBlueprintsComponent(component);
              setView(PartSetView.Blueprints);
            }}
          />
        </PopoverContent>
      </Popover>
      {/* Outside the popover, which unmounts its tree when it closes */}
      <DialogBlueprintViewer
        testId="dialog-part-set-blueprints"
        title={`${BLUEPRINTS_OF_PART_TITLE} "${blueprintsComponent?.part.description}"`}
        blueprints={blueprintsComponent?.blueprints}
        open={view === PartSetView.Blueprints}
        onOpenChange={(open) => setView(open ? PartSetView.Blueprints : PartSetView.PinnedTooltip)}
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
              <span className="font-medium whitespace-nowrap">{component.quantity} x </span>
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
