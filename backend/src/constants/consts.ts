export const validCategories = ["DATA", "VOICE", "SMS"] as const;
export const validUnits = ["BYTES", "SECONDS", "COUNT"] as const;
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCKOUT_DURATION_SECONDS = 900; // 15 minutes

export const ROOT_MENU =
  "CON Welcome to MTN\n" +
  "1. Check Balances\n" +
  "2. Buy Data Bundles\n" +
  "3. Buy Voice Bundles\n" +
  "4. Buy SMS Bundles";
