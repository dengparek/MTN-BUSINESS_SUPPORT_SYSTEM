// src/types/express.d.ts
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string; // or number, depending on your database ID type
        role: string;
      };
    }
  }
}
