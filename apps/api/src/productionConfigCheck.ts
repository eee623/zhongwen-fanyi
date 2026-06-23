import { loadConfig } from "./config.js";

export type ProductionConfigCheckResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      errors: string[];
      message: string;
    };

export function checkProductionConfig(env: NodeJS.ProcessEnv = process.env): ProductionConfigCheckResult {
  try {
    loadConfig({
      ...env,
      API_ENV: "production"
    });
    return {
      ok: true,
      message: "Production API configuration gate passed."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: productionErrorsFromMessage(message),
      message
    };
  }
}

function productionErrorsFromMessage(message: string): string[] {
  const prefix = "Invalid production API configuration: ";
  if (!message.startsWith(prefix)) {
    return [message];
  }

  return [
    "DASHSCOPE_API_KEY is required",
    "DASHSCOPE_API_KEY must not be a placeholder",
    "LIVE_TRANSLATE_MODE=mock is not allowed",
    "CLIENT_TOKEN_SECRET is required",
    "CLIENT_TOKEN_SECRET must not be a placeholder",
    "CLIENT_TOKEN_SECRET must be at least 32 bytes",
    "BILLING_STORE_FILE is required",
    "PAYMENT_LEDGER_FILE is required",
    "PAYMENT_ORDER_STORE_FILE is required",
    "PAYMENT_CHECKOUT_BASE_URL must be an HTTPS URL",
    "PAYMENT_CHECKOUT_BASE_URL must not use a placeholder domain",
    "PAYMENT_STATUS_BASE_URL must be an HTTPS URL",
    "PAYMENT_STATUS_BASE_URL must not use a placeholder domain",
    "PAYMENT_CHECKOUT_TOKEN_SECRET is required",
    "PAYMENT_CHECKOUT_TOKEN_SECRET must not be a placeholder",
    "PAYMENT_CHECKOUT_TOKEN_SECRET must be at least 32 bytes",
    "PAYMENT_VERIFICATION_MODE=production is required",
    "ALIPAY_PUBLIC_KEY_PEM or ALIPAY_PUBLIC_KEY_FILE is required",
    "WECHATPAY_PLATFORM_CERT_SERIAL with WECHATPAY_PLATFORM_CERT_PEM or WECHATPAY_PLATFORM_CERT_FILE is required",
    "WECHATPAY_PLATFORM_CERT_SERIAL must not be a placeholder",
    "WECHATPAY_API_V3_KEY is required",
    "WECHATPAY_API_V3_KEY must not be a placeholder",
    "WECHATPAY_API_V3_KEY must be exactly 32 bytes"
  ].filter((error) => message.includes(error));
}
