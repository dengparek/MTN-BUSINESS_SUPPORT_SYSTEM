import { Request, Response } from "express";
import { db } from "../../config/db";
import {
  agents,
  subscribers,
  simCards,
  simAssignments,
  orders,
  chargingAccounts,
} from "../../database/schema";
import { sql, eq, and, gte, lt } from "drizzle-orm";

export class AdminDashboardController {
  static async getOverviewMetrics(req: Request, res: Response) {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const LOW_FLOAT_THRESHOLD = 10000n; // bigint representation

      const [
        agentStats,
        lowFloatAgents,
        subscriberStats,
        kycStats,
        simStats,
        orderStats,
        chargingStats,
      ] = await Promise.all([
        // 1. Agent Stats & Total Float
        db
          .select({
            total: sql<number>`count(*)`,
            active: sql<number>`count(*) filter (where ${agents.status} = 'ACTIVE')`,
            suspended: sql<number>`count(*) filter (where ${agents.status} = 'SUSPENDED')`,
            totalFloat: sql<string>`coalesce(sum(${agents.floatBalanceMinor}), 0)`,
          })
          .from(agents),

        // 2. Low Float Risk Agents
        db
          .select({ count: sql<number>`count(*)` })
          .from(agents)
          .where(
            and(
              eq(agents.status, "ACTIVE"),
              lt(agents.floatBalanceMinor, LOW_FLOAT_THRESHOLD),
            ),
          ),

        // 3. Subscriber Status
        db
          .select({
            total: sql<number>`count(*)`,
            active: sql<number>`count(*) filter (where ${subscribers.status} = 'ACTIVE')`,
            suspended: sql<number>`count(*) filter (where ${subscribers.status} = 'SUSPENDED')`,
            blocked: sql<number>`count(*) filter (where ${subscribers.status} = 'BLOCKED')`,
          })
          .from(subscribers),

        // 4. KYC Status Breakdown
        db
          .select({
            pending: sql<number>`count(*) filter (where ${subscribers.kycStatus} = 'PENDING')`,
            verified: sql<number>`count(*) filter (where ${subscribers.kycStatus} = 'VERIFIED')`,
            rejected: sql<number>`count(*) filter (where ${subscribers.kycStatus} = 'REJECTED')`,
          })
          .from(subscribers),

        // 5. SIM Inventory & Current Assignments (ended_at IS NULL)
        db
          .select({
            totalSims: sql<number>`count(distinct ${simCards.id})`,
            activeSims: sql<number>`count(distinct ${simCards.id}) filter (where ${simCards.status} = 'ACTIVE')`,
            assignedSims: sql<number>`count(distinct ${simAssignments.simId}) filter (where ${simAssignments.endedAt} is null)`,
          })
          .from(simCards)
          .leftJoin(simAssignments, eq(simCards.id, simAssignments.simId)),

        // 6. Today's Orders & Revenue Volume
        db
          .select({
            totalOrdersToday: sql<number>`count(*) filter (where ${orders.createdAt} >= ${startOfToday})`,
            completedToday: sql<number>`count(*) filter (where ${orders.createdAt} >= ${startOfToday} and ${orders.status} = 'COMPLETED')`,
            revenueToday: sql<string>`coalesce(sum(${orders.amountMinor}) filter (where ${orders.createdAt} >= ${startOfToday} and ${orders.status} = 'COMPLETED'), 0)`,
          })
          .from(orders),

        // 7. Subscriber Wallet Liability
        db
          .select({
            totalWalletBalance: sql<string>`coalesce(sum(${chargingAccounts.balanceMinor}), 0)`,
          })
          .from(chargingAccounts),
      ]);

      const totalSims = Number(simStats[0]?.totalSims || 0);
      const assignedSims = Number(simStats[0]?.assignedSims || 0);

      const metrics = {
        subscribers: {
          total: Number(subscriberStats[0]?.total || 0),
          active: Number(subscriberStats[0]?.active || 0),
          suspended: Number(subscriberStats[0]?.suspended || 0),
          blocked: Number(subscriberStats[0]?.blocked || 0),
          kyc: {
            pending: Number(kycStats[0]?.pending || 0),
            verified: Number(kycStats[0]?.verified || 0),
            rejected: Number(kycStats[0]?.rejected || 0),
          },
          totalWalletLiabilityMinor:
            chargingStats[0]?.totalWalletBalance || "0",
        },
        simCards: {
          total: totalSims,
          active: Number(simStats[0]?.activeSims || 0),
          assigned: assignedSims,
          unassignedStock: Math.max(0, totalSims - assignedSims),
        },
        agents: {
          total: Number(agentStats[0]?.total || 0),
          active: Number(agentStats[0]?.active || 0),
          suspended: Number(agentStats[0]?.suspended || 0),
          lowFloatWarningCount: Number(lowFloatAgents[0]?.count || 0),
          totalFloatBalanceMinor: agentStats[0]?.totalFloat || "0",
        },
        ordersToday: {
          totalCount: Number(orderStats[0]?.totalOrdersToday || 0),
          completedCount: Number(orderStats[0]?.completedToday || 0),
          revenueMinor: orderStats[0]?.revenueToday || "0",
        },
      };

      return res.status(200).json({
        message: "Admin dashboard metrics fetched successfully.",
        data: metrics,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Dashboard Metrics Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Failed to fetch dashboard metrics." });
    }
  }
}
