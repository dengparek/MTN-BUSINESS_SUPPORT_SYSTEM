import type { Request, Response } from "express";
import { db } from "../../config/db.js";
import {
  simCards,
  simAssignments,
  subscribers,
  agents,
  adminAuditLogs,
  msisdns,
} from "../../database/schema.js";
import { eq, and, sql, desc, or, ilike } from "drizzle-orm";

export class AdminSimController {
  /**
   * POST /api/v1/admin/sims
   * Register new physical SIM card(s) into inventory.
   */
  static async createSimCard(req: Request, res: Response) {
    try {
      const { iccid, imsi } = req.body;
      const adminUser = req.user;
      const currentAdminId = adminUser ? adminUser.userId : undefined;

      if (!iccid || !imsi) {
        return res.status(400).json({ error: "ICCID and IMSI are required." });
      }

      // Check if ICCID or IMSI already exists
      const [existingSim] = await db
        .select()
        .from(simCards)
        .where(or(eq(simCards.iccid, iccid), eq(simCards.imsi, imsi)))
        .limit(1);

      if (existingSim) {
        return res.status(409).json({
          error: "A SIM card with this ICCID or IMSI already exists.",
        });
      }

      // Insert new SIM and record audit log atomically
      const newSim = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(simCards)
          .values({
            iccid,
            imsi,
            status: "INACTIVE", // New inventory starts inactive until assigned
          })
          .returning();
        if (!inserted) {
          throw new Error("Failed to insert SIM card into inventory.");
        }

        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: "CREATE_SIM",
            targetId: inserted.id,
            details: `Added new physical SIM ICCID: ${iccid}`,
            ipAddress: req.ip || null,
          });
        }

        return inserted;
      });

      return res.status(201).json({
        message: "SIM card added to inventory successfully.",
        data: newSim,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Create SIM Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while creating SIM." });
    }
  }

  /**
   * PATCH /api/v1/admin/sims/:id/status
   * Update a SIM card's lifecycle status (ACTIVE, INACTIVE, BLOCKED).
   */
  static async updateSimStatus(req: Request, res: Response) {
    try {
      const rawId = req.params.id;
      const simId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
      const { status, reason } = req.body;
      const currentAdminId = req.user?.userId;

      if (!simId) {
        return res.status(400).json({ error: "SIM ID is required." });
      }

      const normalizedStatus = status.toUpperCase() as
        | "INACTIVE"
        | "ACTIVE"
        | "BLOCKED";

      if (!["INACTIVE", "ACTIVE", "BLOCKED"].includes(normalizedStatus)) {
        return res.status(400).json({
          error: "Invalid status. Must be one of: INACTIVE, ACTIVE, BLOCKED.",
        });
      }

      if (normalizedStatus === "BLOCKED" && !reason) {
        return res
          .status(400)
          .json({ error: "A reason is required when blocking a SIM card." });
      }

      // Verify SIM exists
      const [targetSim] = await db
        .select()
        .from(simCards)
        .where(eq(simCards.id, simId))
        .limit(1);

      if (!targetSim) {
        return res.status(404).json({ error: "SIM card not found." });
      }

      // Execute status update and audit log
      const updatedSim = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(simCards)
          .set({ status: normalizedStatus })
          .where(eq(simCards.id, simId))
          .returning();

        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: `SIM_STATUS_${normalizedStatus}`,
            targetId: simId,
            details: `Changed SIM ICCID ${targetSim.iccid} status to ${normalizedStatus}${
              reason ? `. Reason: ${reason}` : ""
            }`,
            ipAddress: req.ip || null,
          });
        }

        return updated;
      });

      return res.status(200).json({
        message: `SIM card status successfully updated to ${normalizedStatus}.`,
        data: updatedSim,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Update SIM Status Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while updating SIM status." });
    }
  }

  /**
   * GET /api/v1/admin/sims/:id
   * Fetch a single SIM card's details, phone number (MSISDN), and active assignment.
   */
  static async getSimById(req: Request, res: Response) {
    try {
      const rawId = req.params.id;
      const simId = Array.isArray(rawId) ? rawId[0] : (rawId as string);

      if (!simId) {
        return res.status(400).json({ error: "SIM ID is required." });
      }

      // 1. Fetch SIM card
      const [simCard] = await db
        .select()
        .from(simCards)
        .where(eq(simCards.id, simId))
        .limit(1);

      if (!simCard) {
        return res.status(404).json({ error: "SIM card not found." });
      }

      // 2. Fetch associated MSISDN (phone number) and active assignment concurrently
      const [msisdnRecord, activeAssignment] = await Promise.all([
        db.select().from(msisdns).where(eq(msisdns.simId, simId)).limit(1),
        db
          .select()
          .from(simAssignments)
          .where(
            and(
              eq(simAssignments.simId, simId),
              sql`${simAssignments.endedAt} is null`,
            ),
          )
          .limit(1),
      ]);

      return res.status(200).json({
        message: "SIM card details retrieved successfully.",
        data: {
          simCard,
          msisdn: msisdnRecord[0] || null,
          activeAssignment: activeAssignment[0] || null,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get SIM By ID Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Failed to fetch SIM card details." });
    }
  }

  /**
   * GET /api/v1/admin/sims
   * List SIM cards with optional status filter, search query (ICCID/IMSI), and pagination.
   */
  static async getSimCards(req: Request, res: Response) {
    try {
      const { status, search, page = "1", limit = "20" } = req.query;

      const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 20),
      );
      const offset = (pageNumber - 1) * pageSize;

      // Normalize query parameters with exact enum typing
      const statusFilter =
        typeof status === "string"
          ? (status.toUpperCase() as "INACTIVE" | "ACTIVE" | "BLOCKED")
          : undefined;
      const searchStr = typeof search === "string" ? search.trim() : "";

      const conditions = [];

      if (statusFilter) {
        conditions.push(eq(simCards.status, statusFilter));
      }

      if (searchStr) {
        conditions.push(
          or(
            ilike(simCards.iccid, `%${searchStr}%`),
            ilike(simCards.imsi, `%${searchStr}%`),
          ),
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Fetch paginated SIM cards and total count concurrently
      const [simList, countResult] = await Promise.all([
        db
          .select({
            id: simCards.id,
            iccid: simCards.iccid,
            imsi: simCards.imsi,
            status: simCards.status,
            createdAt: simCards.createdAt,
          })
          .from(simCards)
          .where(whereClause)
          .orderBy(desc(simCards.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(simCards)
          .where(whereClause),
      ]);

      const totalCount = countResult[0]?.count ?? 0;

      return res.status(200).json({
        message: "SIM inventory retrieved successfully.",
        data: {
          sims: simList,
          pagination: {
            total: Number(totalCount),
            page: pageNumber,
            limit: pageSize,
            totalPages: Math.ceil(Number(totalCount) / pageSize),
          },
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get SIMs Error:", errorMessage);
      return res.status(500).json({ error: "Failed to fetch SIM inventory." });
    }
  }

  /**
   * POST /api/v1/admin/sims/assign
   * Assign an unassigned physical SIM card to a subscriber or an agent atomically with audit logging.
   */
  static async assignSim(req: Request, res: Response) {
    try {
      const { simId, subscriberId, agentId } = req.body;
      const currentAdminId = req.user?.userId;

      if (!simId) {
        return res.status(400).json({ error: "SIM ID is required." });
      }

      // Exactly one owner check (Subscriber OR Agent)
      const hasSubscriber = Boolean(subscriberId);
      const hasAgent = Boolean(agentId);

      if ((hasSubscriber && hasAgent) || (!hasSubscriber && !hasAgent)) {
        return res.status(400).json({
          error:
            "A SIM card must be assigned to either a subscriber or an agent, but not both.",
        });
      }

      // 1. Verify SIM card exists and is active/inactive (not blocked)
      const [targetSim] = await db
        .select()
        .from(simCards)
        .where(eq(simCards.id, simId))
        .limit(1);

      if (!targetSim) {
        return res.status(404).json({ error: "SIM card not found." });
      }

      if (targetSim.status === "BLOCKED") {
        return res
          .status(400)
          .json({ error: "Cannot assign a blocked SIM card." });
      }

      // 2. Check if SIM already has an active assignment (endedAt IS NULL)
      const [activeAssignment] = await db
        .select()
        .from(simAssignments)
        .where(
          and(
            eq(simAssignments.simId, simId),
            sql`${simAssignments.endedAt} is null`,
          ),
        )
        .limit(1);

      if (activeAssignment) {
        return res.status(409).json({
          error: "This SIM card is already assigned to an active owner.",
        });
      }

      // 3. Verify recipient exists (Subscriber or Agent)
      if (hasSubscriber) {
        const [subscriber] = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, subscriberId))
          .limit(1);
        if (!subscriber) {
          return res
            .status(404)
            .json({ error: "Target subscriber not found." });
        }
      }

      if (hasAgent) {
        const [agent] = await db
          .select()
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);
        if (!agent) {
          return res.status(404).json({ error: "Target agent not found." });
        }
      }

      // 4. Execute assignment and audit log inside a database transaction (Atomicity)
      const assignmentResult = await db.transaction(async (tx) => {
        // Create the new assignment record
        const [newAssignment] = await tx
          .insert(simAssignments)
          .values({
            simId,
            subscriberId: subscriberId || null,
            agentId: agentId || null,
          })
          .returning();

        // Update SIM status to ACTIVE if it was INACTIVE
        if (targetSim.status === "INACTIVE") {
          await tx
            .update(simCards)
            .set({ status: "ACTIVE" })
            .where(eq(simCards.id, simId));
        }

        // Record administrative action in audit logs
        if (currentAdminId) {
          await tx.insert(adminAuditLogs).values({
            adminUserId: currentAdminId,
            action: "ASSIGN_SIM",
            targetId: simId,
            details: `Assigned SIM ICCID ${targetSim.iccid} to ${hasSubscriber ? `Subscriber ${subscriberId}` : `Agent ${agentId}`}`,
            ipAddress: req.ip || null,
          });
        }

        return newAssignment;
      });

      return res.status(201).json({
        message: "SIM card successfully assigned.",
        data: assignmentResult,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Assign SIM Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Internal server error while assigning SIM." });
    }
  }
}
