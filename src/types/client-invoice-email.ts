import type { InferSelectModel } from "drizzle-orm";

import type { dbTableClientInvoiceEmail } from "@/db/schema";

export type BaseClientInvoiceEmail = InferSelectModel<typeof dbTableClientInvoiceEmail>;
