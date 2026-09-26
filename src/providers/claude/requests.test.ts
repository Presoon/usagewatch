import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpJson, secureDelete, secureGet, secureSet } = vi.hoisted(() => ({
  httpJson: vi.fn(),
  secureDelete: vi.fn(),
  secureGet: vi.fn(),
  secureSet: vi.fn(),
}));

vi.mock("../../platform/http", () => ({ httpJson }));

vi.mock("../../core/pkce", () => ({
  generateVerifier: () => "v".repeat(43),
  challengeS256: () => Promise.resolve("challenge"),
}));

import { fetchUsage } from "./api";
import { createAuth } from "./auth";
const { beginAuth, completeAuth, signOut } = createAuth({ get: secureGet, set: secureSet, delete: secureDelete });
import { CLAUDE_CODE_USER_AGENT } from "./client";
import { claudeProvider } from "./index";

describe("Claude request identity", () => {
  it.each([false, true])("preserves 429 status and cooldown (token refresh: %s)", async expired => {
    httpJson.mockResolvedValue({ status: 429, ok: false, data: {}, retryAfterMs: 120_000 });
    const provider = claudeProvider.create({
      get: async () => JSON.stringify({ accessToken: "token", refreshToken: "refresh", expiresAt: expired ? 0 : Date.now() + 3600000 }),
      set: secureSet, delete: secureDelete,
    });
    await expect(provider.fetchSnapshot()).rejects.toMatchObject({ name: "FetchError", status: 429, retryAfterMs: 120_000 });
    expect(httpJson).toHaveBeenCalledOnce();
    expect(secureSet).not.toHaveBeenCalled();
    expect(secureDelete).not.toHaveBeenCalled();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await signOut();
    vi.clearAllMocks();
  });

  it("identifies usage requests as Claude Code", async () => {
    httpJson.mockResolvedValue({ status: 200, ok: true, data: {} });

    await fetchUsage("access-token");

    expect(httpJson).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "anthropic-beta": "oauth-2025-04-20",
          Origin: "",
          "User-Agent": CLAUDE_CODE_USER_AGENT,
        }),
      }),
    );
  });

  it("identifies token exchange requests as Claude Code", async () => {
    httpJson.mockResolvedValue({
      status: 200,
      ok: true,
      data: { access_token: "access-token", refresh_token: "refresh-token" },
    });
    await beginAuth();

    await completeAuth(`authorization-code#${"v".repeat(43)}`);

    expect(httpJson).toHaveBeenCalledWith(
      "https://platform.claude.com/v1/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Origin: "",
          "User-Agent": CLAUDE_CODE_USER_AGENT,
        }),
      }),
    );
    expect(secureSet).toHaveBeenCalledOnce();
  });

  it("loads prepaid credits with the account token while keeping usage on billing failures", async () => {
    for (const failure of [null, "profile", "credits", "network", "missing-org"]) {
      httpJson.mockReset();
      httpJson.mockImplementation(async (url: string) => {
        if (url.endsWith("/usage")) return { ok: true, status: 200, data: { five_hour: { utilization: 25 } } };
        if (failure === "network") throw new Error("Offline");
        if (url.endsWith("/profile")) return { ok: failure !== "profile", status: failure === "profile" ? 403 : 200, data: failure === "missing-org" ? {} : { organization: { uuid: "test-org" } } };
        return { ok: failure !== "credits", status: failure === "credits" ? 404 : 200, data: { amount: 6769, currency: "EUR" } };
      });
      const provider = claudeProvider.create({
        get: async () => JSON.stringify({ accessToken: "account-token", expiresAt: Date.now() + 3600000 }),
        set: secureSet, delete: secureDelete,
      });
      const snapshot = await provider.fetchSnapshot();
      expect(snapshot.meters[0].percentLeft).toBe(75);
      expect(snapshot.infoRows[0]).toMatchObject({ label: "Credits", value: failure ? "Unavailable" : "€67.69" });
      if (!failure) expect(httpJson).toHaveBeenCalledWith(
        "https://api.anthropic.com/api/oauth/organizations/test-org/prepaid/credits",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer account-token", "x-organization-uuid": "test-org", Origin: "" }) }),
      );
      else if (failure !== "credits") expect(httpJson).toHaveBeenCalledTimes(2);
    }
  });
});
