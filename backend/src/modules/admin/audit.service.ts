import { db } from "../../config/db.js";
import {
  adminAuditLogs,
  users,
  agents,
  orders,
} from "../../database/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";

export class AuditService {
  /**
   * Fetch paginated admin audit logs with optional filters
   */
  static async getAuditLogs(query: {
    adminId?: string;
    action?: string;
    page: number;
    limit: number;
  }) {
    const offset = (query.page - 1) * query.limit;
    const conditions = [];

    if (query.adminId) {
      conditions.push(eq(adminAuditLogs.adminUserId, query.adminId));
    }

    if (query.action) {
      conditions.push(eq(adminAuditLogs.action, query.action.toUpperCase()));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, [{ count } = { count: 0 }]] = await Promise.all([
      db
        .select({
          id: adminAuditLogs.id,
          action: adminAuditLogs.action,
          targetId: adminAuditLogs.targetId,
          details: adminAuditLogs.details,
          ipAddress: adminAuditLogs.ipAddress,
          createdAt: adminAuditLogs.createdAt,
          admin: {
            id: users.id,
            phoneNumber: users.phoneNumber,
            email: users.email,
          },
        })
        .from(adminAuditLogs)
        .innerJoin(users, eq(adminAuditLogs.adminUserId, users.id))
        .where(whereClause)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(adminAuditLogs)
        .where(whereClause),
    ]);

    return {
      logs,
      total: Number(count),
    };
  }

  /**
   * Generate double-entry financial ledger reconciliation summary
   */
  static async getLedgerSummary() {
    // 1. Calculate total float liability across active agents
    const [agentFloatSummary] = await db
      .select({
        totalFloatMinor: sql<string>`coalesce(sum(${agents.floatBalanceMinor}), 0)`,
        activeAgentCount: sql<number>`count(*)`,
      })
      .from(agents)
      .where(eq(agents.status, "ACTIVE"));

    // 2. Calculate completed order volume and count from orders table
    const [orderSummary] = await db
      .select({
        totalVolumeMinor: sql<string>`coalesce(sum(${orders.amountMinor}), 0)`,
        totalOrders: sql<number>`count(*)`,
      })
      .from(orders)
      .where(eq(orders.status, "COMPLETED"));

    const totalFloatMinor = BigInt(agentFloatSummary?.totalFloatMinor ?? "0");
    const totalVolumeMinor = BigInt(orderSummary?.totalVolumeMinor ?? "0");

    return {
      liabilities: {
        totalAgentFloatMinor: totalFloatMinor.toString(),
        totalAgentFloatSSP: Number(totalFloatMinor) / 100,
        activeAgentsCount: Number(agentFloatSummary?.activeAgentCount ?? 0),
      },
      systemFlows: {
        totalTransactionVolumeMinor: totalVolumeMinor.toString(),
        totalTransactionVolumeSSP: Number(totalVolumeMinor) / 100,
        totalTransactionCount: Number(orderSummary?.totalOrders ?? 0),
      },
      reconciledAt: new Date().toISOString(),
    };
  }
}
