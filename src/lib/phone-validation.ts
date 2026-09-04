import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function normalizedPhoneOrNull(
  phone: string,
  country: string,
): string | null {
  const raw = phone.trim();
  const countryCode = country.trim().toUpperCase();
  if (!raw || raw.length > 64 || !COUNTRY_PATTERN.test(countryCode))
    return null;
  const parsed = parsePhoneNumberFromString(raw, countryCode as CountryCode);
  if (!parsed?.isValid()) return null;
  const digits = parsed.number.slice(1);
  if (parsed.number.startsWith("+7") && digits.length !== 11) return null;
  return parsed.number;
}

export function isCompletePhone(phone: string, country: string): boolean {
  return normalizedPhoneOrNull(phone, country) !== null;
}
