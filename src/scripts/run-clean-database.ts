import { cleanDatabase } from "@/db";

await cleanDatabase((await import("@/db")).default);
