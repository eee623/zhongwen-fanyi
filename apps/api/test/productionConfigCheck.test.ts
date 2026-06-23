import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "../src/productionConfigCheck";

describe("production configuration release check", () => {
  it("reports every release-critical production config blocker without using development fallbacks", () => {
    const result = checkProductionConfig({
      LIVE_TRANSLATE_MODE: "mock"
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [
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
      ]
    });
  });

  it("passes when the production API has persistent stores, HTTPS payment URLs, and payment verification material", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-production-check-"));
    try {
      const result = checkProductionConfig({
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

      expect(result).toEqual({
        ok: true,
        message: "Production API configuration gate passed."
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects placeholder production secrets and placeholder public URLs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-production-placeholder-check-"));
    try {
      const result = checkProductionConfig({
        DASHSCOPE_API_KEY: "replace-with-your-dashscope-api-key",
        CLIENT_TOKEN_SECRET: "change-me-to-a-long-random-signing-secret",
        BILLING_STORE_FILE: join(tempDir, "billing.json"),
        PAYMENT_LEDGER_FILE: join(tempDir, "payment-ledger.json"),
        PAYMENT_ORDER_STORE_FILE: join(tempDir, "payment-orders.json"),
        PAYMENT_CHECKOUT_BASE_URL: "https://your-domain.example/pay",
        PAYMENT_STATUS_BASE_URL: "https://api.your-domain.example",
        PAYMENT_CHECKOUT_TOKEN_SECRET: "change-me-to-a-long-random-checkout-status-secret",
        PAYMENT_VERIFICATION_MODE: "production",
        ALIPAY_PUBLIC_KEY_PEM: "-----BEGIN PUBLIC KEY-----\nalipay\n-----END PUBLIC KEY-----\n",
        WECHATPAY_PLATFORM_CERT_SERIAL: "replace-with-your-wechat-platform-certificate-serial",
        WECHATPAY_PLATFORM_CERT_PEM: "-----BEGIN PUBLIC KEY-----\nwechat\n-----END PUBLIC KEY-----\n",
        WECHATPAY_API_V3_KEY: "replace-with-your-32-byte-wechatpay-api-v3-key"
      });

      expect(result).toMatchObject({
        ok: false,
        errors: [
          "DASHSCOPE_API_KEY must not be a placeholder",
          "CLIENT_TOKEN_SECRET must not be a placeholder",
          "PAYMENT_CHECKOUT_BASE_URL must not use a placeholder domain",
          "PAYMENT_STATUS_BASE_URL must not use a placeholder domain",
          "PAYMENT_CHECKOUT_TOKEN_SECRET must not be a placeholder",
          "WECHATPAY_PLATFORM_CERT_SERIAL must not be a placeholder",
          "WECHATPAY_API_V3_KEY must not be a placeholder"
        ]
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects a WeChat Pay APIv3 key that is not exactly 32 bytes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-production-wechat-key-check-"));
    try {
      const result = checkProductionConfig({
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
        WECHATPAY_API_V3_KEY: "too-short"
      });

      expect(result).toMatchObject({
        ok: false,
        errors: ["WECHATPAY_API_V3_KEY must be exactly 32 bytes"]
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects production signing secrets shorter than 32 bytes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-production-short-secret-check-"));
    try {
      const result = checkProductionConfig({
        DASHSCOPE_API_KEY: "dashscope-key",
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
        WECHATPAY_API_V3_KEY: "12345678901234567890123456789012"
      });

      expect(result).toMatchObject({
        ok: false,
        errors: [
          "CLIENT_TOKEN_SECRET must be at least 32 bytes",
          "PAYMENT_CHECKOUT_TOKEN_SECRET must be at least 32 bytes"
        ]
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
