export function normalizeEmployeeEmail(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}
