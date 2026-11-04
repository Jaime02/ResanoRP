import { cn } from "@/lib/utils";

interface FieldLayoutContainerProps {
  className?: string;
  children: React.ReactNode;
}

export default function FieldLayoutContainer({ className, children }: FieldLayoutContainerProps) {
  return <div className={cn("flex min-w-0 flex-col gap-1", className)}>{children}</div>;
}
