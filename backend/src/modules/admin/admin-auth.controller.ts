import { Request, Response } from "express";
import { db } from "../../config/db";
import { adminAuditLogs, users } from "../../database/schema";
import { eq, and, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export class AdminAuthController {
  static async createAdmin(req: Request, res: Response) {
    try {
      const { phoneNumber, email, password, fullName } = req.body;
      if (!phoneNumber || !email || !fullName) {
        res.json({
          success: false,
          Message: "Wrong or missing Creditials",
        });
      }
      const currentAdminId = req.user?.userId;

      if (!phoneNumber || !password || !fullName) {
        return res.status(400).json({
          error: "Phone number, password, and full name are required.",
        });
      }

      // 1. Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.phoneNumber, phoneNumber),
            email ? eq(users.email, email) : eq(users.phoneNumber, ""), // fallback if email is optional
          ),
        )
        .limit(1);

      if (existingUser) {
        return res.status(409).json({
          error: "A user with this phone number or email already exists.",
        });
      }

      // 2. Hash the password securely
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // 3. Execute creation and audit logging inside a database transaction
      const result = await db.transaction(async (tx) => {
        // Create the new user with ADMIN role
        const [newAdmin] = await tx
          .insert(users)
          .values({
            phoneNumber,
            email: email || null,
            passwordHash,
            role: "ADMIN",
            status: "ACTIVE",
          })
          .returning();

        // Record the administrative action in audit logs
        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: "CREATE_ADMIN",
            targetId: newAdmin.id,
            details: `Created new admin account for phone: ${phoneNumber}`,
            ipAddress: req.ip || null,
          });
        }

        return newAdmin;
      });

      return res.status(201).json({
        message: "New admin user successfully created.",
        admin: {
          id: result.id,
          phoneNumber: result.phoneNumber,
          email: result.email,
          role: result.role,
          status: result.status,
          createdAt: result.createdAt,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Create Admin Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while creating admin." });
    }
  }

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
