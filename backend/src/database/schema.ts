import {
  pgTable,
  uuid,
  varchar,
  bigint,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { pgEnum } from "drizzle-orm/pg-core";

// --- ENUMS ---
export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "AGENT",
  "SUBSCRIBER",
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
export const orderStatusEnum = pgEnum("order_status", ["COMPLETED", "FAILED"]);

// --- 1. UNIFIED USERS TABLE (Authentication & Role Base) ---
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(), // Nullable for pure Admins
  email: varchar("email", { length: 255 }).unique(), // Nullable for USSD Subscribers
  passwordHash: varchar("password_hash", { length: 255 }), // For Web Dashboard Admin login
  role: userRoleEnum("role").notNull(), // ADMIN | AGENT | SUBSCRIBER
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 2. AGENTS PROFILE (Linked to User) ---
export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .unique()
    .notNull(),
  agentCode: varchar("agent_code", { length: 20 }).unique().notNull(), // e.g., "AGT-101"
  fullName: varchar("full_name", { length: 150 }).notNull(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(), // 4-digit USSD PIN
  floatBalanceMinor: bigint("float_balance_minor", { mode: "bigint" })
    .default(0n)
    .notNull(), // Agent float stock
  status: agentStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 3. SUBSCRIBERS PROFILE (Linked to User) ---
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
  kycStatus: kycStatusEnum("kyc_status").default("VERIFIED").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 4. SIM CARDS ---
export const simCards = pgTable("sim_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  iccid: varchar("iccid", { length: 20 }).unique().notNull(),
  imsi: varchar("imsi", { length: 15 }).unique().notNull(),
  subscriberId: uuid("subscriber_id").references(() => subscribers.id),
  status: simStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 5. MSISDNS (Phone Numbers mapped to SIM & Subscriber) ---
export const msisdns = pgTable("msisdns", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique().notNull(),
  simId: uuid("sim_id").references(() => simCards.id),
  subscriberId: uuid("subscriber_id").references(() => subscribers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 6. CHARGING ACCOUNTS ---
export const chargingAccounts = pgTable("charging_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .unique()
    .notNull(),
  currency: varchar("currency", { length: 10 }).default("SSP").notNull(),
  balanceMinor: bigint("balance_minor", { mode: "bigint" })
    .default(0n)
    .notNull(),
  version: integer("version").default(1).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- 7. PRODUCTS CATALOG ---
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  category: productCategoryEnum("category").notNull(),
  allowance: bigint("allowance", { mode: "bigint" }).notNull(),
  unit: unitEnum("unit").notNull(),
  validitySeconds: integer("validity_seconds").notNull(),
  priceMinor: bigint("price_minor", { mode: "bigint" }).notNull(),
  status: productStatusEnum("status").default("ACTIVE").notNull(),
});

// --- 8. PRODUCT INSTANCES ---
export const productInstances = pgTable("product_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  productId: uuid("product_id")
    .references(() => products.id)
    .notNull(),
  initialQuantity: bigint("initial_quantity", { mode: "bigint" }).notNull(),
  remainingQuantity: bigint("remaining_quantity", { mode: "bigint" }).notNull(),
  unit: unitEnum("unit").notNull(),
  status: productInstanceStatusEnum("status").default("ACTIVE").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 9. ORDERS ---
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  agentId: uuid("agent_id").references(() => agents.id),
  productId: uuid("product_id").references(() => products.id),
  type: orderTypeEnum("type").notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  status: orderStatusEnum("status").default("COMPLETED").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- 10. USAGE RECORDS ---
export const usageRecords = pgTable("usage_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .references(() => subscribers.id)
    .notNull(),
  productInstanceId: uuid("product_instance_id").references(
    () => productInstances.id,
  ),
  usageType: productCategoryEnum("usage_type").notNull(),
  quantityConsumed: bigint("quantity_consumed", { mode: "bigint" }).notNull(),
  unit: unitEnum("unit").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
