import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import type { TDatabase } from "@/db";
import { ADMIN_ONLY_MESSAGE } from "@/messages/common";
import { formatZodError } from "@/schemas/utils";

export type Context = {
  db: TDatabase;
  isAdmin: boolean;
  // The cookies of the caller, which the server sends back to itself to read the files it prints, as some need a session
  cookie: string | null;
};
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? formatZodError(error.cause) : null,
      },
    };
  },
});

export const router = t.router;
export const procedure = t.procedure;

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ADMIN_ONLY_MESSAGE,
    });
  }
  return next();
});
