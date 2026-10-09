import { createClient } from "redis";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.development.local") });

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

if (redisUrl) {
  console.log("Redis URL not provided");
}

export const redisClient = createClient({
  url: redisUrl,
  socket: {
    // Required for secure rediss:// endpoints on cloud hosts

    tls: redisUrl.startsWith("rediss://") ? true : undefined,
    rejectUnauthorized: false,
  },
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("⚡ Connected to Upstash Redis successfully!");
});

export async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    throw error;
  }
}
