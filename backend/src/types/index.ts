export interface USSDSessionState {
  role?: "AGENT" | "SUBSCRIBER";
  phoneNumber?: string;
  targetPhoneNumber?: string;
  amountMinor?: string;
  selectedProductId?: string;
  step?: string;
}
