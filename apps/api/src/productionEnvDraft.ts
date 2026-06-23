export interface ProductionEnvDraftOptions {
  publicBaseUrl: string;
  apiBaseUrl?: string;
}

export interface ProductionEnvDraft {
  env: string;
  requiredSecrets: string[];
}

export const requiredSecretPlaceholders = [
  "DASHSCOPE_API_KEY",
  "CLIENT_TOKEN_SECRET",
  "PAYMENT_CHECKOUT_TOKEN_SECRET",
  "ALIPAY_PUBLIC_KEY_FILE",
  "WECHATPAY_PLATFORM_CERT_SERIAL",
  "WECHATPAY_PLATFORM_CERT_FILE",
  "WECHATPAY_API_V3_KEY"
];

export function createProductionEnvDraft(options: ProductionEnvDraftOptions): ProductionEnvDraft {
  const publicBase = parsePublicSiteRoot(options.publicBaseUrl);
  const apiBase = options.apiBaseUrl ? parsePublicApiRoot(options.apiBaseUrl) : "https://api.your-domain.example";
  const publicBaseText = publicBase.toString().replace(/\/+$/, "");

  return {
    env: [
      "# Production env draft for realtime dubbing.",
      "# Replace every change-me/replace-with value in your secret manager before launch.",
      "",
      "API_ENV=production",
      "LIVE_TRANSLATE_MODE=aliyun",
      "PORT=8787",
      "",
      "DASHSCOPE_API_KEY=replace-with-your-dashscope-api-key",
      "ALI_LIVE_TRANSLATE_ENDPOINT=wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      "",
      "CLIENT_TOKEN_SECRET=change-me-to-a-long-random-signing-secret",
      "CLIENT_TOKEN_TTL_SECONDS=900",
      "",
      "BILLING_STORE_FILE=/var/lib/realtime-dubbing/billing.json",
      "PAYMENT_LEDGER_FILE=/var/lib/realtime-dubbing/payment-ledger.json",
      "PAYMENT_ORDER_STORE_FILE=/var/lib/realtime-dubbing/payment-orders.json",
      "",
      `PUBLIC_SITE_BASE_URL=${publicBaseText}`,
      `CHROME_STORE_PRIVACY_POLICY_URL=${publicBaseText}/privacy/`,
      `PAYMENT_CHECKOUT_BASE_URL=${publicBaseText}/pay/`,
      `PAYMENT_STATUS_BASE_URL=${apiBase}`,
      "PAYMENT_CHECKOUT_TOKEN_SECRET=change-me-to-a-long-random-checkout-status-secret",
      "",
      "PAYMENT_VERIFICATION_MODE=production",
      "ALIPAY_PUBLIC_KEY_FILE=/etc/realtime-dubbing/alipay-public.pem",
      "WECHATPAY_PLATFORM_CERT_SERIAL=replace-with-your-wechat-platform-certificate-serial",
      "WECHATPAY_PLATFORM_CERT_FILE=/etc/realtime-dubbing/wechatpay-platform.pem",
      "WECHATPAY_API_V3_KEY=replace-with-your-32-byte-wechatpay-api-v3-key",
      ""
    ].join("\n"),
    requiredSecrets: requiredSecretPlaceholders
  };
}

export function createProductionEnvDraftFromPrivacyPolicyUrl(
  privacyPolicyUrl: string,
  apiBaseUrl?: string
): ProductionEnvDraft {
  const url = parsePublicHttpsUrl(privacyPolicyUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith("/privacy")) {
    throw new Error("Privacy policy URL must point to the public /privacy path.");
  }
  url.pathname = pathname.slice(0, -"/privacy".length) || "/";
  return createProductionEnvDraft({
    publicBaseUrl: url.toString(),
    apiBaseUrl
  });
}

function parsePublicSiteRoot(value: string): URL {
  const url = parsePublicHttpsUrl(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error("Public site base URL must point to the product site root.");
  }
  url.pathname = "/";
  return url;
}

function parsePublicApiRoot(value: string): string {
  const url = parsePublicHttpsUrl(value);
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/+$/, "");
}

function parsePublicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Production URL must be a valid public HTTPS URL.");
  }

  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) {
    throw new Error("Production URL must be a valid public HTTPS URL.");
  }
  if (isPlaceholderHostname(url.hostname)) {
    throw new Error("Production URL must not use a placeholder domain.");
  }
  url.hash = "";
  url.search = "";
  return url;
}

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".localhost")
  );
}

function isPlaceholderHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower.includes("example") || lower.includes("your-domain") || lower.includes("placeholder");
}
