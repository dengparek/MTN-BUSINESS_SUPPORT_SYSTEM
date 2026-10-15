import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AdminJwtPayload } from "../types/index.js";

export function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. Malformed token." });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res
      .status(500)
      .json({ error: "Server configuration error: JWT secret not defined." });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // Type guard to ensure decoded is a valid object containing expected properties
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "userId" in decoded &&
      "role" in decoded &&
      typeof (decoded as AdminJwtPayload).userId === "string" &&
      typeof (decoded as AdminJwtPayload).role === "string"
    ) {
      const adminPayload = decoded as AdminJwtPayload;

      // Strict Role-Based Access Control check
      if (adminPayload.role !== "ADMIN") {
        return res
          .status(403)
          .json({ error: "Access forbidden. Admin privileges required." });
      }

      req.user = adminPayload;
      return next();
    }

    return res.status(401).json({ error: "Invalid token structure." });
  } catch (error: unknown) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
