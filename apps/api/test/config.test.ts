import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("API configuration", () => {
  it("uses file-backed billing and payment stores when paths are configured", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-config-"));
    try {
      const billingStoreFile = join(tempDir, "billing.json");
      const paymentLedgerFile = join(tempDir, "payment-ledger.json");
      const paymentOrderStoreFile = join(tempDir, "payment-orders.json");
      const env = {
        DEV_USER_ID: "user_1",
        DEV_REMAINING_SECONDS: "30",
        DEV_MAX_CONCURRENT_SESSIONS: "2",
        BILLING_STORE_FILE: billingStoreFile,
        PAYMENT_LEDGER_FILE: paymentLedgerFile,
        PAYMENT_ORDER_STORE_FILE: paymentOrderStoreFile,
        PAYMENT_CHECKOUT_BASE_URL: "https://checkout.example.com/pay"
      } satisfies NodeJS.ProcessEnv;

      const first = loadConfig(env);
      first.billingStore.grantSeconds("user_1", 90, "business");
      first.paymentLedger?.markProcessed("alipay", "pay_1");
      expect(first.paymentOrderStore?.getOrder("sub_1")).toBeUndefined();

      const second = loadConfig(env);

      expect(second.billingStore.getEntitlement("user_1")).toEqual({
        plan: "business",
        remainingSeconds: 120,
        maxConcurrentSessions: 2
      });
      expect(second.paymentLedger?.hasProcessed("alipay", "pay_1")).toBe(true);
      expect(second.paymentOrderStore?.getOrder("sub_1")).toBeUndefined();
      expect(second.paymentCheckoutBaseUrl).toBe("https://checkout.example.com/pay");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads production payment verification PEM files from the environment", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-payment-config-"));
    try {
      const alipayPublicKeyFile = join(tempDir, "alipay-public.pem");
      const wechatPlatformCertFile = join(tempDir, "wechat-platform.pem");
      writeFileSync(alipayPublicKeyFile, "-----BEGIN PUBLIC KEY-----\nalipay\n-----END PUBLIC KEY-----\n");
      writeFileSync(wechatPlatformCertFile, "-----BEGIN PUBLIC KEY-----\nwechat\n-----END PUBLIC KEY-----\n");

      const config = loadConfig({
        PAYMENT_VERIFICATION_MODE: "production",
        ALIPAY_PUBLIC_KEY_FILE: alipayPublicKeyFile,
        WECHATPAY_PLATFORM_CERT_SERIAL: "wechat_serial_1",
        WECHATPAY_PLATFORM_CERT_FILE: wechatPlatformCertFile,
        WECHATPAY_API_V3_KEY: "12345678901234567890123456789012"
      });

      expect(config.paymentVerification).toEqual({
        mode: "production",
        alipayPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nalipay\n-----END PUBLIC KEY-----\n",
        wechatPlatformCertificates: {
          wechat_serial_1: "-----BEGIN PUBLIC KEY-----\nwechat\n-----END PUBLIC KEY-----\n"
        },
        wechatApiV3Key: "12345678901234567890123456789012"
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects production runtime when release-critical credentials or stores are missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        LIVE_TRANSLATE_MODE: "mock"
      })
    ).toThrowError(
      [
        "Invalid production API configuration:",
        "DASHSCOPE_API_KEY is required",
        "LIVE_TRANSLATE_MODE=mock is not allowed",
        "CLIENT_TOKEN_SECRET is required",
        "BILLING_STORE_FILE is required",
        "PAYMENT_LEDGER_FILE is required",
        "PAYMENT_ORDER_STORE_FILE is required",
        "PAYMENT_CHECKOUT_BASE_URL must be an HTTPS URL",
        "PAYMENT_STATUS_BASE_URL must be an HTTPS URL",
        "PAYMENT_CHECKOUT_TOKEN_SECRET is required",
        "PAYMENT_VERIFICATION_MODE=production is required",
        "ALIPAY_PUBLIC_KEY_PEM or ALIPAY_PUBLIC_KEY_FILE is required",
        "WECHATPAY_PLATFORM_CERT_SERIAL with WECHATPAY_PLATFORM_CERT_PEM or WECHATPAY_PLATFORM_CERT_FILE is required",
        "WECHATPAY_API_V3_KEY is required"
      ].join(" ")
    );
  });

  it("disables development token fallback when the API runs in production", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-production-config-"));
    try {
      const config = loadConfig({
        NODE_ENV: "production",
        DASHSCOPE_API_KEY: "dashscope-key",
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

      expect(config.auth.allowDevClientToken).toBe(false);
      expect(config.liveTranslateMode).toBe("aliyun");
      expect(config.paymentVerification?.mode).toBe("production");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
