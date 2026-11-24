import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { dbTableUser } from "@/db/schema";
import { USER_IP_INVALID_MESSAGE } from "@/messages/backoffice";
import { nameSchema, requiredIdObjectSchema, tableStateSchema } from "@/schemas";

export const userSchema = createSelectSchema(dbTableUser);

const baseUserSchema = z.object({
  ip: z
    .string({ error: USER_IP_INVALID_MESSAGE })
    .trim()
    .pipe(z.union([z.ipv4(), z.ipv6()], { error: USER_IP_INVALID_MESSAGE })),
  name: nameSchema,
});

export const createUserSchema = baseUserSchema;
export type TCreateUser = z.infer<typeof createUserSchema>;

export const updateUserSchema = baseUserSchema.extend(requiredIdObjectSchema.shape);
export type TUpdateUser = z.infer<typeof updateUserSchema>;

const userFiltersSchema = z.array(
  z.discriminatedUnion("id", [
    z.object({ id: z.literal("ip"), value: z.string().nullable() }),
    z.object({ id: z.literal("name"), value: z.string().nullable() }),
  ]),
);
export type TUserFilters = z.infer<typeof userFiltersSchema>;
export const tableUserStateSchema = tableStateSchema({ filtersSchema: userFiltersSchema });
export type TTableUserState = z.infer<typeof tableUserStateSchema>;
