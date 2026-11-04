import { defineConfig } from "drizzle-kit";

if (process.env.DATABASE_URL === undefined) {
  throw new Error("Environment variable DATABASE_URL is not set");
}

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
});
