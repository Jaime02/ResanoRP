import React, { useMemo } from "react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface CellVerticalListProps {
  children: React.ReactNode;
  className?: string;
}

export default function CellVerticalList({ children, className }: CellVerticalListProps) {
  const childrenArray = useMemo(() => React.Children.toArray(children), [children]);
  if (childrenArray.length === 0) {
    return null;
  }
  if (childrenArray.length === 1) {
    return <>{children}</>;
  }
  return (
    <div className={cn("flex w-fit max-w-full flex-col gap-1 overflow-x-auto", className)}>
      {childrenArray.map((child, index) => (
        <React.Fragment key={index}>
          {child}
          {index < childrenArray.length - 1 && <Separator orientation="horizontal" />}
        </React.Fragment>
      ))}
    </div>
  );
}
