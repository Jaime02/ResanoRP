import { cn } from "@/lib/utils";

interface FieldLayoutContainerProps {
  className?: string;
  invalid?: boolean;
  fieldName?: string;
  children: React.ReactNode;
}

export default function FieldLayoutContainer({ className, invalid, fieldName, children }: FieldLayoutContainerProps) {
  return (
    <div
      data-invalid={invalid === true ? true : undefined}
      data-field-name={fieldName}
      className={cn(
        "flex min-w-0 flex-col gap-1",
        "data-invalid:[&_input[data-input-type]]:border-destructive data-invalid:[&_textarea[data-input-type]]:border-destructive",
        "data-invalid:[&_div[data-input-type]>button:first-child]:ring-2 data-invalid:[&_div[data-input-type]>button:first-child]:ring-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}
