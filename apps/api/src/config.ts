import { readFileSync } from "node:fs";
import { createFileBillingStore, createInMemoryBillingStore, type BillingStore } from "./billing.js";
import type { AuthConfig } from "./auth.js";
import { createInMemoryLatencyStore, type LatencyStore } from "./latencyStats.js";
import {
  createFilePaymentLedger,
  createFilePaymentOrderStore,
  createInMemoryPaymentLedger,
  type PaymentLedger,
  type PaymentOrderStore,
  type PaymentVerificationConfig
} from "./payments.js";

export interface ApiConfig {
  port: number;
  aliApiKey: string;
  aliEndpoint: string;
  liveTranslateMode: "aliyun" | "mock";
  clientTokenTtlSeconds: number;
  now: () => number;
  auth: AuthConfig;
  latencyStore: LatencyStore;
  billingStore: BillingStore;
  paymentLedger?: PaymentLedger;
  paymentOrderStore?: PaymentOrderStore;
  paymentCheckoutBaseUrl?: string;
  paymentStatusBaseUrl?: string;
  paymentCheckoutTokenSecret?: string;
  paymentWebhookSecret?: string;
  paymentVerification?: PaymentVerificationConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const devUserId = env.DEV_USER_ID ?? "user_1";
  const isProduction = isProductionRuntime(env);
  const seedEntitlements = {
    [devUserId]: {
      plan: "pro",
      remainingSeconds: Number.parseInt(env.DEV_REMAINING_SECONDS ?? "3600", 10),
      maxConcurrentSessions: Number.parseInt(env.DEV_MAX_CONCURRENT_SESSIONS ?? "1", 10)
    }
  } as const;

  const config: ApiConfig = {
    port: Number.parseInt(env.PORT ?? "8787", 10),
    aliApiKey: env.DASHSCOPE_API_KEY ?? "",
    aliEndpoint: env.ALI_LIVE_TRANSLATE_ENDPOINT ?? "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    liveTranslateMode: env.LIVE_TRANSLATE_MODE === "mock" ? "mock" : "aliyun",
    clientTokenTtlSeconds: Number.parseInt(env.CLIENT_TOKEN_TTL_SECONDS ?? "900", 10),
    now: Date.now,
    auth: {
      devClientToken: env.DEV_CLIENT_TOKEN ?? "dev-client-token",
      devUserId,
      tokenSecret: env.CLIENT_TOKEN_SECRET,
      allowDevClientToken: !isProduction
    },
    paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET,
    paymentVerification: loadPaymentVerificationConfig(env),
    paymentLedger: env.PAYMENT_LEDGER_FILE
      ? createFilePaymentLedger(env.PAYMENT_LEDGER_FILE)
      : createInMemoryPaymentLedger(),
    paymentOrderStore: env.PAYMENT_ORDER_STORE_FILE ? createFilePaymentOrderStore(env.PAYMENT_ORDER_STORE_FILE) : undefined,
    paymentCheckoutBaseUrl: env.PAYMENT_CHECKOUT_BASE_URL,
    paymentStatusBaseUrl: env.PAYMENT_STATUS_BASE_URL,
    paymentCheckoutTokenSecret: env.PAYMENT_CHECKOUT_TOKEN_SECRET,
    latencyStore: createInMemoryLatencyStore(),
    billingStore: env.BILLING_STORE_FILE
      ? createFileBillingStore(env.BILLING_STORE_FILE, seedEntitlements)
      : createInMemoryBillingStore(seedEntitlements)
  };

  if (isProduction) {
    validateProductionConfig(env, config);
  }

  return config;
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || env.API_ENV === "production";
}

function validateProductionConfig(env: NodeJS.ProcessEnv, config: ApiConfig): void {
  const errors: string[] = [];

  if (!config.aliApiKey.trim()) {
    errors.push("DASHSCOPE_API_KEY is required");
  } else if (isPlaceholderValue(config.aliApiKey)) {
    errors.push("DASHSCOPE_API_KEY must not be a placeholder");
  }
  if (config.liveTranslateMode === "mock") {
    errors.push("LIVE_TRANSLATE_MODE=mock is not allowed");
  }
  if (!config.auth.tokenSecret?.trim()) {
    errors.push("CLIENT_TOKEN_SECRET is required");
  } else if (isPlaceholderValue(config.auth.tokenSecret)) {
    errors.push("CLIENT_TOKEN_SECRET must not be a placeholder");
  } else if (!isAtLeastBytes(config.auth.tokenSecret, 32)) {
    errors.push("CLIENT_TOKEN_SECRET must be at least 32 bytes");
  }
  if (!env.BILLING_STORE_FILE?.trim()) {
    errors.push("BILLING_STORE_FILE is required");
  }
  if (!env.PAYMENT_LEDGER_FILE?.trim()) {
    errors.push("PAYMENT_LEDGER_FILE is required");
  }
  if (!env.PAYMENT_ORDER_STORE_FILE?.trim()) {
    errors.push("PAYMENT_ORDER_STORE_FILE is required");
  }
  if (!isHttpsUrl(config.paymentCheckoutBaseUrl)) {
    errors.push("PAYMENT_CHECKOUT_BASE_URL must be an HTTPS URL");
  } else if (usesPlaceholderHostname(config.paymentCheckoutBaseUrl)) {
    errors.push("PAYMENT_CHECKOUT_BASE_URL must not use a placeholder domain");
  }
  if (!isHttpsUrl(config.paymentStatusBaseUrl)) {
    errors.push("PAYMENT_STATUS_BASE_URL must be an HTTPS URL");
  } else if (usesPlaceholderHostname(config.paymentStatusBaseUrl)) {
    errors.push("PAYMENT_STATUS_BASE_URL must not use a placeholder domain");
  }
  if (!config.paymentCheckoutTokenSecret?.trim()) {
    errors.push("PAYMENT_CHECKOUT_TOKEN_SECRET is required");
  } else if (isPlaceholderValue(config.paymentCheckoutTokenSecret)) {
    errors.push("PAYMENT_CHECKOUT_TOKEN_SECRET must not be a placeholder");
  } else if (!isAtLeastBytes(config.paymentCheckoutTokenSecret, 32)) {
    errors.push("PAYMENT_CHECKOUT_TOKEN_SECRET must be at least 32 bytes");
  }
  if (config.paymentVerification?.mode !== "production") {
    errors.push("PAYMENT_VERIFICATION_MODE=production is required");
  }
  if (!config.paymentVerification?.alipayPublicKeyPem?.trim()) {
    errors.push("ALIPAY_PUBLIC_KEY_PEM or ALIPAY_PUBLIC_KEY_FILE is required");
  }
  if (!hasWechatPlatformCertificate(config.paymentVerification?.wechatPlatformCertificates)) {
    errors.push("WECHATPAY_PLATFORM_CERT_SERIAL with WECHATPAY_PLATFORM_CERT_PEM or WECHATPAY_PLATFORM_CERT_FILE is required");
  } else if (env.WECHATPAY_PLATFORM_CERT_SERIAL && isPlaceholderValue(env.WECHATPAY_PLATFORM_CERT_SERIAL)) {
    errors.push("WECHATPAY_PLATFORM_CERT_SERIAL must not be a placeholder");
  }
  if (!config.paymentVerification?.wechatApiV3Key?.trim()) {
    errors.push("WECHATPAY_API_V3_KEY is required");
  } else if (isPlaceholderValue(config.paymentVerification.wechatApiV3Key)) {
    errors.push("WECHATPAY_API_V3_KEY must not be a placeholder");
  } else if (!isExactlyBytes(config.paymentVerification.wechatApiV3Key, 32)) {
    errors.push("WECHATPAY_API_V3_KEY must be exactly 32 bytes");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production API configuration: ${errors.join(" ")}`);
  }
}

function hasWechatPlatformCertificate(certificates: Record<string, string> | undefined): boolean {
  return Boolean(certificates && Object.values(certificates).some((certificate) => certificate.trim()));
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function usesPlaceholderHostname(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    return isPlaceholderValue(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isAtLeastBytes(value: string, minimumBytes: number): boolean {
  return Buffer.byteLength(value, "utf8") >= minimumBytes;
}

function isExactlyBytes(value: string, expectedBytes: number): boolean {
  return Buffer.byteLength(value, "utf8") === expectedBytes;
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("replace-with") ||
    normalized.includes("change-me") ||
    normalized.includes("placeholder") ||
    normalized.includes("your-domain") ||
    normalized.includes("example.com") ||
    normalized.endsWith(".example")
  );
}

function loadPaymentVerificationConfig(env: NodeJS.ProcessEnv): PaymentVerificationConfig {
  const alipayPublicKeyPem = env.ALIPAY_PUBLIC_KEY_PEM ?? readOptionalTextFile(env.ALIPAY_PUBLIC_KEY_FILE);
  const wechatPlatformCertificatePem =
    env.WECHATPAY_PLATFORM_CERT_PEM ?? readOptionalTextFile(env.WECHATPAY_PLATFORM_CERT_FILE);
  const wechatPlatformCertificates =
    env.WECHATPAY_PLATFORM_CERT_SERIAL && wechatPlatformCertificatePem
      ? {
          [env.WECHATPAY_PLATFORM_CERT_SERIAL]: wechatPlatformCertificatePem
        }
      : undefined;

  return {
    mode: env.PAYMENT_VERIFICATION_MODE === "production" ? "production" : "development",
    alipayPublicKeyPem,
    wechatPlatformCertificates,
    wechatApiV3Key: env.WECHATPAY_API_V3_KEY
  };
}

function readOptionalTextFile(path: string | undefined): string | undefined {
  return path ? readFileSync(path, "utf8") : undefined;
}
