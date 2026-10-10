import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db";

import { connectRedis } from "./config/redis";
import { ussdRouter } from "./modules/ussd/ussd.router";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());

// Critical for parsing urlencoded payloads sent by Africa's Talking USSD Gateway
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/ussd", ussdRouter);

// --- HEALTH CHECK ROUTE ---
app.get("/health", async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    service: "MTN BSS Backend Core",
    timestamp: new Date().toISOString(),
  });
});

// --- SERVER INITIALIZATION ---
async function startServer() {
  console.log("🚀 Initializing MTN Business Support System Backend...");

  // 1. Verify Neon Database Connection
  await connectDB();

  // 2. Verify Redis Session Store Connection
  await connectRedis();

  // 3. Start Express HTTP Server
  app.listen(PORT, () => {
    console.log(`MTN BSS Core Server is running on port ${PORT}`);
  });
}

startServer();
