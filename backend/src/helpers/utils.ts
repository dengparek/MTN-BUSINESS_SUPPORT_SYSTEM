import { AgentServiceError } from "../modules/agents/AgentServiceError";

export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.trim().replace(/[()\s-]/g, "");
}

export function assertValidPin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new AgentServiceError(
      "INVALID_PIN_FORMAT",
      "PIN must contain exactly four digits.",
    );
  }
}

export function formatAllowance(allowance: bigint, unit: string): string {
  if (unit === "BYTES") {
    const bytes = Number(allowance);
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024 && mb % 1024 === 0) {
      return `${mb / 1024} GB`;
    }
    return `${Math.round(mb)} MB`;
  }
  if (unit === "SECONDS") {
    const mins = Math.round(Number(allowance) / 60);
    return `${mins} Mins`;
  }
  return `${allowance.toString()} ${unit}`;
}
