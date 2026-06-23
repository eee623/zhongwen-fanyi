import { describe, expect, it } from "vitest";
import {
  createProductionEnvDraft,
  createProductionEnvDraftFromPrivacyPolicyUrl,
  requiredSecretPlaceholders
} from "../src/productionEnvDraft";

describe("production env draft", () => {
  it("derives public-site and checkout URLs from the deployed privacy policy URL", () => {
    const draft = createProductionEnvDraftFromPrivacyPolicyUrl(
      "https://chrome-store--realtime-dubbing-cn.netlify.app/privacy/"
    );

    expect(draft.env).toContain("API_ENV=production");
    expect(draft.env).toContain("LIVE_TRANSLATE_MODE=aliyun");
    expect(draft.env).toContain("PUBLIC_SITE_BASE_URL=https://chrome-store--realtime-dubbing-cn.netlify.app");
    expect(draft.env).toContain(
      "CHROME_STORE_PRIVACY_POLICY_URL=https://chrome-store--realtime-dubbing-cn.netlify.app/privacy/"
    );
    expect(draft.env).toContain(
      "PAYMENT_CHECKOUT_BASE_URL=https://chrome-store--realtime-dubbing-cn.netlify.app/pay/"
    );
    expect(draft.env).toContain("PAYMENT_STATUS_BASE_URL=https://api.your-domain.example");
    expect(draft.requiredSecrets).toEqual(requiredSecretPlaceholders);
  });

  it("allows an explicit API base URL for signed payment order status links", () => {
    const draft = createProductionEnvDraft({
      publicBaseUrl: "https://chrome-store--realtime-dubbing-cn.netlify.app",
      apiBaseUrl: "https://api.realtimedubbing.cn"
    });

    expect(draft.env).toContain("PAYMENT_STATUS_BASE_URL=https://api.realtimedubbing.cn");
  });

  it("rejects privacy policy URLs that are not public HTTPS /privacy URLs", () => {
    expect(() => createProductionEnvDraftFromPrivacyPolicyUrl("http://localhost/privacy/")).toThrow("public HTTPS");
    expect(() => createProductionEnvDraftFromPrivacyPolicyUrl("https://example.com/privacy/")).toThrow("placeholder");
    expect(() => createProductionEnvDraftFromPrivacyPolicyUrl("https://realtime-dubbing-cn.netlify.app/pay/")).toThrow(
      "privacy"
    );
  });
});
