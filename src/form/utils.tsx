import * as z from "zod";

function unwrapPipe(schema: z.core.$ZodType): z.core.$ZodType {
  let current = schema;

  while (current instanceof z.ZodPipe) {
    current = current.def.out;
  }

  return current;
}

function isNotRequired(schema: z.core.$ZodType): boolean {
  const current = schema;

  if (current instanceof z.ZodOptional || current instanceof z.ZodDefault || current instanceof z.ZodNullable) {
    return true;
  }

  if (current instanceof z.ZodPipe) {
    return isNotRequired(current.def.in);
  }

  if (current instanceof z.ZodUnion) {
    return current.options.some((option) => isNotRequired(option));
  }

  return false;
}

export function isFieldRequired(fieldPath: string, schema?: z.core.$ZodType): boolean {
  if (!schema) {
    return false;
  }

  const parts = fieldPath.split(".");
  let current = schema;

  for (const part of parts) {
    current = unwrapPipe(current);

    if (current instanceof z.ZodObject) {
      const shape = current.shape;

      if (!(part in shape)) {
        return false;
      }

      current = shape[part] as z.ZodType;
      continue;
    }

    if (current instanceof z.ZodArray && /^\d+$/.test(part)) {
      current = current.element;
      continue;
    }

    if (current instanceof z.ZodUnion) {
      return current.options.every((option) => isFieldRequired(parts.slice(parts.indexOf(part)).join("."), option));
    }

    if (current instanceof z.ZodIntersection) {
      return isFieldRequired(fieldPath, current.def.left) && isFieldRequired(fieldPath, current.def.right);
    }

    return false;
  }

  return !isNotRequired(current);
}

export function goToNextFocusableElement(ref: React.RefObject<HTMLElement | null> | undefined, e: React.KeyboardEvent) {
  if (e.key === "Enter" && ref?.current) {
    e.preventDefault();
    ref.current.blur();

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>('input,select,textarea,button,[tabindex]:not([tabindex="-1"])'),
    ).filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("inert"),
    );

    const index = focusable.indexOf(ref.current);
    if (index > -1 && index + 1 < focusable.length) {
      focusable[index + 1].focus();
    }
  }
}
