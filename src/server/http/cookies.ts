import "server-only";

export function secureCookieOptions(
  environment: "development" | "test" | "preview" | "production",
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: environment === "preview" || environment === "production",
    path: "/",
  };
}
