// src/types/express.d.ts
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        phoneNumber?: string;
        [key: string]: any;
      };
    }
  }
}
