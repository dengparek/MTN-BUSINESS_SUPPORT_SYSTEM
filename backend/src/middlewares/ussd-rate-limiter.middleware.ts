import { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/redis.js";

const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 requests
const WINDOW_SECONDS = 60; // Per 60 seconds per phone number

export async function ussdRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const phoneNumber = req.body.phoneNumber || req.query.phoneNumber;
    if (!phoneNumber) {
      return next(); // Let controller handle missing fields
    }

    const rateKey = `rate:ussd:${phoneNumber}`;
    const currentCount = await redisClient.incr(rateKey);

    if (currentCount === 1) {
      // Set expiration on first increment
      await redisClient.expire(rateKey, WINDOW_SECONDS);
    }

    if (currentCount > MAX_REQUESTS_PER_WINDOW) {
      return res
        .status(429)
        .type("text/plain")
        .send("END Too many requests. Please try again later.");
    }

    next();
  } catch (error) {
    // Fail open if Redis hiccups so USSD service remains available
    console.error("Rate limiter error:", error);
    next();
  }
}
