import { expect, test } from "@playwright/test";
import type { AnyRouter } from "@trpc/server";

import { MUTATION_MESSAGES } from "@/messages/mutations";
import { AUDIT_TABLES_PATH, readAuditTables } from "@/tests/utils/audit-tables";
import { auditMiddleware } from "@/trpc";
import { appRouter } from "@/trpc/app-router";

// The public type of a procedure leaves out the middlewares it was built with
interface TBuiltProcedure {
  _def: { type: string; middlewares: Array<unknown> };
}

test("every mutation of the tRPC router is audited", () => {
  const [auditFunction] = auditMiddleware._middlewares;
  // The type of appRouter nests the routers, but at runtime every procedure is in the same record, by its full path
  const router: AnyRouter = appRouter;
  const procedures = Object.entries(router._def.procedures as Record<string, TBuiltProcedure>);
  const mutations = procedures.filter(([, procedure]) => procedure._def.type === "mutation");

  expect(mutations, "The mutations should be found").not.toHaveLength(0);
  expect(
    mutations.filter(([, procedure]) => !procedure._def.middlewares.includes(auditFunction)).map(([path]) => path),
    "Mutations built without the audited procedure",
  ).toEqual([]);

  const mutationPaths = mutations.map(([path]) => path);
  const auditTables = readAuditTables();
  expect(
    mutationPaths.filter((path) => auditTables[path] === undefined),
    `Mutations with no tables in ${AUDIT_TABLES_PATH}: write them by hand or run their tests with UPDATE_AUDIT_TABLES=true`,
  ).toEqual([]);
  expect(
    Object.keys(auditTables).filter((path) => !mutationPaths.includes(path)),
    `Procedures of ${AUDIT_TABLES_PATH} that are not mutations of the router`,
  ).toEqual([]);

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
