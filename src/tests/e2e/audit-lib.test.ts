import { expect, test } from "@playwright/test";

import { AUDIT_REDACTED_VALUE, redactAuditInput } from "@/logging/audit";

test("the audit log hides the secrets and the files of an input", () => {
  const formData = new FormData();
  formData.append("name", "Plano");
  formData.append("file", new File(["content"], "plano.pdf"));

  expect(
    redactAuditInput({
      id: 1,
      name: "Mesa",
      password: "secret",
      nested: [{ Password: "secret", shareName: "Albaranes" }],
      empty: null,
    }),
  ).toEqual({
    id: 1,
    name: "Mesa",
    password: AUDIT_REDACTED_VALUE,
    nested: [{ Password: AUDIT_REDACTED_VALUE, shareName: "Albaranes" }],
    empty: null,
  });
  expect(redactAuditInput(formData)).toEqual({ name: "Plano", file: { name: "plano.pdf", size: 7 } });
  expect(redactAuditInput(undefined)).toBeUndefined();
});
