import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { z } from "zod";

export enum InputElementType {
  Input = "Input",
  Textarea = "Textarea",
  Number = "Number",
  Date = "Date",
  Combobox = "Combobox",
  File = "File",
  Picker = "Picker",
}

export function getFormInputByLabel(
  element: Page | Locator,
  labelText: string,
  inputElementType: InputElementType = InputElementType.Input,
): Locator {
  // A backslash or quote in a label (e.g. "Característica \ Unidades") breaks an unescaped CSS string
  const label = JSON.stringify(labelText);
  // A label with a hint holds its text in the button that opens the hint, and text-is only matches direct text
  const nextTo = (input: string) =>
    element.locator(`label:text-is(${label}) + ${input}, label:has(> button:text-is(${label})) + ${input}`);
  switch (inputElementType) {
    case InputElementType.Textarea:
      return nextTo(`textarea[data-input-type="textarea"]`);
    case InputElementType.Input:
    case InputElementType.Number:
      return nextTo(`input[data-input-type="input"]`);
    case InputElementType.Date:
      return nextTo(`div[data-input-type="date-input"]`);
    case InputElementType.Combobox:
      return nextTo(`div[data-input-type="combobox"]`);
    case InputElementType.File:
      return nextTo(`div[data-input-type="dropzone"]`);
    case InputElementType.Picker:
      return nextTo(`div[data-input-type="picker"]`);
    default:
      throw new Error(`Invalid argument, unknown type: "${inputElementType as string}"`);
  }
}

/**
 * Waits until the form (or any container that renders one) has finished loading its data.
 *
 * Asserts on the container's `data-loading="false"` marker instead of the absence of the loading
 * overlay: an absence assertion also passes *before* the overlay is mounted, so the test would
 * continue while the form is still about to load.
 */
export async function assertFormLoaded(element: Page | Locator): Promise<void> {
  await expect(element.locator("xpath=descendant-or-self::*[@data-loading]").first()).toHaveAttribute(
    "data-loading",
    "false",
  );
}

// The form shows each error its schema gives for the values, as many times as the fields that get it
export async function assertFormSchemaErrors(container: Locator, schema: z.ZodType, values: unknown) {
  const result = schema.safeParse(values);
  expect(result.success, "Wrong test set up: The schema should reject the values").toBe(false);
  const messageCounts = new Map<string, number>();
  for (const issue of result.error!.issues) {
    messageCounts.set(issue.message, (messageCounts.get(issue.message) ?? 0) + 1);
  }
  for (const [message, count] of messageCounts) {
    await expect(container.getByText(message, { exact: true })).toHaveCount(count);
  }
}
