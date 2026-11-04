import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
  switch (inputElementType) {
    case InputElementType.Textarea:
      return element.locator(`label:text-is("${labelText}") + textarea[data-input-type="textarea"]`);
    case InputElementType.Input:
    case InputElementType.Number:
      return element.locator(`label:text-is("${labelText}") + input[data-input-type="input"]`);
    case InputElementType.Date:
      return element.locator(`label:text-is("${labelText}") + div[data-input-type="date-input"]`);
    case InputElementType.Combobox:
      return element.locator(`label:text-is("${labelText}") + div[data-input-type="combobox"]`);
    case InputElementType.File:
      return element.locator(`label:text-is("${labelText}") + div[data-input-type="dropzone"]`);
    case InputElementType.Picker:
      return element.locator(`label:text-is("${labelText}") + div[data-input-type="picker"]`);
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
