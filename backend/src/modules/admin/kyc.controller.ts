import { Request, Response } from "express";
import { db } from "../../config/db";
import {
  subscribers,
  adminAuditLogs,
  chargingAccounts,
  simAssignments,
  users,
} from "../../database/schema";
import { eq, and, sql, desc, or, ilike } from "drizzle-orm";

export class AdminKycController {
  /**
   * POST /api/v1/admin/subscribers
   * Register a new subscriber manually from the HQ admin dashboard.
   */
  static async createSubscriber(req: Request, res: Response) {
    try {
      const { phoneNumber, email, firstName, lastName, nationalId } = req.body;
      const currentAdminId = req.user?.userId;

      if (!phoneNumber || !firstName || !lastName || !nationalId) {
        return res.status(400).json({
          error:
            "Phone number, first name, last name, and national ID are required.",
        });
      }

      // 1. Check if phone number is already taken in users table
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phoneNumber))
        .limit(1);

      if (existingUser) {
        return res
          .status(409)
          .json({ error: "A user with this phone number already exists." });
      }

      // 2. Check if National ID is already registered
      const [existingNationalId] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.nationalId, nationalId))
        .limit(1);

      if (existingNationalId) {
        return res.status(409).json({
          error: "A subscriber with this national ID already exists.",
        });
      }

      // 3. Execute creation in a secure atomic transaction
      const result = await db.transaction(async (tx) => {
        // Create base user record
        const [newUser] = await tx
          .insert(users)
          .values({
            phoneNumber,
            email: email || null,
            role: "SUBSCRIBER",
            status: "ACTIVE",
          })
          .returning();

        // Create subscriber profile (auto-verified since admin is registering directly)
        const [newSubscriber] = await tx
          .insert(subscribers)
          .values({
            userId: newUser.id,
            firstName,
            lastName,
            nationalId,
            status: "ACTIVE",
            kycStatus: "VERIFIED",
          })
          .returning();

        // Initialize charging account wallet
        await tx.insert(chargingAccounts).values({
          subscriberId: newSubscriber.id,
          currency: "SSP",
          balanceMinor: 0n,
        });

        // Record administrative action in audit logs
        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: "CREATE_SUBSCRIBER",
            targetId: newSubscriber.id,
            details: `Admin registered new subscriber: ${firstName} ${lastName} (${phoneNumber})`,
            ipAddress: req.ip || null,
          });
        }

        return { newUser, newSubscriber };
      });

      return res.status(201).json({
        message: "Subscriber successfully registered.",
        data: {
          subscriber: result.newSubscriber,
          user: {
            id: result.newUser.id,
            phoneNumber: result.newUser.phoneNumber,
            email: result.newUser.email,
            role: result.newUser.role,
          },
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Create Subscriber Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while creating subscriber." });
    }
  }
  /**
   * GET /api/v1/admin/subscribers/:id
   * Fetch a single subscriber's detailed profile, including wallet balance and SIM details.
   */
  static async getSubscriberById(req: Request, res: Response) {
    try {
      const rawId = req.params.id;
      const subscriberId = Array.isArray(rawId) ? rawId[0] : (rawId as string);

      if (!subscriberId) {
        return res.status(400).json({ error: "Subscriber ID is required." });
      }

      // 1. Fetch subscriber details
      const [subscriber] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, subscriberId))
        .limit(1);

      if (!subscriber) {
        return res.status(404).json({ error: "Subscriber not found." });
      }

      // 2. Fetch associated charging account (wallet balance) and active SIM assignment concurrently
      const [chargingAccount, simAssignmentList] = await Promise.all([
        db
          .select()
          .from(chargingAccounts)
          .where(eq(chargingAccounts.subscriberId, subscriberId))
          .limit(1),
        db
          .select()
          .from(simAssignments)
          .where(
            and(
              eq(simAssignments.subscriberId, subscriberId),
              sql`${simAssignments.endedAt} is null`,
            ),
          )
          .limit(1),
      ]);

      return res.status(200).json({
        message: "Subscriber profile retrieved successfully.",
        data: {
          subscriber,
          chargingAccount: chargingAccount[0] || null,
          activeSimAssignment: simAssignmentList[0] || null,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get Subscriber By ID Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Failed to fetch subscriber details." });
    }
  }
  /**
   * GET /api/v1/admin/subscribers
   * List subscribers with optional filters for KYC status, account status, and search query.
   **/
  static async getSubscribers(req: Request, res: Response) {
    try {
      const { kycStatus, status, search, page = "1", limit = "20" } = req.query;

      const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 20),
      );
      const offset = (pageNumber - 1) * pageSize;

      // Normalize query parameters with exact enum casting
      const kycFilter =
        typeof kycStatus === "string"
          ? (kycStatus.toUpperCase() as "PENDING" | "VERIFIED" | "REJECTED")
          : undefined;
      const statusFilter =
        typeof status === "string"
          ? (status.toUpperCase() as "ACTIVE" | "SUSPENDED" | "BLOCKED")
          : undefined;
      const searchStr = typeof search === "string" ? search.trim() : "";

      // Build dynamic filters
      const conditions = [];

      if (kycFilter) {
        conditions.push(eq(subscribers.kycStatus, kycFilter));
      }

      if (statusFilter) {
        conditions.push(eq(subscribers.status, statusFilter));
      }

      if (searchStr) {
        conditions.push(
          or(
            ilike(subscribers.firstName, `%${searchStr}%`),
            ilike(subscribers.lastName, `%${searchStr}%`),
            ilike(subscribers.nationalId, `%${searchStr}%`),
          ),
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Fetch paginated subscribers and total count concurrently
      const [subscriberList, [{ count }]] = await Promise.all([
        db
          .select({
            id: subscribers.id,
            userId: subscribers.userId,
            firstName: subscribers.firstName,
            lastName: subscribers.lastName,
            nationalId: subscribers.nationalId,
            status: subscribers.status,
            kycStatus: subscribers.kycStatus,
            createdAt: subscribers.createdAt,
          })
          .from(subscribers)
          .where(whereClause)
          .orderBy(desc(subscribers.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(subscribers)
          .where(whereClause),
      ]);

      return res.status(200).json({
        message: "Subscribers retrieved successfully.",
        data: {
          subscribers: subscriberList,
          pagination: {
            total: Number(count),
            page: pageNumber,
            limit: pageSize,
            totalPages: Math.ceil(Number(count) / pageSize),
          },
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get Subscribers Error:", errorMessage);
      return res.status(500).json({ error: "Failed to fetch subscribers." });
    }
  }

  /**
   * PATCH /api/v1/admin/kyc/:userId
   * Approve or reject a subscriber's KYC verification status atomically with audit logging.
   */ static async updateKycStatus(req: Request, res: Response) {
    try {
      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId)
        ? rawUserId[0]
        : (rawUserId as string);
      const { kycStatus, rejectionReason } = req.body;
      const currentAdminId = req.user?.userId;

      if (!userId) {
        return res.status(400).json({ error: "Subscriber ID is required." });
      }

      const normalizedStatus = kycStatus ? kycStatus.toUpperCase() : "";
      if (!["VERIFIED", "REJECTED", "PENDING"].includes(normalizedStatus)) {
        return res.status(400).json({
          error:
            "Invalid KYC status. Must be one of: VERIFIED, REJECTED, PENDING.",
        });
      }

      if (normalizedStatus === "REJECTED" && !rejectionReason) {
        return res.status(400).json({
          error: "A rejection reason is required when rejecting KYC.",
        });
      }

      // 1. Verify target subscriber exists
      const [targetSubscriber] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, userId))
        .limit(1);

      if (!targetSubscriber) {
        return res.status(404).json({ error: "Subscriber not found." });
      }

      // 2. Execute update and audit log inside a database transaction (Atomicity)
      const updatedSubscriber = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(subscribers)
          .set({
            kycStatus: normalizedStatus as "PENDING" | "VERIFIED" | "REJECTED",
          })
          .where(eq(subscribers.id, userId))
          .returning();

        // Record administrative action in audit logs
        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: `KYC_${normalizedStatus}`,
            targetId: userId,
            details: `Updated KYC status for subscriber ${targetSubscriber.firstName} ${targetSubscriber.lastName} to ${normalizedStatus}${
              rejectionReason ? `. Reason: ${rejectionReason}` : ""
            }`,
            ipAddress: req.ip || null,
          });
        }

        return updated;
      });

      return res.status(200).json({
        message: `Subscriber KYC status successfully updated to ${normalizedStatus}.`,
        subscriber: {
          id: updatedSubscriber.id,
          firstName: updatedSubscriber.firstName,
          lastName: updatedSubscriber.lastName,
          nationalId: updatedSubscriber.nationalId,
          kycStatus: updatedSubscriber.kycStatus,
          createdAt: updatedSubscriber.createdAt,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Update KYC Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while updating KYC." });
    }
  }
}
