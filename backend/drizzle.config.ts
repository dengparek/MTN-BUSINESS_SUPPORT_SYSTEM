import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";

//Polyfill BigInt serialization for drizzle-kit schema diffing
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
// dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.development.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is missing from environment variables.");
}

export default defineConfig({
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
