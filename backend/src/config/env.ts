import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

// Define strict schema validation for environment variables
const envSchema = z.object({
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10)),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url({
    message: "DATABASE_URL must be a valid PostgreSQL connection string",
  }),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AT_USERNAME: z.string().default("sandbox"),
  AT_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().default("super_secret_mtn_bss_jwt_key_2026"),
});

// Parse and validate process.env
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  throw new Error(
    "Invalid environment variables. Please check your .env file.",
  );
}

export const env = _env.data;
