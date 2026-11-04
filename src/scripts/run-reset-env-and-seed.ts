import resetEnv from "@/scripts/reset-env";
import { seedDatabase } from "@/tests/utils/db";

await resetEnv();

const db = (await import("@/db")).default;
await seedDatabase(db);
