import type { Request, Response } from "express";
import { db } from "../../config/db.js";
import { agents, users, adminAuditLogs } from "../../database/schema.js";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { assertValidPin } from "../../helpers/utils.js";
import { id } from "zod/v4/locales";

export class AdminAgentController {
  /**
   * POST /api/v1/admin/agents
   * Onboard and register a new field agent (creates user + agent profile with hashed USSD PIN).
   */
  static async createAgent(req: Request, res: Response) {
    console.log("🔍 Authenticated Admin ID from Token:", req.user?.userId);
    try {
      const {
        phoneNumber,
        email,
        pin,
        fullName,
        agentCode,
        initialFloatMinor,
      } = req.body;
      const currentAdminId = req.user?.userId;

      if (!phoneNumber || !pin || !fullName) {
        return res.status(400).json({
          error:
            "Phone number, 4-digit PIN, and full name are required to register an agent.",
        });
      }

      const trimmedPhone = phoneNumber.trim();
      const pinStr = String(pin).trim();
      assertValidPin(pinStr);

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, trimmedPhone))
        .limit(1);

      if (existingUser) {
        return res
          .status(400)
          .json({ error: "A user with this phone number already exists." });
      }

      const pinHash = await bcrypt.hash(pinStr, 10);
      const startingFloat =
        initialFloatMinor !== undefined ? BigInt(initialFloatMinor) : 0n;

      // Auto-generate a unique agent code if not explicitly provided
      const generatedAgentCode = agentCode
        ? agentCode.trim()
        : `AGT-${Math.floor(1000 + Math.random() * 9000)}`;

      const newAgentRecord = await db.transaction(async (tx) => {
        // 1. Create User entry with role AGENT
        const [createdUser] = await tx
          .insert(users)
          .values({
            phoneNumber: trimmedPhone,
            email: email ? email.trim() : null,
            role: "AGENT",
            status: "ACTIVE",
          })
          .returning();

        if (!createdUser) {
          throw new Error("Failed to create agent user record.");
        }

        // 2. Create Agent entry matching your exact schema columns
        const [createdAgent] = await tx
          .insert(agents)
          .values({
            userId: createdUser.id,
            agentCode: generatedAgentCode,
            fullName: fullName.trim(),
            pinHash: pinHash,
            floatBalanceMinor: startingFloat,
            status: "ACTIVE",
          })
          .returning();

        if (!createdAgent) {
          throw new Error("Failed to create agent record.");
        }

        // 3. Write admin audit log entry
        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: "AGENT_CREATE",
            targetId: createdAgent.id,
            details: `Admin created new field agent: ${fullName.trim()} (${generatedAgentCode}) with phone ${trimmedPhone}`,
            ipAddress: req.ip || null,
          });
        }

        return {
          agent: createdAgent,
          user: createdUser,
        };
      });

      return res.status(201).json({
        message: "Agent successfully registered and onboarded.",
        data: { id, agentCode, fullName, phoneNumber },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Create Agent Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while creating agent." });
    }
  }
  /**
   * GET /api/v1/admin/agents
   * List and monitor active street agents, locations, and real-time electronic float balances.
   */
  static async getAgents(req: Request, res: Response) {
    try {
      const { status, search, page = "1", limit = "20" } = req.query;

      const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 20),
      );
      const offset = (pageNumber - 1) * pageSize;

      //
      const statusFilter =
        typeof status === "string"
          ? (status.toUpperCase() as "ACTIVE" | "SUSPENDED")
          : undefined;
      const searchStr = typeof search === "string" ? search.trim() : "";

      const conditions = [];

      if (statusFilter) {
        conditions.push(eq(agents.status, statusFilter));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Fetch paginated agents joined with user info and total count concurrently
      const [agentList, [{ count } = { count: 0 }]] = await Promise.all([
        db
          .select({
            id: agents.id,
            userId: agents.userId,
            floatBalanceMinor: agents.floatBalanceMinor,
            status: agents.status,
            createdAt: agents.createdAt,
            user: {
              phoneNumber: users.phoneNumber,
              email: users.email,
              role: users.role,
            },
          })
          .from(agents)
          .innerJoin(users, eq(agents.userId, users.id))
          .where(whereClause)
          .orderBy(desc(agents.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(agents)
          .where(whereClause),
      ]);

      return res.status(200).json({
        message: "Agents retrieved successfully.",
        data: {
          agents: agentList,
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
      console.error("Get Agents Error:", errorMessage);
      return res.status(500).json({ error: "Failed to fetch agents list." });
    }
  }

  // updating agent status
  static async updateAgentStatus(req: Request, res: Response) {
    try {
      // Normalize req.params.id to guarantee a string type
      const rawId = req.params.id;
      const agentId = Array.isArray(rawId) ? rawId[0] : rawId;

      const { status, reason, Reason } = req.body;
      const resolvedReason = reason || Reason;
      const currentAdminId = req.user?.userId;

      if (!agentId || !status || !resolvedReason) {
        return res.status(400).json({
          error: "Agent ID, status, and a reason are required.",
        });
      }

      const normalizedStatus = status.toUpperCase();
      const validStatuses = ["ACTIVE", "SUSPENDED", "LOCKED"];

      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      // 1. Verify target agent exists
      const [targetAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId)) // Now strictly a string
        .limit(1);

      if (!targetAgent) {
        return res.status(404).json({ error: "Agent not found." });
      }

      if (targetAgent.status === normalizedStatus) {
        return res.status(400).json({
          error: `Agent is already in ${normalizedStatus} status.`,
        });
      }

      // 2. Execute status update and audit log atomically in a transaction
      const updatedAgent = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(agents)
          .set({ status: normalizedStatus })
          .where(eq(agents.id, agentId))
          .returning();

        if (!updated) {
          throw new Error("Failed to update agent status.");
        }

        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: `AGENT_STATUS_${normalizedStatus}`,
            targetId: agentId, // Now strictly a string
            details: `Admin changed agent status to ${normalizedStatus} for agent ${targetAgent.agentCode}. Reason: ${resolvedReason}`,
            ipAddress: req.ip || null,
          });
        }

        return updated;
      });

      if (!updatedAgent) {
        return res
          .status(404)
          .json({ error: "Agent not found or update failed." });
      }

      const sanitizedResponse = {
        id: updatedAgent.id,
        agentCode: updatedAgent.agentCode,
        fullName: updatedAgent.fullName,
        status: updatedAgent.status,
        floatBalanceMinor: updatedAgent.floatBalanceMinor,
        updatedAt: updatedAgent.createdAt,
      };

      return res.status(200).json({
        message: `Agent status successfully updated to ${normalizedStatus}.`,
        data: sanitizedResponse,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Agent Status Update Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while updating agent status." });
    }
  }
  /**
   * POST /api/v1/admin/agents/float-adjust
   * Admin override to credit or debit an agent's float liquidity with mandatory audit logging.
   */
  static async adjustFloat(req: Request, res: Response) {
    try {
      const { agentId, amountMinor, actionType, reason } = req.body;
      const currentAdminId = req.user?.userId;

      if (!agentId || amountMinor === undefined || !actionType || !reason) {
        return res.status(400).json({
          error:
            "Agent ID, amountMinor, actionType (CREDIT/DEBIT), and a reason are required.",
        });
      }

      const normalizedAction = actionType.toUpperCase();
      if (!["CREDIT", "DEBIT"].includes(normalizedAction)) {
        return res.status(400).json({
          error: "Invalid actionType. Must be either CREDIT or DEBIT.",
        });
      }

      const adjustmentAmount = BigInt(amountMinor);
      if (adjustmentAmount <= 0n) {
        return res.status(400).json({
          error:
            "Float adjustment amount minor units must be greater than zero.",
        });
      }

      // 1. Verify target agent exists
      const [targetAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      if (!targetAgent) {
        return res.status(404).json({ error: "Agent not found." });
      }

      // 🚨 NEW CHECK: Prevent float adjustments on inactive/suspended/locked agents
      if (targetAgent.status !== "ACTIVE") {
        return res.status(403).json({
          error: `Cannot adjust float. Agent account is currently ${targetAgent.status}.`,
        });
      }

      // 2. Automatic Idempotency Check: Prevent double-submits within 30 seconds
      const thirtySecondsAgo = new Date(Date.now() - 60000);
      const sspAmount = Number(adjustmentAmount) / 100;
      const expectedDetailsKeyword = `${normalizedAction} ${sspAmount} SSP`;

      const [recentDuplicate] = await db
        .select()
        .from(adminAuditLogs)
        .where(
          and(
            eq(adminAuditLogs.targetId, agentId),
            eq(adminAuditLogs.action, `FLOAT_${normalizedAction}`),
            gte(adminAuditLogs.createdAt, thirtySecondsAgo),
            sql`details LIKE ${`%${expectedDetailsKeyword}%`}`,
          ),
        )
        .limit(1);

      if (recentDuplicate) {
        return res.status(409).json({
          error:
            "Duplicate request detected. This float adjustment was already processed within the last 30 seconds.",
        });
      }

      // Calculate new float balance
      const currentFloat = BigInt(targetAgent.floatBalanceMinor);
      let newFloat: bigint;

      if (normalizedAction === "CREDIT") {
        newFloat = currentFloat + adjustmentAmount;
      } else {
        if (currentFloat < adjustmentAmount) {
          return res.status(400).json({
            error:
              "Insufficient agent float balance for this debit adjustment.",
          });
        }
        newFloat = currentFloat - adjustmentAmount;
      }

      // 2. Execute float update and audit log atomically in a transaction
      const updatedAgent = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(agents)
          .set({ floatBalanceMinor: newFloat })
          .where(eq(agents.id, agentId))
          .returning();

        if (currentAdminId) {
          const sspAmount = Number(adjustmentAmount) / 100;
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: `FLOAT_${normalizedAction}`,
            targetId: agentId,
            details: `Admin adjusted float for agent ${agentId}: ${normalizedAction} ${sspAmount} SSP. Reason: ${reason}`,
            ipAddress: req.ip || null,
          });
        }

        return updated;
      });

      if (!updatedAgent) {
        return res
          .status(404)
          .json({ error: "Agent not found or update failed." });
      }
      const sanitizedResponse = {
        id: updatedAgent.id,
        agentCode: updatedAgent.agentCode,
        fullName: updatedAgent.fullName,
        floatBalanceMinor: updatedAgent.floatBalanceMinor,
        status: updatedAgent.status,
        updatedAt: updatedAgent.createdAt, // or your updated timestamp if you have one
      };

      return res.status(200).json({
        message: `Agent float successfully ${normalizedAction.toLowerCase()}ed.`,
        data: sanitizedResponse,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Float Adjustment Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while adjusting agent float." });
    }
  }
}
