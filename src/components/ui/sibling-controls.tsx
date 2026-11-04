import type { LinkProps } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";

import ButtonLink from "@/components/ui/button-link";

interface SiblingControlsProps {
  url: LinkProps["to"];
  currentId: number;
  siblings?: {
    minId: number | null;
    previousId: number | null;
    nextId: number | null;
    maxId: number | null;
  };
  children?: React.ReactNode;
}

export default function SiblingControls({ url, currentId, siblings, children }: SiblingControlsProps) {
  return (
    <div className="flex gap-1">
      <ButtonLink
        testId="button-link-go-to-initial"
        to={url}
        size="icon"
        params={{ id: siblings?.minId ?? undefined }}
        disabled={siblings?.minId == null || siblings.minId === currentId}
      >
        <ChevronsLeftIcon />
      </ButtonLink>
      <ButtonLink
        testId="button-link-go-to-previous"
        to={url}
        size="icon"
        params={{ id: siblings?.previousId ?? undefined }}
        disabled={siblings?.previousId == null || siblings.previousId === currentId}
      >
        <ChevronLeftIcon />
      </ButtonLink>
      {children}
      <ButtonLink
        testId="button-link-go-to-next"
        to={url}
        size="icon"
        params={{ id: siblings?.nextId ?? undefined }}
        disabled={siblings?.nextId == null || siblings.nextId === currentId}
      >
        <ChevronRightIcon />
      </ButtonLink>
      <ButtonLink
        testId="button-link-go-to-last"
        to={url}
        size="icon"
        params={{ id: siblings?.maxId ?? undefined }}
        disabled={siblings?.maxId == null || siblings.maxId === currentId}
      >
        <ChevronsRightIcon />
      </ButtonLink>
    </div>
  );
}
