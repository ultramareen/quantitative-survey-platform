import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();
const identify = vi.fn();
vi.mock("@/server/modules/respondents/runtime", () => ({
  getPublicRespondentService: () => ({ open, identify }),
}));
vi.mock("@/server/config/env", () => ({
  getServerEnvironment: () => ({
    APP_ENV: "production",
    APP_ORIGIN: "https://survey.example.com",
  }),
}));

describe("public respondent routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("places a raw Open token only in a secure HttpOnly cookie", async () => {
    const token = "A".repeat(43);
    open.mockResolvedValue({
      availability: "ACTIVE",
      identified: false,
      title: "Study",
      newOpenToken: token,
    });
    const { GET } =
      await import("@/app/api/public/surveys/[publicId]/open/route");
    const response = await GET(
      new NextRequest(
        "https://survey.example.com/api/public/surveys/public-id-value1/open",
      ),
      { params: Promise.resolve({ publicId: "public-id-value1" }) },
    );
    expect(await response.json()).toEqual({
      availability: "ACTIVE",
      identified: false,
      title: "Study",
    });
    expect(response.headers.get("set-cookie")).toContain(
      `qsp_public_open_public-id-value1=${token}`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("places a raw attempt token only in a secure cookie and returns a uniform body", async () => {
    const token = "B".repeat(43);
    identify.mockResolvedValue({ identified: true, newAttemptToken: token });
    const { POST } =
      await import("@/app/api/public/surveys/[publicId]/identify/route");
    const response = await POST(
      new NextRequest(
        "https://survey.example.com/api/public/surveys/public-id-value1/identify",
        {
          method: "POST",
          headers: {
            origin: "https://survey.example.com",
            host: "survey.example.com",
            "content-type": "application/json",
            cookie: `qsp_public_open_public-id-value1=${"A".repeat(43)}`,
          },
          body: JSON.stringify({
            name: "Person",
            phone: "+12025550123",
            country: "US",
          }),
        },
      ),
      { params: Promise.resolve({ publicId: "public-id-value1" }) },
    );
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ identified: true });
    expect(response.headers.get("set-cookie")).toContain(
      `qsp_current_attempt_public-id-value1=${token}`,
    );
    expect(body).not.toContain(token);
  });
  it("rejects cross-origin identity mutations before the service", async () => {
    const { POST } =
      await import("@/app/api/public/surveys/[publicId]/identify/route");
    const response = await POST(
      new NextRequest(
        "https://survey.example.com/api/public/surveys/public-id-value1/identify",
        {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            host: "survey.example.com",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      { params: Promise.resolve({ publicId: "public-id-value1" }) },
    );
    expect(response.status).toBe(403);
    expect(identify).not.toHaveBeenCalled();
  });
});
