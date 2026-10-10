import bcrypt from "bcryptjs";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../config/db.js";
import {
  users,
  agents,
  subscribers,
  simCards,
  simAssignments,
  msisdns,
  chargingAccounts,
  orders,
  accountLedgerEntries,
} from "../../database/schema.js";
import { normalizePhoneNumber } from "../../helpers/utils.js";
import { AgentServiceError } from "./AgentServiceError.js";
import {
  LOCKOUT_DURATION_SECONDS,
  MAX_FAILED_ATTEMPTS,
} from "../../constants/consts.js";
import { redisClient } from "../../config/redis.js";

function assertValidPin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new AgentServiceError(
      "INVALID_PIN_FORMAT",
      "PIN must contain exactly four digits.",
    );
  }
}

export class AgentService {
  private static async getSalesForPeriod(agentId: string, startDate: Date) {
    const completedOrders = await db
      .select({
        amountMinor: orders.amountMinor,
      })
      .from(orders)
      .where(
        and(
          eq(orders.agentId, agentId),
          eq(orders.status, "COMPLETED"),
          gte(orders.createdAt, startDate),
        ),
      );

    const totalSalesMinor = completedOrders.reduce(
      (acc, order) => acc + order.amountMinor,
      0n,
    );

    return {
      totalSalesMinor,
      transactionCount: completedOrders.length,
    };
  }

  static async getSalesToday(agentId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.getSalesForPeriod(agentId, start);
  }

  static async getSalesThisWeek(agentId: string) {
    const start = new Date();
    const day = start.getDay();
    // Adjust to start of the week (Monday or Sunday, e.g., Sunday start:)
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return this.getSalesForPeriod(agentId, start);
  }

  static async getSalesThisMonth(agentId: string) {
    const start = new Date();
    start.setDate(1); // 1st day of current month
    start.setHours(0, 0, 0, 0);
    return this.getSalesForPeriod(agentId, start);
  }

  /**
   * Resolve an active agent through their current SIM assignment.
   */
  static async getAgentByPhone(phoneNumber: string) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    inArray(users.role, ["AGENT", "ADMIN"]);
    const [result] = await db
      .select({
        agent: agents,
        user: users,
      })
      .from(msisdns)
      .innerJoin(simCards, eq(msisdns.simId, simCards.id))
      .innerJoin(
        simAssignments,
        and(
          eq(simAssignments.simId, simCards.id),
          isNull(simAssignments.endedAt),
        ),
      )
      .innerJoin(agents, eq(simAssignments.agentId, agents.id))
      .innerJoin(users, eq(agents.userId, users.id))
      .where(
        and(
          eq(msisdns.phoneNumber, normalizedPhone),
          eq(simCards.status, "ACTIVE"),
          eq(users.role, "AGENT"),
          eq(users.role, "AGENT"),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  /**
   * Verify a four-digit PIN against its stored bcrypt hash.
   *
   * The caller must enforce rate limits and cooldowns.
   */

  static async verifyPin(agentId: string, inputPin: string): Promise<boolean> {
    if (!/^\d{4}$/.test(inputPin)) {
      return false;
    }

    const [agent] = await db
      .select({
        pinHash: agents.pinHash,
        agentStatus: agents.status,
        userStatus: users.status,
        userRole: users.role,
      })
      .from(agents)
      .innerJoin(users, eq(agents.userId, users.id))
      .where(eq(agents.id, agentId))
      .limit(1);

    if (
      !agent ||
      agent.agentStatus !== "ACTIVE" ||
      agent.userStatus !== "ACTIVE" ||
      agent.userRole !== "AGENT"
    ) {
      return false;
    }

    return bcrypt.compare(inputPin, agent.pinHash);
  }

  /**
   * Sell airtime to a subscriber.
   * amountMinor must be a positive integer amount in the system's
   * agreed minor currency unit.
   * idempotencyKey must remain identical when retrying the same sale.
   */
  static async sellAirtime(
    agentId: string,
    subscriberPhone: string,
    amountMinor: bigint,
    idempotencyKey: string,
  ) {
    const normalizedPhone = normalizePhoneNumber(subscriberPhone);

    if (amountMinor <= 0n) {
      throw new AgentServiceError(
        "INVALID_AMOUNT",
        "Airtime amount must be greater than zero.",
      );
    }

    if (!idempotencyKey.trim() || idempotencyKey.length > 128) {
      throw new AgentServiceError(
        "INVALID_IDEMPOTENCY_KEY",
        "A valid idempotency key is required.",
      );
    }

    if (!normalizedPhone) {
      throw new AgentServiceError(
        "INVALID_PHONE",
        "A valid subscriber phone number is required.",
      );
    }

    // The same key cannot be reused for a different sale.
    const requestFingerprint = `${agentId}:${normalizedPhone}:${amountMinor.toString()}`;

    return db.transaction(async (tx) => {
      // 1. Return the previous result if this request was already processed.
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingOrder) {
        if (existingOrder.requestFingerprint !== requestFingerprint) {
          throw new AgentServiceError(
            "IDEMPOTENCY_KEY_REUSED",
            "A request of this kind has already been processed",
          );
        }

        if (existingOrder.status !== "COMPLETED") {
          throw new AgentServiceError(
            "ORDER_NOT_COMPLETED",
            "The previous order has not completed.",
          );
        }

        return {
          orderId: existingOrder.id,
          status: existingOrder.status,
          idempotentReplay: true,
        };
      }

      // 2. Verify the agent and associated user are active.
      const [agent] = await tx
        .select({
          id: agents.id,
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(
          and(
            eq(agents.id, agentId),
            eq(agents.status, "ACTIVE"),
            eq(users.status, "ACTIVE"),
            eq(users.role, "AGENT"),
          ),
        )
        .limit(1);

      if (!agent) {
        throw new AgentServiceError(
          "AGENT_INACTIVE",
          "Agent not found or not authorized.",
        );
      }

      // 3. Resolve an active subscriber through the current SIM assignment.
      const [target] = await tx
        .select({
          subscriberId: subscribers.id,
        })
        .from(msisdns)
        .innerJoin(simCards, eq(msisdns.simId, simCards.id))
        .innerJoin(
          simAssignments,
          and(
            eq(simAssignments.simId, simCards.id),
            isNull(simAssignments.endedAt),
          ),
        )
        .innerJoin(subscribers, eq(simAssignments.subscriberId, subscribers.id))
        .innerJoin(users, eq(subscribers.userId, users.id))
        .where(
          and(
            eq(msisdns.phoneNumber, normalizedPhone),
            eq(simCards.status, "ACTIVE"),
            eq(subscribers.status, "ACTIVE"),
            eq(users.status, "ACTIVE"),
            eq(users.role, "SUBSCRIBER"),
          ),
        )
        .limit(1);

      if (!target) {
        throw new AgentServiceError(
          "SUBSCRIBER_NOT_FOUND",
          "No active subscriber is assigned to that phone number.",
        );
      }

      // 4. Claim the idempotency key before moving any balances.
      // A concurrent request with the same key cannot create a second order.
      const [order] = await tx
        .insert(orders)
        .values({
          subscriberId: target.subscriberId,
          agentId,
          type: "AIRTIME_TOPUP",
          amountMinor,
          idempotencyKey,
          requestFingerprint,
          status: "PENDING",
        })
        .onConflictDoNothing({
          target: orders.idempotencyKey,
        })
        .returning();

      if (!order) {
        // A concurrent request may have committed this key while we waited.
        const [concurrentOrder] = await tx
          .select()
          .from(orders)
          .where(eq(orders.idempotencyKey, idempotencyKey))
          .limit(1);

        if (
          !concurrentOrder ||
          concurrentOrder.requestFingerprint !== requestFingerprint
        ) {
          throw new AgentServiceError(
            "IDEMPOTENCY_CONFLICT",
            "Unable to safely resolve the repeated request.",
          );
        }

        if (concurrentOrder.status !== "COMPLETED") {
          throw new AgentServiceError(
            "ORDER_NOT_COMPLETED",
            "The previous order has not completed.",
          );
        }

        return {
          orderId: concurrentOrder.id,
          status: concurrentOrder.status,
          idempotentReplay: true,
        };
      }

      // 5. Atomically deduct agent float only if sufficient funds remain.
      // This conditional UPDATE prevents concurrent overdrafts.
      const [updatedAgent] = await tx
        .update(agents)
        .set({
          floatBalanceMinor: sql`
            ${agents.floatBalanceMinor} - ${amountMinor}
          `,
        })
        .where(
          and(
            eq(agents.id, agentId),
            eq(agents.status, "ACTIVE"),
            gte(agents.floatBalanceMinor, amountMinor),
          ),
        )
        .returning({
          balance: agents.floatBalanceMinor,
        });

      if (!updatedAgent) {
        throw new AgentServiceError(
          "INSUFFICIENT_FLOAT",
          "Insufficient float or agent is no longer active.",
        );
      }

      // 6. Credit the subscriber's airtime account.
      // A missing account aborts and rolls back the agent deduction.
      const [updatedAccount] = await tx
        .update(chargingAccounts)
        .set({
          balanceMinor: sql`
            ${chargingAccounts.balanceMinor} + ${amountMinor}
          `,
          version: sql`${chargingAccounts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(chargingAccounts.subscriberId, target.subscriberId))
        .returning({
          balance: chargingAccounts.balanceMinor,
        });

      if (!updatedAccount) {
        throw new AgentServiceError(
          "CHARGING_ACCOUNT_NOT_FOUND",
          "Subscriber charging account does not exist.",
        );
      }

      // 7. Record both sides of the transfer in the audit ledger.
      await tx.insert(accountLedgerEntries).values([
        {
          orderId: order.id,
          agentId,
          subscriberId: null,
          direction: "DEBIT",
          amountMinor,
          currency: "SSP",
          entryKey: `${idempotencyKey}:AGENT_DEBIT`,
        },
        {
          orderId: order.id,
          agentId: null,
          subscriberId: target.subscriberId,
          direction: "CREDIT",
          amountMinor,
          currency: "SSP",
          entryKey: `${idempotencyKey}:SUBSCRIBER_CREDIT`,
        },
      ]);

      // 8. Complete the order in the same transaction.
      const [completedOrder] = await tx
        .update(orders)
        .set({
          status: "COMPLETED",
        })
        .where(eq(orders.id, order.id))
        .returning({
          id: orders.id,
          status: orders.status,
        });

      if (!completedOrder) {
        throw new AgentServiceError(
          "ORDER_COMPLETION_FAILED",
          "Unable to complete the airtime order.",
        );
      }

      return {
        orderId: completedOrder.id,
        status: completedOrder.status,
        idempotentReplay: false,
        newFloatMinor: updatedAgent.balance.toString(),
        newSubscriberBalanceMinor: updatedAccount.balance.toString(),
      };
    });
  }

  static async verifyPinWithLockout(
    agentId: string,
    inputPin: string,
  ): Promise<{ success: boolean; message?: string }> {
    const lockoutKey = `agent:lockout:${agentId}`;

    // 1. Check if agent is currently locked out
    const isLocked = await redisClient.get(lockoutKey);
    if (isLocked) {
      return {
        success: false,
        message:
          "Account temporarily locked due to multiple incorrect PIN attempts. Please try again later or contact support.",
      };
    }

    // 2. Fetch agent record to verify pinHash
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId));
    if (!agent || agent.status !== "ACTIVE") {
      return {
        success: false,
        message: "Agent account is inactive or blocked.",
      };
    }

    const isMatch = await bcrypt.compare(inputPin, agent.pinHash);

    if (isMatch) {
      // Clear any failed attempt counters on successful PIN entry
      await redisClient.del(lockoutKey);
      return { success: true };
    }

    // 3. Handle Failed Attempt
    const attemptsKey = `agent:failed_pins:${agentId}`;
    const failedCount = await redisClient.incr(attemptsKey);

    if (failedCount === 1) {
      // Set a TTL on the failure counter so occasional typos reset after 10 minutes
      await redisClient.expire(attemptsKey, 600);
    }

    // 4. Trigger Lockout if threshold reached
    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      // Lock in Redis
      await redisClient.setEx(lockoutKey, LOCKOUT_DURATION_SECONDS, "LOCKED");
      await redisClient.del(attemptsKey); // Clear counter

      // Optionally update status in database to SUSPENDED
      await db
        .update(agents)
        .set({ status: "SUSPENDED" })
        .where(eq(agents.id, agentId));

      return {
        success: false,
        message:
          "Maximum incorrect PIN attempts reached. Your account has been temporarily locked for 15 minutes.",
      };
    }

    const remaining = MAX_FAILED_ATTEMPTS - failedCount;
    return {
      success: false,
      message: `Invalid Agent PIN. (${remaining}) attempt(s) remaining.`,
    };
  }
}
