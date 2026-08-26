import { describe, expect, it, vi } from "vitest";

import { withSerializableRetry } from "@/server/database/transaction";

describe("serializable transaction retry helper", () => {
  it("retries Cockroach serialization conflicts within a bounded limit", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: "40001" })
      .mockResolvedValue("committed");

    await expect(withSerializableRetry(operation)).resolves.toBe("committed");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry unrelated failures", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("synthetic failure"));

    await expect(withSerializableRetry(operation)).rejects.toThrow(
      "synthetic failure",
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
