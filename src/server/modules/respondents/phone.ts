import "server-only";

import { AppError } from "@/server/errors/app-error";
import { normalizedPhoneOrNull } from "@/lib/phone-validation";

export function normalizePhone(phone: string, country: string): string {
  const normalized = normalizedPhoneOrNull(phone, country);
  if (!normalized) throw invalid();
  return normalized;
}

function invalid() {
  return new AppError({
    category: "VALIDATION",
    code: "INVALID_PHONE",
    message: "Phone number could not be normalized unambiguously.",
    safeMessage: "Enter a valid phone number and select its country.",
    status: 400,
  });
}
