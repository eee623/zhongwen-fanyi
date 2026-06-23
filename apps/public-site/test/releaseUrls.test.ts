import { describe, expect, it } from "vitest";
import { createPublicSiteReleaseUrls, publicSiteReleaseEnv } from "../src/releaseUrls";

describe("public site release URLs", () => {
  it("creates Chrome Store and payment URLs from a public HTTPS product base URL", () => {
    const urls = createPublicSiteReleaseUrls("https://realtime-dubbing.netlify.app/");

    expect(urls).toEqual({
      publicBaseUrl: "https://realtime-dubbing.netlify.app",
      privacyPolicyUrl: "https://realtime-dubbing.netlify.app/privacy/",
      paymentCheckoutBaseUrl: "https://realtime-dubbing.netlify.app/pay/"
    });
    expect(publicSiteReleaseEnv(urls)).toContain(
      "CHROME_STORE_PRIVACY_POLICY_URL=https://realtime-dubbing.netlify.app/privacy/ npm run check:chrome-store"
    );
  });

  it("rejects non-public or placeholder release URLs", () => {
    expect(() => createPublicSiteReleaseUrls("http://realtime-dubbing.netlify.app")).toThrow("public HTTPS");
    expect(() => createPublicSiteReleaseUrls("https://localhost:3000")).toThrow("public HTTPS");
    expect(() => createPublicSiteReleaseUrls("https://your-domain.example")).toThrow("placeholder");
  });
});
