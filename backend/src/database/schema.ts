import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  bigint,
  integer,
  timestamp,
  boolean,
  check,
  index,
  uniqueIndex,
  PgTable,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --------------------------------------------------
// ENUMS
// --------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "AGENT",
  "SUBSCRIBER",
]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
]);

export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
]);

export const kycStatusEnum = pgEnum("kyc_status", [
  "PENDING",
  "VERIFIED",
  "REJECTED",
]);

export const simStatusEnum = pgEnum("sim_status", [
  "INACTIVE",
  "ACTIVE",
  "BLOCKED",
]);

export const agentStatusEnum = pgEnum("agent_status", ["ACTIVE", "SUSPENDED"]);

export const productCategoryEnum = pgEnum("product_category", [
  "DATA",
  "VOICE",
  "SMS",
]);

export const productStatusEnum = pgEnum("product_status", [
  "ACTIVE",
  "RETIRED",
]);

export const unitEnum = pgEnum("unit_enum", ["BYTES", "SECONDS", "COUNT"]);

export const productInstanceStatusEnum = pgEnum("product_instance_status", [
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "AIRTIME_TOPUP",
  "BUNDLE_PURCHASE",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);

export const ledgerDirectionEnum = pgEnum("ledger_direction", [
  "DEBIT",
  "CREDIT",
]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminUserId: uuid("admin_user_id")
    .references(() => users.id)
    .notNull(),
  action: varchar("action", { length: 100 }).notNull(), // e.g., 'FLOAT_TOPUP', 'AGENT_UNLOCKED'
  targetId: uuid("target_id"), // ID of agent, subscriber, or sim affected
  details: varchar("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// 1. USERS

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Optional for accounts that don't use phone-based login.
  // USSD identity is resolved through current SIM assignments.
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).unique(),

  passwordHash: varchar("password_hash", { length: 255 }),

  role: userRoleEnum("role").notNull(),
  status: userStatusEnum("status").default("ACTIVE").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// --------------------------------------------------
// 2. AGENTS
// --------------------------------------------------

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .references(() => users.id)
      .unique()
      .notNull(),

    agentCode: varchar("agent_code", { length: 20 }).unique().notNull(),

    fullName: varchar("full_name", { length: 150 }).notNull(),

    // Store a password hash, never the raw 4-digit PIN.
    pinHash: varchar("pin_hash", { length: 255 }).notNull(),

    floatBalanceMinor: bigint("float_balance_minor", {
      mode: "bigint",
    })
      .default(0n)
      .notNull(),

    status: agentStatusEnum("status").default("ACTIVE").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "agents_float_nonnegative_check",
      sql`${table.floatBalanceMinor} >= 0`,
    ),
  ],
);

// --------------------------------------------------
// 3. SUBSCRIBERS
// --------------------------------------------------

export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .references(() => users.id)
    .unique()
    .notNull(),

  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),

  nationalId: varchar("national_id", { length: 50 }).unique().notNull(),

  status: subscriberStatusEnum("status").default("ACTIVE").notNull(),

  // New subscribers must not be treated as verified automatically.
  kycStatus: kycStatusEnum("kyc_status").default("PENDING").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// --------------------------------------------------
// 4. SIM CARDS
// --------------------------------------------------

export const simCards = pgTable("sim_cards", {
  id: uuid("id").defaultRandom().primaryKey(),

  iccid: varchar("iccid", { length: 20 }).unique().notNull(),
  imsi: varchar("imsi", { length: 15 }).unique().notNull(),

  status: simStatusEnum("status").default("ACTIVE").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

// --------------------------------------------------
// 5. MSISDNS
// --------------------------------------------------

export const msisdns = pgTable(
  "msisdns",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    phoneNumber: varchar("phone_number", { length: 20 }).unique().notNull(),

    simId: uuid("sim_id")
      .references(() => simCards.id)
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("msisdns_sim_id_idx").on(table.simId)],
);

// --------------------------------------------------
// 6. SIM ASSIGNMENT HISTORY
// Each assignment belongs to exactly one agent or subscriber.
// endedAt IS NULL means the assignment is current.
// --------------------------------------------------

export const simAssignments = pgTable(
  "sim_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    simId: uuid("sim_id")
      .references(() => simCards.id)
      .notNull(),

    subscriberId: uuid("subscriber_id").references(() => subscribers.id),

    agentId: uuid("agent_id").references(() => agents.id),

    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    endedAt: timestamp("ended_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      "sim_assignment_exactly_one_owner_check",
      sql`(
        (${table.subscriberId} IS NOT NULL AND ${table.agentId} IS NULL)
        OR
        (${table.subscriberId} IS NULL AND ${table.agentId} IS NOT NULL)
      )`,
    ),

    check(
      "sim_assignment_dates_check",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.assignedAt}`,
    ),

    uniqueIndex("sim_assignments_one_current_per_sim")
      .on(table.simId)
      .where(sql`${table.endedAt} IS NULL`),

    index("sim_assignments_subscriber_idx").on(table.subscriberId),
    index("sim_assignments_agent_idx").on(table.agentId),
  ],
);

// --------------------------------------------------
// 7. CHARGING ACCOUNTS
// --------------------------------------------------

export const chargingAccounts = pgTable(
  "charging_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id)
      .unique()
      .notNull(),

    currency: varchar("currency", { length: 10 }).default("SSP").notNull(),

    balanceMinor: bigint("balance_minor", {
      mode: "bigint",
    })
      .default(0n)
      .notNull(),

    version: integer("version").default(1).notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "charging_accounts_balance_nonnegative_check",
      sql`${table.balanceMinor} >= 0`,
    ),
    check(
      "charging_accounts_version_positive_check",
      sql`${table.version} >= 1`,
    ),
  ],
);

// --------------------------------------------------
// 8. PRODUCTS
// --------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    code: varchar("code", { length: 50 }).unique().notNull(),
    name: varchar("name", { length: 100 }).notNull(),

    category: productCategoryEnum("category").notNull(),

    allowance: bigint("allowance", { mode: "bigint" }).notNull(),
    unit: unitEnum("unit").notNull(),

    validitySeconds: integer("validity_seconds").notNull(),

    priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),

    status: productStatusEnum("status").default("ACTIVE").notNull(),
  },
  (table) => [
    check("products_allowance_positive_check", sql`${table.allowance} > 0`),
    check(
      "products_validity_positive_check",
      sql`${table.validitySeconds} > 0`,
    ),
    check("products_price_nonnegative_check", sql`${table.priceMinor} >= 0`),
  ],
);

// --------------------------------------------------
// 9. PRODUCT INSTANCES
// --------------------------------------------------

export const productInstances = pgTable(
  "product_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id)
      .notNull(),

    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),

    initialQuantity: bigint("initial_quantity", {
      mode: "bigint",
    }).notNull(),

    remainingQuantity: bigint("remaining_quantity", {
      mode: "bigint",
    }).notNull(),

    unit: unitEnum("unit").notNull(),

    status: productInstanceStatusEnum("status").default("ACTIVE").notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "product_instances_initial_positive_check",
      sql`${table.initialQuantity} > 0`,
    ),
    check(
      "product_instances_remaining_range_check",
      sql`${table.remainingQuantity} >= 0 AND ${table.remainingQuantity} <= ${table.initialQuantity}`,
    ),
    index("product_instances_subscriber_status_idx").on(
      table.subscriberId,
      table.status,
    ),
  ],
);

// --------------------------------------------------
// 10. ORDERS
// --------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id)
      .notNull(),

    agentId: uuid("agent_id").references(() => agents.id),
    productId: uuid("product_id").references(() => products.id),

    type: orderTypeEnum("type").notNull(),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),

    // Caller must reuse this key when retrying the same logical request.
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .unique()
      .notNull(),

    // Prevent reusing a key for a different amount/recipient/agent.
    requestFingerprint: varchar("request_fingerprint", {
      length: 255,
    }).notNull(),

    status: orderStatusEnum("status").default("PENDING").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("orders_amount_positive_check", sql`${table.amountMinor} > 0`),
    index("orders_subscriber_created_idx").on(
      table.subscriberId,
      table.createdAt,
    ),
    index("orders_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

// --------------------------------------------------
// 11. FINANCIAL LEDGER ENTRIES
// Each row records one debit or credit associated with an order.
// --------------------------------------------------

export const accountLedgerEntries = pgTable(
  "account_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .references(() => orders.id)
      .notNull(),

    // Exactly one of agentId or subscriberId must be populated.
    agentId: uuid("agent_id").references(() => agents.id),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id),

    direction: ledgerDirectionEnum("direction").notNull(),

    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),

    currency: varchar("currency", { length: 10 }).default("SSP").notNull(),

    // e.g. <order-idempotency-key>:AGENT_DEBIT
    entryKey: varchar("entry_key", { length: 180 }).unique().notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "ledger_exactly_one_account_check",
      sql`(
        (${table.agentId} IS NOT NULL AND ${table.subscriberId} IS NULL)
        OR
        (${table.agentId} IS NULL AND ${table.subscriberId} IS NOT NULL)
      )`,
    ),
    check("ledger_amount_positive_check", sql`${table.amountMinor} > 0`),
    index("ledger_order_idx").on(table.orderId),
    index("ledger_agent_created_idx").on(table.agentId, table.createdAt),
    index("ledger_subscriber_created_idx").on(
      table.subscriberId,
      table.createdAt,
    ),
  ],
);

// --------------------------------------------------
// 12. USAGE RECORDS
// --------------------------------------------------

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id)
      .notNull(),

    productInstanceId: uuid("product_instance_id").references(
      () => productInstances.id,
    ),

    usageType: productCategoryEnum("usage_type").notNull(),

    quantityConsumed: bigint("quantity_consumed", {
      mode: "bigint",
    }).notNull(),

    unit: unitEnum("unit").notNull(),

    // Optional network-side event identifier for deduplication.
    sourceEventId: varchar("source_event_id", { length: 150 }).unique(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "usage_records_quantity_positive_check",
      sql`${table.quantityConsumed} > 0`,
    ),
    index("usage_records_subscriber_created_idx").on(
      table.subscriberId,
      table.createdAt,
    ),
  ],
);
