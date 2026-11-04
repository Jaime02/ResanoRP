import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import * as React from "react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function Tabs({ className, testId, ...props }: React.ComponentProps<typeof BaseTabs.Root> & { testId?: string }) {
  return <BaseTabs.Root data-testid={testId} className={cn("flex max-w-full flex-col gap-2", className)} {...props} />;
}

function TabsList({ className, children, ...props }: React.ComponentProps<typeof BaseTabs.List>) {
  const childrenArray = React.Children.toArray(children);

  return (
    <BaseTabs.List
      className={cn(
        "relative z-0 inline-flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-lg bg-secondary px-1 py-1 text-primary-foreground",
        className,
      )}
      {...props}
    >
      {childrenArray.map((child, index) => (
        <React.Fragment key={index}>
          {child}
          {index < childrenArray.length - 1 && (
            <Separator
              orientation="vertical"
              className="bg-white data-[orientation=vertical]:h-6 data-[orientation=vertical]:self-center"
            />
          )}
        </React.Fragment>
      ))}
      <TabsIndicator renderBeforeHydration />
    </BaseTabs.List>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 rounded-md px-2 font-medium whitespace-nowrap text-white transition-[color,background-color] hover:cursor-pointer focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-active:text-black data-active:shadow-lg hover:data-active:cursor-auto dark:text-muted-foreground dark:data-active:bg-border/30",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn("mx-auto flex flex-col gap-2 outline-none", className)} {...props} />;
}

function TabsIndicator({ className, ...props }: React.ComponentProps<typeof BaseTabs.Indicator>) {
  return (
    <BaseTabs.Indicator
      className={cn(
        "absolute top-0 left-0 z-[-1] h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) translate-y-(--active-tab-top) rounded-md bg-white transition-all duration-200 ease-in-out",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
