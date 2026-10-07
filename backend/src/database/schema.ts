import {
  pgTable,
  uuid,
  varchar,
  bigint,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";

// --- ENUMS ---
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
export const msisdnStatusEnum = pgEnum("msisdn_status", [
  "AVAILABLE",
  "ASSIGNED",
  "SUSPENDED",
  "RELEASED",
]);

export const deviceTypeEnum = pgEnum("device_type", [
  "SMARTPHONE",
  "FEATURE_PHONE",
  "TABLET",
  "ROUTER",
  "OTHER",
]);

export const productCategoryEnum = pgEnum("product_category", [
  "DATA",
  "VOICE",
  "SMS",
]);
export const productStatusEnum = pgEnum("product_status", [
  "ACTIVE",
  "INACTIVE",
  "RETIRED",
]);
export const unitEnum = pgEnum("unit_enum", ["BYTES", "SECONDS", "COUNT"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
]);
export const productInstanceStatusEnum = pgEnum("product_instance_status", [
  "ACTIVE",
  "EXHAUSTED",
  "EXPIRED",
  "SUSPENDED",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const orderTypeEnum = pgEnum("order_type", [
  "AIRTIME_TOPUP",
  "BUNDLE_PURCHASE",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "AIRTIME",
  "ADMIN_TOPUP",
  "MOBILE_MONEY",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "SUCCESS",
  "FAILED",
]);

export const usageTypeEnum = pgEnum("usage_type", ["DATA", "VOICE", "SMS"]);
export const usageStatusEnum = pgEnum("usage_status", [
  "PROCESSED",
  "REJECTED",
  "DUPLICATE",
]);

export const provisioningOperationEnum = pgEnum("provisioning_operation", [
  "ACTIVATE",
  "DEACTIVATE",
  "SUSPEND",
  "RESUME",
]);
export const provisioningStatusEnum = pgEnum("provisioning_status", [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "PENDING",
  "PROCESSED",
  "FAILED",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
]);
// --- TABLES ---

// Agents Table (Airtime Sellers)
export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentCode: varchar("agent_code", { length: 20 }).unique().notNull(), // e.g., "AGT-8842"
  phoneNumber: varchar("phone_number", { length: 20 }).unique().notNull(), // Agent SIM MSISDN
  fullName: varchar("full_name", { length: 255 }).notNull(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(), // 4-digit USSD PIN
  floatBalanceMinor: bigint("float_balance_minor", { mode: "bigint" })
    .default(0n)
    .notNull(), // Agent inventory
  status: agentStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 1. Subscribers
export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: varchar("external_id", { length: 100 }).unique(),
  firstName: varchar("first_name", { length: 128 }).notNull(),
  lastName: varchar("last_name", { length: 128 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  nationalId: varchar("national_id", { length: 100 }).unique().notNull(),
  status: subscriberStatusEnum("status").default("ACTIVE").notNull(),
  kycStatus: kycStatusEnum("kyc_status").default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. SIM Cards
export const simCards = pgTable("sim_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  iccid: varchar("iccid", { length: 20 }).unique().notNull(),
  imsi: varchar("imsi", { length: 15 }).unique().notNull(),
  subscriberId: uuid("subscriber_id").references(() => subscribers.id),
  status: simStatusEnum("status").default("INACTIVE").notNull(),
  activatedAt: timestamp("activated_at"),
  deactivatedAt: timestamp("deactivated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. MSISDNs (Phone Numbers & Assignment History)
export const msisdns = pgTable("msisdns", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  simId: uuid("sim_id").references(() => simCards.id),
  subscriberId: uuid("subscriber_id").references(() => subscribers.id),
  status: msisdnStatusEnum("status").default("ASSIGNED").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 4. Devices & Subscriber Devices Junction Table
export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  imei: varchar("imei", { length: 18 }).unique().notNull(),
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  deviceType: deviceTypeEnum("device_type").default("SMARTPHONE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subscriberDevices = pgTable("subscriber_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  deviceId: uuid("device_id")
    .references(() => devices.id)
    .notNull(),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

// 5. Charging Accounts (Airtime Balance in Minor Units)
export const chargingAccounts = pgTable("charging_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull()
    .unique(),
  currency: varchar("currency", { length: 10 }).default("SSP").notNull(),
  balanceMinor: bigint("balance_minor", { mode: "bigint" })
    .default(0n)
    .notNull(),
  status: subscriberStatusEnum("status").default("ACTIVE").notNull(),
  version: integer("version").default(1).notNull(), // Optimistic locking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 6. Products Catalog
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 100 }).unique().notNull(), // e.g., "DATA_1GB_DAILY"
  name: varchar("name", { length: 150 }).notNull(),
  category: productCategoryEnum("category").notNull(),
  allowance: bigint("allowance", { mode: "bigint" }).notNull(), // e.g., 1073741824 bytes
  unit: unitEnum("unit").notNull(),
  validitySeconds: integer("validity_seconds").notNull(),
  priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(), // e.g., 50000 minor units
  currency: varchar("currency", { length: 10 }).default("SSP").notNull(),
  status: productStatusEnum("status").default("ACTIVE").notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 7. Subscriptions (Subscriber's long-lived service relationship)
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  status: subscriptionStatusEnum("status").default("ACTIVE").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 8. Product Instances (Active purchased allowances)
export const productInstances = pgTable("product_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  productId: uuid("product_id")
    .references(() => products.id)
    .notNull(),
  initialQuantity: bigint("initial_quantity", { mode: "bigint" }).notNull(),
  remainingQuantity: bigint("remaining_quantity", { mode: "bigint" }).notNull(),
  unit: unitEnum("unit").notNull(),
  status: productInstanceStatusEnum("status").default("ACTIVE").notNull(),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 9. Orders
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  productId: uuid("product_id").references(() => products.id), // Nullable for plain airtime topup
  quantity: integer("quantity").default(1).notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SSP").notNull(),
  type: orderTypeEnum("type").notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 })
    .unique()
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 10. Payments
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .references(() => orders.id)
    .notNull(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SSP").notNull(),
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("status").default("PENDING").notNull(),
  providerReference: varchar("provider_reference", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 11. Usage Records (CDRs - Call Detail Records)
export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    subscriberId: uuid("subscriber_id")
      .references(() => subscribers.id)
      .notNull(),
    simCardId: uuid("sim_card_id").references(() => simCards.id),
    productInstanceId: uuid("product_instance_id").references(
      () => productInstances.id,
    ),
    usageType: usageTypeEnum("usage_type").notNull(),
    quantity: bigint("quantity", { mode: "bigint" }).notNull(), // e.g., bytes, seconds, count
    unit: unitEnum("unit").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    source: varchar("source", { length: 100 }).notNull(), // e.g., "NETWORK_PGW", "SMSC"
    status: usageStatusEnum("status").default("PROCESSED").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Deduplication rule across network event re-transmissions
    uniqueIndex("source_event_idx").on(table.source, table.eventId),
  ],
);

// 12. Provisioning Requests
export const provisioningRequests = pgTable("provisioning_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").references(() => orders.id),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  productInstanceId: uuid("product_instance_id").references(
    () => productInstances.id,
  ),
  operation: provisioningOperationEnum("operation").notNull(),
  status: provisioningStatusEnum("status").default("QUEUED").notNull(),
  externalReference: varchar("external_reference", { length: 255 }),
  attemptCount: integer("attempt_count").default(0).notNull(),
  lastError: varchar("last_error", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// 13. Outbox Events (Transactional Outbox Pattern for async messaging)
export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  aggregateType: varchar("aggregate_type", { length: 100 }).notNull(), // e.g., "ORDER", "USAGE"
  aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(), // e.g., "ORDER_COMPLETED"
  payload: varchar("payload", { length: 4000 }).notNull(), // JSON string payload
  status: outboxStatusEnum("status").default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});
