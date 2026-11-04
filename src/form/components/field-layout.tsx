import { TriangleAlertIcon } from "lucide-react";

import FieldLabel from "@/form/components/field-label";
import FieldLayoutContainer from "@/form/components/field-layout-container";
import { useFieldContext } from "@/form/context";

export interface FieldLayoutProps {
  label?: React.ReactNode;
  labelPosition?: "start" | "end";
  tooltipContent?: React.ReactNode;
  labelFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function FieldLayout({
  label,
  labelPosition = "start",
  tooltipContent,
  labelFor,
  required = false,
  className,
  children,
}: FieldLayoutProps) {
  const field = useFieldContext();

  const labelElement = label !== undefined && label !== null && (
    <FieldLabel tooltipContent={tooltipContent} labelFor={labelFor} required={required}>
      {label}
    </FieldLabel>
  );

  return (
    <FieldLayoutContainer className={className}>
      {labelPosition === "start" && labelElement}
      {children}
      {labelPosition === "end" && labelElement}
      {typeof field.state.meta.errors.at(0)?.message === "string" && (
        <span className="mt-1 flex flex-row gap-1 font-bold text-red-500">
          <TriangleAlertIcon />
          {field.state.meta.errors.at(0).message}
        </span>
      )}
    </FieldLayoutContainer>
  );
}
