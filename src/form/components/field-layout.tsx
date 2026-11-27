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
  hideError?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function FieldLayout({
  label,
  labelPosition = "start",
  tooltipContent,
  labelFor,
  required = false,
  hideError = false,
  className,
  children,
}: FieldLayoutProps) {
  const field = useFieldContext();

  const labelElement = label !== undefined && label !== null && (
    <FieldLabel tooltipContent={tooltipContent} labelFor={labelFor} required={required}>
      {label}
    </FieldLabel>
  );

  const errorMessage = field.state.meta.errors.at(0)?.message;

  return (
    <FieldLayoutContainer className={className} invalid={typeof errorMessage === "string"} fieldName={field.name}>
      {labelPosition === "start" && labelElement}
      {children}
      {labelPosition === "end" && labelElement}
      {!hideError && typeof errorMessage === "string" && field.state.meta.isTouched && (
        <span className="mt-1 flex flex-row gap-1 font-bold text-red-500">
          <TriangleAlertIcon />
          {errorMessage}
        </span>
      )}
    </FieldLayoutContainer>
  );
}
