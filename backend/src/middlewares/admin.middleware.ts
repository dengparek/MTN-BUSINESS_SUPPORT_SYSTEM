import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface AdminJwtPayload {
  userId: string;
  role: string;
}

// Extend Express Request interface to include user payload
declare global {
  namespace Express {
    interface Request {
      user?: AdminJwtPayload;
    }
  }
}

export function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as AdminJwtPayload;

    // Strict Role-Based Access Control check
    if (decoded.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Access forbidden. Admin privileges required." });
    }

    req.user = decoded;
    next();
  } catch (error: unknown) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
