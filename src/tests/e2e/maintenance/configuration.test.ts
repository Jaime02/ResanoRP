import { expect } from "@playwright/test";

import { getConfiguration } from "@/db/functions/configuration";
import { LEGAL_NAME_LABEL } from "@/messages/common";
import { CONFIGURATION_EDITED_MESSAGE, INVOICE_FOOTNOTE_LABEL, VAT_PERCENTAGE_LABEL } from "@/messages/configuration";
import { mockConfigurations } from "@/tests/mock-data";
import { InputElementType, assertFormLoaded, getFormInputByLabel } from "@/tests/utils/components/form";
import { expectSingleSuccessToast } from "@/tests/utils/components/toast";
import { test } from "@/tests/utils/fixtures";

const MAINTENANCE_CONFIGURATION_URL = "/maintenance?tab=configuration";

test("edit the Configuración", async ({ page }) => {
  const [mockConfiguration] = mockConfigurations;
  const formConfiguration = page.getByTestId("form-configuration");
  const inputLegalName = getFormInputByLabel(formConfiguration, LEGAL_NAME_LABEL);
  const inputVatPercentage = getFormInputByLabel(formConfiguration, VAT_PERCENTAGE_LABEL, InputElementType.Number);
  const inputInvoiceFootnote = getFormInputByLabel(
    formConfiguration,
    INVOICE_FOOTNOTE_LABEL,
    InputElementType.Textarea,
  );

  await page.goto(MAINTENANCE_CONFIGURATION_URL);
  await assertFormLoaded(formConfiguration);
  await expect(inputLegalName).toHaveValue(mockConfiguration.legalName);
  await expect(inputVatPercentage).toHaveValue(String(mockConfiguration.vatPercentage));
  await expect(inputInvoiceFootnote).toHaveValue(mockConfiguration.invoiceFootnote ?? "");

  const edited = { invoiceFootnote: "Pie de factura editado", legalName: "Empresa Editada S.L.", vatPercentage: 10 };
  await inputLegalName.fill(edited.legalName);
  await inputVatPercentage.fill(String(edited.vatPercentage));
  await inputInvoiceFootnote.fill(edited.invoiceFootnote);
  await formConfiguration.getByTestId("button-submit").click();
  await expectSingleSuccessToast(page, CONFIGURATION_EDITED_MESSAGE);

  expect(await getConfiguration()).toEqual({ ...mockConfiguration, ...edited });

  await page.reload();
  await assertFormLoaded(formConfiguration);
  await expect(inputLegalName).toHaveValue(edited.legalName);
  await expect(inputVatPercentage).toHaveValue(String(edited.vatPercentage));
  await expect(inputInvoiceFootnote).toHaveValue(edited.invoiceFootnote);
});
