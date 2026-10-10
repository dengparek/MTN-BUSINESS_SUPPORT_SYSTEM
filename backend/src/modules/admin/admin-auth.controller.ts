import { Request, Response } from "express";
import { db } from "../../config/db";
import { users } from "../../database/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export class AdminAuthController {
  static async login(req: Request, res: Response) {
    try {
      const { emailOrPhone, password } = req.body;

      if (!emailOrPhone || !password) {
        return res
          .status(400)
          .json({ error: "Email/Phone and password are required." });
      }

      // Find user with ADMIN role
      const [adminUser] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.phoneNumber, emailOrPhone),
            eq(users.role, "ADMIN"),
            eq(users.status, "ACTIVE"),
          ),
        )
        .limit(1);

      // Guard check if user exists and has a password hash set
      if (!adminUser || !adminUser.passwordHash) {
        return res
          .status(401)
          .json({ error: "Invalid credentials or unauthorized access." });
      }

      // Verify Password safely with string assertion
      const isPasswordValid = await bcrypt.compare(
        password,
        adminUser.passwordHash,
      );
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials." });
      }

      // Generate JWT Token (stateless session valid for 8 hours)
      const token = jwt.sign(
        { userId: adminUser.id, role: adminUser.role },
        process.env.JWT_SECRET!,
        { expiresIn: "8h" },
      );

      return res.status(200).json({
        message: "Admin authentication successful.",
        token,
        admin: {
          id: adminUser.id,
          phoneNumber: adminUser.phoneNumber,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Admin Login Error:", errorMessage);

      return res
        .status(500)
        .json({ error: "Internal server error during admin login." });
    }
  }
}
