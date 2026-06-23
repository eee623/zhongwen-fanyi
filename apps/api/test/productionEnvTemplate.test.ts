import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const templatePath = resolve(process.cwd(), "../../docs/production.env.example");

describe("production env template", () => {
  it("documents every variable required by the production configuration gate", async () => {
    const template = await readFile(templatePath, "utf8");
    const env = parseEnvTemplate(template);

    expect(env).toMatchObject({
      API_ENV: "production",
      LIVE_TRANSLATE_MODE: "aliyun",
      PAYMENT_VERIFICATION_MODE: "production"
    });
    expect(Object.keys(env)).toEqual(
      expect.arrayContaining([
        "DASHSCOPE_API_KEY",
        "CLIENT_TOKEN_SECRET",
        "BILLING_STORE_FILE",
        "PAYMENT_LEDGER_FILE",
        "PAYMENT_ORDER_STORE_FILE",
        "PAYMENT_CHECKOUT_BASE_URL",
        "PAYMENT_STATUS_BASE_URL",
        "PAYMENT_CHECKOUT_TOKEN_SECRET",
        "ALIPAY_PUBLIC_KEY_FILE",
        "WECHATPAY_PLATFORM_CERT_SERIAL",
        "WECHATPAY_PLATFORM_CERT_FILE",
        "WECHATPAY_API_V3_KEY",
        "CHROME_STORE_PRIVACY_POLICY_URL"
      ])
    );
  });

  it("uses placeholders instead of real production secrets", async () => {
    const template = await readFile(templatePath, "utf8");
    const env = parseEnvTemplate(template);
    const secretKeys = [
      "DASHSCOPE_API_KEY",
      "CLIENT_TOKEN_SECRET",
      "PAYMENT_CHECKOUT_TOKEN_SECRET",
      "ALIPAY_PUBLIC_KEY_FILE",
      "WECHATPAY_PLATFORM_CERT_FILE",
      "WECHATPAY_API_V3_KEY"
    ];

    for (const key of secretKeys) {
      expect(env[key]).toMatch(/your-|\.pem|change-me|replace/i);
    }
    expect(template).not.toMatch(/sk-[a-z0-9]{16,}/i);
    expect(template).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
  });
});

function parseEnvTemplate(template: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of template.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    env[trimmed.slice(0, equalsIndex)] = trimmed.slice(equalsIndex + 1);
  }
  return env;
}
