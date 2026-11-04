import { useEffect, useEffectEvent, useState } from "react";

import type { InputProps } from "@/components/ui/input";
import { Input } from "@/components/ui/input";

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 80,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<InputProps, "onChange">) {
  const [value, setValue] = useState(initialValue);

  const onChangeEvent = useEffectEvent(onChange);

  useEffect(() => {
    // Emitting the value it already has would make every filter navigate as soon as it mounts
    if (value === initialValue) {
      return;
    }
    const timeout = setTimeout(() => {
      onChangeEvent(value);
    }, debounce);
    return () => {
      clearTimeout(timeout);
    };
  }, [debounce, value, initialValue]);

  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
      }}
    />
  );
}
