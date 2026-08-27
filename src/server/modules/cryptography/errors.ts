import "server-only";

import { AppError } from "@/server/errors/app-error";

export class CryptographyError extends AppError {
  constructor(code: string, message = "Cryptographic operation failed") {
    super({
      category: "INTERNAL",
      code,
      message,
      safeMessage: "Protected data could not be processed.",
      status: 500,
    });
    this.name = "CryptographyError";
  }
}

export function cryptographyFailure(): CryptographyError {
  return new CryptographyError("CRYPTOGRAPHIC_OPERATION_FAILED");
}
