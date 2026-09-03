import { describe, expect, it } from "vitest";
import { VersionedKeyRegistry } from "@/server/modules/cryptography/key-registry";
import type {
  RespondentRepository,
  IdentityPersistenceInput,
} from "@/server/modules/respondents/repository";
import { PublicRespondentService } from "@/server/modules/respondents/service";

const cryptography = {
  piiEncryptionKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 1)]]),
  ),
  phoneLookupKeys: new VersionedKeyRegistry(
    1,
    new Map([[1, Buffer.alloc(32, 2)]]),
  ),
  rateLimitHmacKey: Buffer.alloc(32, 3),
};
const publicId = "abcdefghijklmnopqrstuv";
class Repo implements RespondentRepository {
  availability: "ACTIVE" | "PENDING" | "UNAVAILABLE" = "ACTIVE";
  createdOpen = true;
  identified?: IdentityPersistenceInput;
  createdAttempt = true;
  rates: string[] = [];
  async open() {
    return {
      availability: this.availability,
      identified: false,
      title: "Study",
      surveyId: "00000000-0000-4000-8000-000000000111",
      createdOpen: this.createdOpen,
    };
  }
  async resolveIdentityContext() {
    return { surveyId: "00000000-0000-4000-8000-000000000111" };
  }
  async identify(input: IdentityPersistenceInput) {
    this.identified = input;
    return { createdAttempt: this.createdAttempt };
  }
  async consumeRateLimit(input: { scope: string }) {
    this.rates.push(input.scope);
  }
}
function fixture() {
  const repo = new Repo();
  return {
    repo,
    service: new PublicRespondentService(
      repo,
      cryptography,
      () => new Date("2026-08-28T00:00:00Z"),
    ),
  };
}

describe("public respondent service", () => {
  it("creates a hash-only Open token without creating identity", async () => {
    const { repo, service } = fixture();
    const result = await service.open(publicId, undefined, "127.0.0.1");
    expect(result).toMatchObject({ availability: "ACTIVE", identified: false });
    expect(result.newOpenToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repo.identified).toBeUndefined();
  });
  it("reuses an Open without rotating its token", async () => {
    const { repo, service } = fixture();
    repo.createdOpen = false;
    const result = await service.open(publicId, "A".repeat(43), "127.0.0.1");
    expect(result.newOpenToken).toBeUndefined();
  });
  it("normalizes identity, encrypts PII, HMACs phone, and creates an opaque attempt token", async () => {
    const { repo, service } = fixture();
    const result = await service.identify(
      publicId,
      "A".repeat(43),
      { name: "  Synthetic   Person ", phone: "202-555-0123", country: "US" },
      "127.0.0.1",
    );
    expect(result.newAttemptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repo.identified?.referenceId).toMatch(/^R-[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(repo.identified?.nameCiphertext.toString()).not.toContain(
      "Synthetic Person",
    );
    expect(repo.identified?.phoneCiphertext.toString()).not.toContain(
      "+12025550123",
    );
    expect(repo.identified?.phoneLookupHash).toHaveLength(32);
    expect(repo.identified?.phoneLookupKeyVersion).toBe(1);
  });
  it.each([
    { name: "", phone: "2025550123", country: "US" },
    { name: "Person", phone: "not-phone", country: "US" },
    { name: "Person", phone: "2025550123", country: "" },
  ])("rejects invalid identity", async (input) => {
    const { service } = fixture();
    await expect(
      service.identify(publicId, "A".repeat(43), input, "ip"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each(["+7968234", "+7968234123432"])(
    "rejects invalid +7 length independently on the server: %s",
    async (phone) => {
      const { service } = fixture();
      await expect(
        service.identify(
          publicId,
          "A".repeat(43),
          { name: "Person", phone, country: "RU" },
          "ip",
        ),
      ).rejects.toMatchObject({ code: "INVALID_PHONE", status: 400 });
    },
  );
  it.each([
    ["+79682341234", "RU"],
    ["+442079460123", "GB"],
  ])(
    "accepts a valid supported international phone: %s",
    async (phone, country) => {
      const { service } = fixture();
      await expect(
        service.identify(
          publicId,
          "A".repeat(43),
          { name: "Person", phone, country },
          "ip",
        ),
      ).resolves.toMatchObject({ identified: true });
    },
  );
  it("returns a uniform success without an attempt token for an existing phone", async () => {
    const { repo, service } = fixture();
    repo.createdAttempt = false;
    await expect(
      service.identify(
        publicId,
        "A".repeat(43),
        { name: "Different Name", phone: "+12025550123", country: "US" },
        "ip",
      ),
    ).resolves.toEqual({ identified: true });
  });
  it("rejects malformed public IDs and invalid session tokens safely", async () => {
    const { service } = fixture();
    await expect(service.open("bad", undefined, "ip")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.open("R-7K3M9W2X8Q4D", undefined, "ip"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.identify(
        publicId,
        "invalid",
        { name: "Person", phone: "+12025550123", country: "US" },
        "ip",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
