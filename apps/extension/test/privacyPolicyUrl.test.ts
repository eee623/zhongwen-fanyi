import { describe, expect, it } from "vitest";
import { privacyPolicyUrlResponseError, shouldFetchPrivacyPolicyUrl } from "../src/privacyPolicyUrl";

describe("privacy policy URL verification", () => {
  it("skips fetches for missing or placeholder privacy policy URLs", () => {
    expect(shouldFetchPrivacyPolicyUrl(undefined)).toBe(false);
    expect(shouldFetchPrivacyPolicyUrl("PENDING_PUBLIC_PRIVACY_POLICY_URL")).toBe(false);
    expect(shouldFetchPrivacyPolicyUrl("https://your-domain.example/privacy")).toBe(false);
  });

  it("requires the privacy policy URL to be reachable", () => {
    expect(
      privacyPolicyUrlResponseError({
        ok: false,
        status: 404,
        text: "not found"
      })
    ).toBe("Chrome Web Store privacy policy URL must be reachable and point to the privacy policy.");
  });

  it("requires the reachable page to contain the privacy policy disclosures", () => {
    expect(
      privacyPolicyUrlResponseError({
        ok: true,
        status: 200,
        text: "Welcome to our product."
      })
    ).toBe("Chrome Web Store privacy policy URL must be reachable and point to the privacy policy.");
  });

  it("accepts a reachable privacy policy page with audio and Limited Use disclosures", () => {
    expect(
      privacyPolicyUrlResponseError({
        ok: true,
        status: 200,
        text: "隐私政策：用户主动点击后才处理音频。Limited Use: 数据只用于实时翻译、配音、计费和故障诊断。"
      })
    ).toBeUndefined();
  });
});
