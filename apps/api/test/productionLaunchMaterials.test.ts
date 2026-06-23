import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionLaunchMaterialsReport } from "../src/productionLaunchMaterials";

describe("production launch materials report", () => {
  it("turns production config blockers into an owner-oriented launch checklist", () => {
    const report = createProductionLaunchMaterialsReport({
      LIVE_TRANSLATE_MODE: "mock",
      DASHSCOPE_API_KEY: "sk-live-secret-that-must-not-print",
      CLIENT_TOKEN_SECRET: "change-me-client-secret"
    });

    expect(report).toContain("# Production Launch Materials");
    expect(report).toContain("| Owner | Env / Material | Status | Why it is required |");
    expect(report).toContain("| Cloud AI | `DASHSCOPE_API_KEY` | configured |");
    expect(report).toContain("| Auth | `CLIENT_TOKEN_SECRET` | placeholder |");
    expect(report).toContain("| Runtime | `LIVE_TRANSLATE_MODE` | invalid |");
    expect(report).toContain("| Billing | `BILLING_STORE_FILE` | missing |");
    expect(report).toContain("| Payments | `ALIPAY_PUBLIC_KEY_PEM` or `ALIPAY_PUBLIC_KEY_FILE` | missing |");
    expect(report).toContain("| Payments | `WECHATPAY_API_V3_KEY` | missing |");
    expect(report).toContain("Run `npm run check:production-config` after filling these values.");
    expect(report).not.toContain("sk-live-secret-that-must-not-print");
  });

  it("marks a complete production configuration as ready without printing secret values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-materials-"));
    try {
      const report = createProductionLaunchMaterialsReport({
        LIVE_TRANSLATE_MODE: "aliyun",
        DASHSCOPE_API_KEY: "sk-live-secret-that-must-not-print",
        CLIENT_TOKEN_SECRET: "client-token-secret-32-bytes-long",
        BILLING_STORE_FILE: join(tempDir, "billing.json"),
        PAYMENT_LEDGER_FILE: join(tempDir, "payment-ledger.json"),
        PAYMENT_ORDER_STORE_FILE: join(tempDir, "payment-orders.json"),
        PAYMENT_CHECKOUT_BASE_URL: "https://realtimedubbing.cn/pay",
        PAYMENT_STATUS_BASE_URL: "https://api.realtimedubbing.cn",
        PAYMENT_CHECKOUT_TOKEN_SECRET: "checkout-token-secret-32-bytes-ok",
        PAYMENT_VERIFICATION_MODE: "production",
        ALIPAY_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nalipay\n-----END PUBLIC KEY-----\n",
        WECHATPAY_PLATFORM_CERT_SERIAL: "wechat_serial_1",
        WECHATPAY_PLATFORM_CERT_PEM: "-----BEGIN PUBLIC KEY-----\nwechat\n-----END PUBLIC KEY-----\n",
        WECHATPAY_API_V3_KEY: "12345678901234567890123456789012"
      });

      expect(report).toContain("Overall status: READY");
      expect(report).toContain("| Cloud AI | `DASHSCOPE_API_KEY` | configured |");
      expect(report).not.toContain("sk-live-secret-that-must-not-print");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("marks short signing secrets and an invalid WeChat Pay APIv3 key as invalid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-short-materials-"));
    try {
      const report = createProductionLaunchMaterialsReport({
        LIVE_TRANSLATE_MODE: "aliyun",
        DASHSCOPE_API_KEY: "sk-live-secret-that-must-not-print",
        CLIENT_TOKEN_SECRET: "short-client-secret",
        BILLING_STORE_FILE: join(tempDir, "billing.json"),
        PAYMENT_LEDGER_FILE: join(tempDir, "payment-ledger.json"),
        PAYMENT_ORDER_STORE_FILE: join(tempDir, "payment-orders.json"),
        PAYMENT_CHECKOUT_BASE_URL: "https://realtimedubbing.cn/pay",
        PAYMENT_STATUS_BASE_URL: "https://api.realtimedubbing.cn",
        PAYMENT_CHECKOUT_TOKEN_SECRET: "short-checkout-secret",
        PAYMENT_VERIFICATION_MODE: "production",
        ALIPAY_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nalipay\n-----END PUBLIC KEY-----\n",
        WECHATPAY_PLATFORM_CERT_SERIAL: "wechat_serial_1",
        WECHATPAY_PLATFORM_CERT_PEM: "-----BEGIN PUBLIC KEY-----\nwechat\n-----END PUBLIC KEY-----\n",
        WECHATPAY_API_V3_KEY: "too-short"
      });

      expect(report).toContain("Overall status: BLOCKED");
      expect(report).toContain("| Auth | `CLIENT_TOKEN_SECRET` | invalid |");
      expect(report).toContain("| Payments | `PAYMENT_CHECKOUT_TOKEN_SECRET` | invalid |");
      expect(report).toContain("| Payments | `WECHATPAY_API_V3_KEY` | invalid |");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
