import type { InferSelectModel } from "drizzle-orm";

import type { dbTableInvoice } from "@/db/schema";
import type { SerializeDateFields } from "@/types";

export type BaseInvoice = InferSelectModel<typeof dbTableInvoice>;
export type BaseInvoiceSerialized = SerializeDateFields<BaseInvoice>;

export const PENDING_DELIVERY_NOTES_PAGE_SIZE = 8;
