import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import dotenv from "dotenv";
import * as schema from "../database/schema.js";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.development.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is not defined in environment variables.");
}

// Configure PostgreSQL pool with Neon SSL support
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });

//Health check function to verify Neon Postgres connectivity on startup

export async function connectDB() {
  try {
    const client = await pool.connect();
    console.log("⚡ Connected to Neon PostgreSQL database successfully!");
    client.release();
  } catch (error) {
    console.error("❌ Failed to connect to Neon PostgreSQL database:", error);
    process.exit(1);
  }
}
