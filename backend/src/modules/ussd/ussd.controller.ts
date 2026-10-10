import { Request, Response } from "express";
import { db } from "../../config/db";
import { users } from "../../database/schema";
import { eq } from "drizzle-orm";
import { AgentUSSDHandler } from "./agent-ussd.handler";
import { SubscriberUSSDHandler } from "./subscriber-ussd.handler";

export class USSDController {
  static async handleUSSD(req: Request, res: Response) {
    // const start = Date.now();
    const startTime = performance.now();
    let responseMessage = "END System error occurred.";
    try {
      const { sessionId, serviceCode, phoneNumber, text } = req.body;

      if (!phoneNumber || !serviceCode || !sessionId) {
        return res.status(400).send("END Error: Invalid payload.");
      }

      // 1. Identify User Role by PhoneNumber
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber));

      let responseMessage = "";

      if (user && (user.role === "AGENT" || user.role === "ADMIN")) {
        // Delegate to Agent USSD Handler
        responseMessage = await AgentUSSDHandler.handle(
          sessionId,
          phoneNumber,
          text || "",
        );
      } else if (user && user.role === "SUBSCRIBER") {
        // Delegate to Subscriber USSD Handler strictly for SUBSCRIBER role
        responseMessage = await SubscriberUSSDHandler.handle(
          sessionId,
          phoneNumber,
          text || "",
        );
      } else {
        // Block ADMINs or unregistered MSISDNs from accessing USSD services
        responseMessage = "END Access Denied: This Number does not exist.";
      }

      // Africa's Talking requires text/plain response
      res.set("Content-Type", "text/plain");
      return res.status(200).send(responseMessage);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error:", errorMessage);

      console.error("USSD Controller Error:", error);
      res.set("Content-Type", "text/plain");
      return res
        .status(200)
        .send("END System error occurred. Please try again later.");
    } finally {
      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`⏱️ USSD Request Processed in ${duration}ms`);
    }
  }
}
