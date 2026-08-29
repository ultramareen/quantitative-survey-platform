import "server-only";

import { AppError } from "@/server/errors/app-error";

const VERSION_PATTERN = /^[1-9]\d*$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type KeyVersion = number;

export class VersionedKeyRegistry {
  readonly activeVersion: KeyVersion;
  readonly #keys: ReadonlyMap<KeyVersion, Buffer>;

  constructor(
    activeVersion: KeyVersion,
    keys: ReadonlyMap<KeyVersion, Buffer>,
  ) {
    if (!Number.isSafeInteger(activeVersion) || activeVersion < 1) {
      throw configurationError("active key version");
    }
    if (!keys.has(activeVersion)) {
      throw configurationError("active key material");
    }
    for (const [version, key] of keys) {
      if (!Number.isSafeInteger(version) || version < 1 || key.length !== 32) {
        throw configurationError("versioned key material");
      }
    }

    this.activeVersion = activeVersion;
    this.#keys = new Map(
      [...keys].map(([version, key]) => [version, Buffer.from(key)]),
    );
    Object.freeze(this);
  }

  activeKey(): Buffer {
    return this.readKey(this.activeVersion);
  }

  readKey(version: KeyVersion): Buffer {
    const key = this.#keys.get(version);
    if (!key) throw configurationError("retained read key version");
    return Buffer.from(key);
  }

  versions(): KeyVersion[] {
    return [...this.#keys.keys()].sort((left, right) => left - right);
  }
}

export type CryptographyConfiguration = {
  piiEncryptionKeys: VersionedKeyRegistry;
  phoneLookupKeys: VersionedKeyRegistry;
  rateLimitHmacKey: Buffer;
};

export function parseCryptographyConfiguration(
  input: NodeJS.ProcessEnv,
): CryptographyConfiguration {
  const piiEncryptionKeys = parsePiiEncryptionKeyRegistry(input);
  const phoneLookupKeys = registryFromEnvironment(input, {
    activeName: "PHONE_LOOKUP_HMAC_ACTIVE_VERSION",
    keyPrefix: "PHONE_LOOKUP_HMAC_KEY_V",
    keyLength: 32,
  });
  const rateLimitHmacKey = decodeKey(
    input.RATE_LIMIT_HMAC_KEY,
    "RATE_LIMIT_HMAC_KEY",
    32,
  );

  assertIndependentKeys([
    ...piiEncryptionKeys
      .versions()
      .map((version) => piiEncryptionKeys.readKey(version)),
    ...phoneLookupKeys
      .versions()
      .map((version) => phoneLookupKeys.readKey(version)),
    rateLimitHmacKey,
  ]);

  return {
    piiEncryptionKeys,
    phoneLookupKeys,
    rateLimitHmacKey: Buffer.from(rateLimitHmacKey),
  };
}

export function parsePiiEncryptionKeyRegistry(
  input: NodeJS.ProcessEnv,
): VersionedKeyRegistry {
  return registryFromEnvironment(input, {
    activeName: "PII_ENCRYPTION_ACTIVE_VERSION",
    keyPrefix: "PII_ENCRYPTION_KEY_V",
    keyLength: 32,
  });
}

function registryFromEnvironment(
  input: NodeJS.ProcessEnv,
  options: { activeName: string; keyPrefix: string; keyLength: number },
): VersionedKeyRegistry {
  const activeText = input[options.activeName];
  if (!activeText || !VERSION_PATTERN.test(activeText)) {
    throw configurationError(options.activeName);
  }
  const activeVersion = Number(activeText);
  const keys = new Map<number, Buffer>();

  for (const [name, value] of Object.entries(input)) {
    if (!name.startsWith(options.keyPrefix)) continue;
    const versionText = name.slice(options.keyPrefix.length);
    if (!VERSION_PATTERN.test(versionText)) {
      throw configurationError(name);
    }
    keys.set(Number(versionText), decodeKey(value, name, options.keyLength));
  }

  if (keys.size === 0) throw configurationError(options.keyPrefix + "n");
  return new VersionedKeyRegistry(activeVersion, keys);
}

function decodeKey(value: string | undefined, name: string, length: number) {
  if (!value || !BASE64_PATTERN.test(value)) throw configurationError(name);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== length || decoded.toString("base64") !== value) {
    throw configurationError(name);
  }
  return decoded;
}

function assertIndependentKeys(keys: readonly Buffer[]): void {
  for (let left = 0; left < keys.length; left += 1) {
    for (let right = left + 1; right < keys.length; right += 1) {
      if (keys[left].equals(keys[right])) {
        throw configurationError("independent cryptographic keys");
      }
    }
  }
}

function configurationError(field: string): AppError {
  return new AppError({
    category: "CONFIGURATION",
    code: "INVALID_CRYPTOGRAPHY_CONFIGURATION",
    message: `Invalid required cryptography configuration: ${field}`,
    safeMessage: "The application is not configured correctly.",
    status: 500,
  });
}
