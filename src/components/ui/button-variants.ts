import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  cn(
    "inline-flex items-center gap-2 rounded-md border-border font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:bg-black data-[clickable=true]:cursor-pointer",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "px-3 py-2",
        icon: "size-icon shrink-0 justify-center",
        unstyled: "",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground data-[clickable=true]:shadow-md data-[clickable=true]:hover:bg-primary/80",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 data-[clickable=true]:shadow-md data-[clickable=true]:hover:bg-destructive/80 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        ghost:
          "data-[clickable=true]:hover:bg-accent data-[clickable=true]:hover:text-accent-foreground dark:data-[clickable=true]:hover:bg-accent/50",
        outline:
          "border bg-background data-[clickable=true]:shadow-md data-[clickable=true]:hover:bg-accent data-[clickable=true]:hover:text-accent-foreground dark:bg-border/30 dark:data-[clickable=true]:hover:bg-border/50",
        secondary:
          "bg-secondary text-secondary-foreground data-[clickable=true]:shadow-md data-[clickable=true]:hover:bg-secondary/80",
        success: "bg-success text-white data-[clickable=true]:shadow-md data-[clickable=true]:hover:bg-success/85",
        unstyled: "",
      },
    },
  },
);
