import { describe, expect, it } from "vitest";

import {
  parseCryptographyConfiguration,
  VersionedKeyRegistry,
} from "@/server/modules/cryptography/key-registry";

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PII_ENCRYPTION_ACTIVE_VERSION: "2",
    PII_ENCRYPTION_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
    PII_ENCRYPTION_KEY_V2: Buffer.alloc(32, 2).toString("base64"),
    PHONE_LOOKUP_HMAC_ACTIVE_VERSION: "1",
    PHONE_LOOKUP_HMAC_KEY_V1: Buffer.alloc(32, 3).toString("base64"),
    RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 4).toString("base64"),
  };
}

describe("versioned key registry", () => {
  it("selects one active write key and retains old read keys", () => {
    const configuration = parseCryptographyConfiguration(environment());
    expect(configuration.piiEncryptionKeys.activeVersion).toBe(2);
    expect(configuration.piiEncryptionKeys.versions()).toEqual([1, 2]);
    expect(configuration.piiEncryptionKeys.readKey(1)).toEqual(
      Buffer.alloc(32, 1),
    );
  });

  it.each([
    ["missing active version", { PII_ENCRYPTION_ACTIVE_VERSION: undefined }],
    ["missing active key", { PII_ENCRYPTION_KEY_V2: undefined }],
    [
      "wrong encryption length",
      { PII_ENCRYPTION_KEY_V2: Buffer.alloc(31).toString("base64") },
    ],
    ["malformed version", { PII_ENCRYPTION_ACTIVE_VERSION: "02" }],
  ])("rejects %s at startup", (_label, change) => {
    expect(() =>
      parseCryptographyConfiguration({ ...environment(), ...change }),
    ).toThrow("Invalid required cryptography configuration");
  });

  it("returns defensive key copies", () => {
    const source = Buffer.alloc(32, 8);
    const registry = new VersionedKeyRegistry(1, new Map([[1, source]]));
    source[0] = 1;
    const first = registry.activeKey();
    first[0] = 2;
    expect(registry.activeKey()).toEqual(Buffer.alloc(32, 8));
  });

  it("rejects invalid manually supplied key material", () => {
    expect(
      () => new VersionedKeyRegistry(1, new Map([[1, Buffer.alloc(31)]])),
    ).toThrow("versioned key material");
  });
});
