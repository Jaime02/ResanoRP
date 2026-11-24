import { expect, test } from "@playwright/test";

import { MUTATION_MESSAGES } from "@/messages/mutations";
import { readDeclaredWrites, readMutations } from "@/tests/utils/audit-log";
import { AUDIT_TABLES_ATTACHMENTS } from "@/tests/utils/audit-tables";
import { auditMiddleware } from "@/trpc";

test("every mutation of the tRPC router is audited", async () => {
  const [auditFunction] = auditMiddleware._middlewares;
  const mutations = await readMutations();

  expect(mutations, "The mutations should be found").not.toHaveLength(0);
  expect(
    mutations.filter(([, procedure]) => !procedure._def.middlewares.includes(auditFunction)).map(([path]) => path),
    "Mutations built without the audited procedure",
  ).toEqual([]);
  expect(
    mutations.filter(([, procedure]) => procedure._def.meta?.writes === undefined).map(([path]) => path),
    "Mutations with no .meta({ writes }): give them the tables they write, or [] if they write none",
  ).toEqual([]);
  // The CI compares them with what every test saw written
  await test.info().attach(AUDIT_TABLES_ATTACHMENTS.declared, {
    body: JSON.stringify(await readDeclaredWrites()),
    contentType: "application/json",
  });

  const mutationPaths = mutations.map(([path]) => path);
  const messagePaths = Object.keys(MUTATION_MESSAGES);
  expect(
    mutationPaths.filter((path) => !messagePaths.includes(path)),
    "Mutations with no entry in MUTATION_MESSAGES: give them the toast message, or null if they show none",
  ).toEqual([]);
  expect(
    messagePaths.filter((path) => !mutationPaths.includes(path)),
    "Procedures of MUTATION_MESSAGES that are not mutations of the router",
  ).toEqual([]);
});
