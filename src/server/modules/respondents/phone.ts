import "server-only";

import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { AppError } from "@/server/errors/app-error";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function normalizePhone(phone: string, country: string): string {
  const raw = phone.trim();
  const countryCode = country.trim().toUpperCase();
  if (!raw || raw.length > 64 || !COUNTRY_PATTERN.test(countryCode))
    throw invalid();
  const parsed = parsePhoneNumberFromString(raw, countryCode as CountryCode);
  if (!parsed?.isValid()) throw invalid();
  return parsed.number;
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
