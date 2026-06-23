import { checkProductionConfig } from "./productionConfigCheck.js";

type MaterialStatus = "configured" | "missing" | "placeholder" | "invalid";

interface LaunchMaterial {
  owner: string;
  material: string;
  envKeys: string[];
  why: string;
  invalidWhen?: (env: NodeJS.ProcessEnv) => boolean;
}

const launchMaterials: LaunchMaterial[] = [
  {
    owner: "Cloud AI",
    material: "`DASHSCOPE_API_KEY`",
    envKeys: ["DASHSCOPE_API_KEY"],
    why: "Connects the production API to Aliyun LiveTranslate without exposing the key to Chrome."
  },
  {
    owner: "Runtime",
    material: "`LIVE_TRANSLATE_MODE`",
    envKeys: ["LIVE_TRANSLATE_MODE"],
    why: "Production must use the real Aliyun path, not the mock translation service.",
    invalidWhen: (env) => env.LIVE_TRANSLATE_MODE === "mock"
  },
  {
    owner: "Auth",
    material: "`CLIENT_TOKEN_SECRET`",
    envKeys: ["CLIENT_TOKEN_SECRET"],
    why: "Signs short-lived browser WebSocket credentials after user login.",
    invalidWhen: (env) => hasValueShorterThan(env.CLIENT_TOKEN_SECRET, 32)
  },
  {
    owner: "Billing",
    material: "`BILLING_STORE_FILE`",
    envKeys: ["BILLING_STORE_FILE"],
    why: "Persists subscription minutes and session usage across API restarts."
  },
  {
    owner: "Billing",
    material: "`PAYMENT_LEDGER_FILE`",
    envKeys: ["PAYMENT_LEDGER_FILE"],
    why: "Persists processed payment IDs for idempotent Alipay and WeChat callbacks."
  },
  {
    owner: "Billing",
    material: "`PAYMENT_ORDER_STORE_FILE`",
    envKeys: ["PAYMENT_ORDER_STORE_FILE"],
    why: "Persists pending, paid, canceled, and expired checkout orders."
  },
  {
    owner: "Payments",
    material: "`PAYMENT_CHECKOUT_BASE_URL`",
    envKeys: ["PAYMENT_CHECKOUT_BASE_URL"],
    why: "Creates HTTPS checkout URLs for subscription orders.",
    invalidWhen: (env) => !isHttpsUrl(env.PAYMENT_CHECKOUT_BASE_URL)
  },
  {
    owner: "Payments",
    material: "`PAYMENT_STATUS_BASE_URL`",
    envKeys: ["PAYMENT_STATUS_BASE_URL"],
    why: "Creates signed HTTPS order status links for the popup and checkout site.",
    invalidWhen: (env) => !isHttpsUrl(env.PAYMENT_STATUS_BASE_URL)
  },
  {
    owner: "Payments",
    material: "`PAYMENT_CHECKOUT_TOKEN_SECRET`",
    envKeys: ["PAYMENT_CHECKOUT_TOKEN_SECRET"],
    why: "Signs read-only checkout status tokens so order status URLs cannot be forged.",
    invalidWhen: (env) => hasValueShorterThan(env.PAYMENT_CHECKOUT_TOKEN_SECRET, 32)
  },
  {
    owner: "Payments",
    material: "`PAYMENT_VERIFICATION_MODE`",
    envKeys: ["PAYMENT_VERIFICATION_MODE"],
    why: "Forces production RSA/RSA2 and WeChat Pay API v3 webhook verification.",
    invalidWhen: (env) => env.PAYMENT_VERIFICATION_MODE !== "production"
  },
  {
    owner: "Payments",
    material: "`ALIPAY_PUBLIC_KEY_PEM` or `ALIPAY_PUBLIC_KEY_FILE`",
    envKeys: ["ALIPAY_PUBLIC_KEY_PEM", "ALIPAY_PUBLIC_KEY_FILE"],
    why: "Verifies Alipay asynchronous notifications before crediting minutes."
  },
  {
    owner: "Payments",
    material: "`WECHATPAY_PLATFORM_CERT_SERIAL`",
    envKeys: ["WECHATPAY_PLATFORM_CERT_SERIAL"],
    why: "Selects the WeChat Pay platform certificate used to verify callback signatures."
  },
  {
    owner: "Payments",
    material: "`WECHATPAY_PLATFORM_CERT_PEM` or `WECHATPAY_PLATFORM_CERT_FILE`",
    envKeys: ["WECHATPAY_PLATFORM_CERT_PEM", "WECHATPAY_PLATFORM_CERT_FILE"],
    why: "Provides the WeChat Pay platform certificate material for API v3 verification."
  },
  {
    owner: "Payments",
    material: "`WECHATPAY_API_V3_KEY`",
    envKeys: ["WECHATPAY_API_V3_KEY"],
    why: "Decrypts WeChat Pay API v3 notification resources after signature verification.",
    invalidWhen: (env) => hasValueWithByteLengthOtherThan(env.WECHATPAY_API_V3_KEY, 32)
  }
];

export function createProductionLaunchMaterialsReport(env: NodeJS.ProcessEnv = process.env): string {
  const configResult = checkProductionConfig(env);
  const rows = launchMaterials.map((material) => {
    const status = materialStatus(material, env);
    return `| ${material.owner} | ${material.material} | ${status} | ${material.why} |`;
  });

  return [
    "# Production Launch Materials",
    "",
    `Overall status: ${configResult.ok ? "READY" : "BLOCKED"}`,
    "",
    "| Owner | Env / Material | Status | Why it is required |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "No secret values are printed in this report.",
    "Run `npm run check:production-config` after filling these values.",
    ""
  ].join("\n");
}

function materialStatus(material: LaunchMaterial, env: NodeJS.ProcessEnv): MaterialStatus {
  const values = material.envKeys.map((key) => env[key]?.trim()).filter((value): value is string => Boolean(value));
  if (values.length === 0) {
    return "missing";
  }
  if (values.some(isPlaceholderValue)) {
    return "placeholder";
  }
  if (material.invalidWhen?.(env)) {
    return "invalid";
  }
  return "configured";
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

function hasValueShorterThan(value: string | undefined, minimumBytes: number): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  return Buffer.byteLength(trimmed, "utf8") < minimumBytes;
}

function hasValueWithByteLengthOtherThan(value: string | undefined, expectedBytes: number): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  return Buffer.byteLength(trimmed, "utf8") !== expectedBytes;
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
