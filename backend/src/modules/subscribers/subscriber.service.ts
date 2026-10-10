import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../config/db.js";
import {
  users,
  subscribers,
  simCards,
  simAssignments,
  msisdns,
  chargingAccounts,
  products,
  productInstances,
  orders,
  accountLedgerEntries,
} from "../../database/schema.js";
import { normalizePhoneNumber } from "../../helpers/utils.js";
import { validCategories, validUnits } from "../../constants/consts.js";

export class SubscriberServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SubscriberServiceError";
  }
}

export class SubscriberService {
  /**
   * Resolve an active subscriber through their current SIM assignment.
   */
  static async getSubscriberByPhone(phoneNumber: string) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const [result] = await db
      .select({
        subscriber: subscribers,
        user: users,
        account: chargingAccounts,
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
      .leftJoin(
        chargingAccounts,
        eq(chargingAccounts.subscriberId, subscribers.id),
      )
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

    return result ?? null;
  }

  /**
   * Fetch subscriber account balance and active bundle balances.
   */
  static async getSubscriberBalances(subscriberId: string) {
    const [account] = await db
      .select()
      .from(chargingAccounts)
      .where(eq(chargingAccounts.subscriberId, subscriberId))
      .limit(1);

    const activeBundles = await db
      .select({
        instance: productInstances,
        product: products,
      })
      .from(productInstances)
      .innerJoin(products, eq(productInstances.productId, products.id))
      .where(
        and(
          eq(productInstances.subscriberId, subscriberId),
          eq(productInstances.status, "ACTIVE"),
          gte(productInstances.expiresAt, new Date()),
          gte(productInstances.remainingQuantity, 0n),
        ),
      );

    return {
      airtimeBalanceMinor: account ? account.balanceMinor : 0n,
      activeBundles,
    };
  }

  /**
   * Fetch active catalog products by category (DATA, VOICE, SMS).
   */
  static async getProductsByCategory(category: "DATA" | "VOICE" | "SMS") {
    return db
      .select()
      .from(products)
      .where(
        and(eq(products.category, category), eq(products.status, "ACTIVE")),
      );
  }

  /**
   * Convert subscriber airtime balance to a Data, Voice, or SMS bundle.
   */
  static async purchaseBundle(
    subscriberId: string,
    productId: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey.trim() || idempotencyKey.length > 128) {
      throw new SubscriberServiceError(
        "INVALID_IDEMPOTENCY_KEY",
        "A valid idempotency key is required.",
      );
    }

    const requestFingerprint = `${subscriberId}:${productId}`;

    return db.transaction(async (tx) => {
      // 1. Replay handling for existing orders
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingOrder) {
        if (existingOrder.requestFingerprint !== requestFingerprint) {
          throw new SubscriberServiceError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key belongs to a different request.",
          );
        }

        if (existingOrder.status === "PENDING") {
          throw new SubscriberServiceError(
            "ORDER_PENDING",
            "A previous request with this key is still processing.",
          );
        }

        if (existingOrder.status === "FAILED") {
          throw new SubscriberServiceError(
            "ORDER_FAILED",
            "The previous order with this key failed.",
          );
        }

        // Return completed order result for idempotent replay
        const [account] = await tx
          .select()
          .from(chargingAccounts)
          .where(eq(chargingAccounts.subscriberId, subscriberId))
          .limit(1);

        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        return {
          orderId: existingOrder.id,
          productName: product ? product.name : "Subscribed Bundle",
          remainingAirtimeMinor: account ? account.balanceMinor : 0n,
          idempotentReplay: true,
        };
      }

      // 2. Validate Subscriber and User status inside transaction
      const [activeSubscriber] = await tx
        .select({ id: subscribers.id })
        .from(subscribers)
        .innerJoin(users, eq(subscribers.userId, users.id))
        .where(
          and(
            eq(subscribers.id, subscriberId),
            eq(subscribers.status, "ACTIVE"),
            eq(users.status, "ACTIVE"),
            eq(users.role, "SUBSCRIBER"),
          ),
        )
        .limit(1);

      if (!activeSubscriber) {
        throw new SubscriberServiceError(
          "SUBSCRIBER_NOT_ACTIVE",
          "Subscriber account is inactive or not found.",
        );
      }

      // 3. Fetch & snapshot product details, protecting price and status
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.status, "ACTIVE")))
        .limit(1);

      if (!product) {
        throw new SubscriberServiceError(
          "PRODUCT_NOT_FOUND",
          "Selected bundle is no longer active or available.",
        );
      }

      if (
        !validCategories.includes(product.category as any) ||
        !validUnits.includes(product.unit as any)
      ) {
        throw new SubscriberServiceError(
          "INVALID_PRODUCT_SPEC",
          "Product category or unit specification is inconsistent.",
        );
      }

      // 4. Claim idempotency key by inserting order in PENDING state
      const [order] = await tx
        .insert(orders)
        .values({
          subscriberId,
          productId,
          type: "BUNDLE_PURCHASE",
          amountMinor: product.priceMinor,
          idempotencyKey,
          requestFingerprint,
          status: "PENDING",
        })
        .onConflictDoNothing({
          target: orders.idempotencyKey,
        })
        .returning();

      if (!order) {
        // Handle concurrent insertion conflict: return original completed order if finished
        const [concurrentOrder] = await tx
          .select()
          .from(orders)
          .where(eq(orders.idempotencyKey, idempotencyKey))
          .limit(1);

        if (
          !concurrentOrder ||
          concurrentOrder.requestFingerprint !== requestFingerprint
        ) {
          throw new SubscriberServiceError(
            "IDEMPOTENCY_CONFLICT",
            "Unable to safely resolve concurrent purchase request.",
          );
        }

        if (concurrentOrder.status === "COMPLETED") {
          const [account] = await tx
            .select()
            .from(chargingAccounts)
            .where(eq(chargingAccounts.subscriberId, subscriberId))
            .limit(1);

          return {
            orderId: concurrentOrder.id,
            productName: product.name,
            remainingAirtimeMinor: account ? account.balanceMinor : 0n,
            idempotentReplay: true,
          };
        }

        throw new SubscriberServiceError(
          "CONCURRENT_TRANSACTION_IN_PROGRESS",
          "A concurrent transaction for this idempotency key is processing.",
        );
      }

      // 5. Atomically deduct airtime balance if sufficient funds exist
      const [updatedAccount] = await tx
        .update(chargingAccounts)
        .set({
          balanceMinor: sql`${chargingAccounts.balanceMinor} - ${product.priceMinor}`,
          version: sql`${chargingAccounts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(chargingAccounts.subscriberId, subscriberId),
            gte(chargingAccounts.balanceMinor, product.priceMinor),
          ),
        )
        .returning();

      if (!updatedAccount) {
        await tx
          .update(orders)
          .set({ status: "FAILED" })
          .where(eq(orders.id, order.id));

        throw new SubscriberServiceError(
          "INSUFFICIENT_AIRTIME",
          "Insufficient airtime balance or charging account missing.",
        );
      }

      // 6. Provision and activate bundle instance locally
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + product.validitySeconds * 1000,
      );

      const [newInstance] = await tx
        .insert(productInstances)
        .values({
          subscriberId,
          productId: product.id,
          initialQuantity: product.allowance,
          remainingQuantity: product.allowance,
          unit: product.unit,
          status: "ACTIVE",
          expiresAt,
        })
        .returning();

      // 7. Record financial ledger entry with currency validation
      await tx.insert(accountLedgerEntries).values({
        orderId: order.id,
        agentId: null,
        subscriberId,
        direction: "DEBIT",
        amountMinor: product.priceMinor,
        currency: "SSP",
        entryKey: `${idempotencyKey}:SUBSCRIBER_BUNDLE_DEBIT`,
      });

      // 8. Complete order
      await tx
        .update(orders)
        .set({ status: "COMPLETED" })
        .where(eq(orders.id, order.id));

      return {
        orderId: order.id,
        productName: product.name,
        remainingAirtimeMinor: updatedAccount.balanceMinor,
        expiresAt: newInstance.expiresAt,
        idempotentReplay: false,
      };
    });
  }
}
