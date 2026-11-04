import { useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import type { NumericFormatProps, SourceInfo } from "react-number-format";

import { Input } from "@/components/ui/input";
import { goToNextFocusableElement } from "@/form/utils";
import { cn } from "@/lib/utils";

const DECIMAL_SEPARATOR = ",";

export interface NumberInputProps
  extends
    Omit<NumericFormatProps, "value" | "onValueChange" | "getInputRef" | "disabled">,
    Pick<React.ComponentProps<typeof Input>, "readOnly" | "testId" | "className" | "placeholder"> {
  thousandSeparator?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  value: string | null;
  suffix?: string;
  prefix?: string;
  onValueChange?: (value: string | null) => void;
  decimalScale?: number;
  minDecimalScale?: number;
  ref?: React.Ref<HTMLInputElement>;
}

export default function NumberInput({
  thousandSeparator,
  defaultValue,
  min = 0,
  max = Infinity,
  onValueChange,
  decimalScale = 0,
  minDecimalScale = 0,
  suffix,
  prefix,
  value: controlledValue,
  ref: forwardedRef,
  className,
  onBlur,
  onFocus,
  ...props
}: NumberInputProps) {
  const internalRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const value = controlledValue !== null ? controlledValue : defaultValue !== undefined ? String(defaultValue) : null;

  const setValue = (newValue: string | null) => {
    onValueChange?.(newValue);
  };

  const handleChange = (values: { value: string; floatValue: number | undefined }, sourceInfo: SourceInfo) => {
    if (sourceInfo.event !== undefined) {
      setIsEditing(true);
    }
    const newValue = values.value !== "" ? values.value : null;
    // react-number-format echoes back the values that come from the value prop, which would mark a
    // form as dirty as soon as it fills its fields with asynchronously loaded data
    if (
      newValue === value ||
      (sourceInfo.event === undefined && newValue !== null && value !== null && Number(newValue) === Number(value))
    ) {
      return;
    }
    setValue(newValue);
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setIsEditing(false);
    onBlur?.(e);
    const floatValue = value !== null ? parseFloat(value) : undefined;
    if (floatValue === undefined) return;
    if (floatValue < min) {
      setValue(String(min));
    } else if (floatValue > max) {
      setValue(String(max));
    }
  };

  // The padding is applied to the value instead of through fixedDecimalScale, and kept until the user edits: changing
  // the formatting on focus rewrites the input text, which drops the selection and the caret position, and
  // fixedDecimalScale truncates any decimal typed past minDecimalScale
  const [integerPart, decimalPart = ""] = (value ?? "").split(".");
  const displayValue =
    !isEditing && value !== null && decimalPart.length < minDecimalScale
      ? `${integerPart}.${decimalPart.padEnd(minDecimalScale, "0")}`
      : value;

  return (
    <NumericFormat
      getInputRef={(el: HTMLInputElement) => {
        internalRef.current = el;
        if (!forwardedRef) return;
        if (typeof forwardedRef === "function") {
          forwardedRef(el);
        } else {
          forwardedRef.current = el;
        }
      }}
      // react-number-format treats a null value as uncontrolled and keeps showing the previous number
      value={displayValue ?? ""}
      onValueChange={handleChange}
      thousandSeparator={thousandSeparator}
      decimalScale={decimalScale}
      allowNegative={min < 0}
      valueIsNumericString
      onBlur={handleBlur}
      onFocus={onFocus}
      max={max}
      min={min}
      suffix={suffix}
      prefix={prefix}
      customInput={Input}
      decimalSeparator={DECIMAL_SEPARATOR}
      onKeyDown={(e) => {
        goToNextFocusableElement(internalRef, e);
      }}
      placeholder={suffix}
      className={cn("w-base-number-input text-right", className)}
      {...props}
    />
  );
}
