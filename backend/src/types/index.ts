import type { JwtPayload } from "jsonwebtoken";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { products } from "../database/schema.js";

export interface USSDSessionState {
  role?: "AGENT" | "SUBSCRIBER";
  phoneNumber?: string;
  targetPhoneNumber?: string;
  amountMinor?: string;
  selectedProductId?: string;
  step?: string;
}

// export interface AdminJwtPayload {
//   userId: string;
//   role: string;
// }

export interface AdminJwtPayload extends JwtPayload {
  userId: string;
  role: string;
}

// Strict runtime validation constants matching database enums
export const VALID_CATEGORIES = ["DATA", "VOICE", "SMS", "AIRTIME"] as const;
export type ValidCategory = (typeof VALID_CATEGORIES)[number];

export const VALID_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type ValidStatus = (typeof VALID_STATUSES)[number];

export type Product = InferSelectModel<typeof products>;
export type CreateProductInput = InferInsertModel<typeof products>;
export type UpdateProductInput = Partial<CreateProductInput>;

export interface ProductQueryOptions {
  category?: Product["category"] | undefined;
  status?: Product["status"] | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}
