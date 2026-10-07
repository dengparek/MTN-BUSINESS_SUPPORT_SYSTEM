import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("⚡ Connected to Redis successfully!");
});

/**
 * Connects to Redis instance on server startup.
 */
export async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    // Continue execution if Redis is optional, or throw if required for USSD session state
    throw error;
  }
}
