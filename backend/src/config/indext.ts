import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../database/schema.js";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
