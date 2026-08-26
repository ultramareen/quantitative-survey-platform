import "server-only";

type DatabaseErrorLike = { code?: unknown; message?: unknown };

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as DatabaseErrorLike;
  return candidate.code === "P2034" || candidate.code === "40001";
}

export async function withSerializableRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new RangeError("maxAttempts must be an integer between 1 and 5");
  }

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableTransactionError(error))
        throw error;
    }
  }

  throw new Error("Unreachable transaction retry state");
}
