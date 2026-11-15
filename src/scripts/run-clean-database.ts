import logger from "@/logging/logger";

if (process.env.NODE_ENV === "production") {
  logger.crit("cleanDatabase should not be run in production");
  process.exit(1);
}

const { cleanDatabase, default: db } = await import("@/db");
await cleanDatabase(db);
