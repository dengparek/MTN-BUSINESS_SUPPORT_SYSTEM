import { redisClient } from "../../config/redis";
import { USSDSessionState } from "../../types/index";
import dotenv from "dotenv";

dotenv.config();
const SESSION_TTL = process.env.SESSION_TTL
  ? parseInt(process.env.SESSION_TTL, 10)
  : 180;

if (isNaN(SESSION_TTL)) {
  console.warn(
    "Invalid SESSION_TTL in environment variables, defaulting to 180 seconds.",
  );
}

export class USSDSessionService {
  private static getKey(sessionId: string): string {
    return `ussd:session:${sessionId}`;
  }

  static async getSession(sessionId: string): Promise<USSDSessionState> {
    const data = await redisClient.get(this.getKey(sessionId));
    return data ? JSON.parse(data) : {};
  }

  static async updateSession(
    sessionId: string,
    state: Partial<USSDSessionState>,
  ): Promise<void> {
    const current = await this.getSession(sessionId);

    const updated = { ...current, ...state };
    await redisClient.setEx(
      this.getKey(sessionId),
      SESSION_TTL,
      JSON.stringify(updated),
    );
  }

  static async clearSession(sessionId: string): Promise<void> {
    await redisClient.del(this.getKey(sessionId));
  }
}
