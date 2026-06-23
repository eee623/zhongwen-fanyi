export interface PublicSiteReleaseUrls {
  publicBaseUrl: string;
  privacyPolicyUrl: string;
  paymentCheckoutBaseUrl: string;
}

export function createPublicSiteReleaseUrls(publicBaseUrl: string): PublicSiteReleaseUrls {
  const base = parsePublicBaseUrl(publicBaseUrl);
  const normalizedBase = base.toString().replace(/\/+$/, "");

  return {
    publicBaseUrl: normalizedBase,
    privacyPolicyUrl: `${normalizedBase}/privacy/`,
    paymentCheckoutBaseUrl: `${normalizedBase}/pay/`
  };
}

export function publicSiteReleaseEnv(urls: PublicSiteReleaseUrls): string {
  return [
    `PUBLIC_SITE_BASE_URL=${urls.publicBaseUrl} npm run build:public-site`,
    `CHROME_STORE_PRIVACY_POLICY_URL=${urls.privacyPolicyUrl} npm run check:chrome-store`,
    `CHROME_STORE_PRIVACY_POLICY_URL=${urls.privacyPolicyUrl} npm run package:chrome-store`,
    `PAYMENT_CHECKOUT_BASE_URL=${urls.paymentCheckoutBaseUrl}`
  ].join("\n");
}

function parsePublicBaseUrl(value: string): URL {
  const trimmed = value.trim();
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Public site base URL must be a valid public HTTPS URL.");
  }

  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) {
    throw new Error("Public site base URL must be a valid public HTTPS URL.");
  }

  if (isPlaceholderHostname(url.hostname)) {
    throw new Error("Public site base URL must not use a placeholder domain.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error("Public site base URL must point to the product site root.");
  }
  url.pathname = "";

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
