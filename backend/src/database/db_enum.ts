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
