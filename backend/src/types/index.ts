import type { JwtPayload } from "jsonwebtoken";

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
