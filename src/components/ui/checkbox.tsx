import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckIcon, XIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

interface CheckboxProps extends React.ComponentProps<typeof BaseCheckbox.Root> {
  testId?: string;
  showUncheckedIcon?: boolean;
}

function Checkbox({ testId, className, readOnly, showUncheckedIcon, ...props }: CheckboxProps) {
  const isReadOnly = readOnly === true;
  const showsXWhenUnchecked = isReadOnly || showUncheckedIcon === true;
  return (
    <BaseCheckbox.Root
      data-testid={testId}
      readOnly={readOnly}
      className={cn(
        "flex size-icon-sm items-center justify-center rounded-sm",
        showsXWhenUnchecked
          ? cn(
              "border border-black text-black data-checked:bg-green-200 data-unchecked:bg-red-200",
              !isReadOnly && "cursor-pointer hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/70",
            )
          : "not-data-disabled:cursor-pointer not-data-disabled:hover:opacity-80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 data-checked:bg-primary data-indeterminate:bg-primary data-unchecked:border data-unchecked:not-data-disabled:border-primary data-unchecked:not-data-disabled:hover:bg-accent data-unchecked:data-disabled:border-gray-300",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        keepMounted={showsXWhenUnchecked}
        className={cn("flex", showsXWhenUnchecked ? "text-black" : "bg-primary text-white data-unchecked:hidden")}
      >
        {(showsXWhenUnchecked && props.checked !== true) || props.indeterminate === true ? (
          <XIcon className="size-5" />
        ) : (
          <CheckIcon className="size-5" />
        )}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

export { Checkbox };
