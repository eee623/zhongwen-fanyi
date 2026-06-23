export interface PrivacyPolicyUrlResponse {
  ok: boolean;
  status: number;
  text: string;
}

const PRIVACY_POLICY_URL_ERROR = "Chrome Web Store privacy policy URL must be reachable and point to the privacy policy.";

export function shouldFetchPrivacyPolicyUrl(value: string | undefined): boolean {
  if (!value || /pending|todo|replace|your-domain/i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function privacyPolicyUrlResponseError(response: PrivacyPolicyUrlResponse): string | undefined {
  if (!response.ok || response.status < 200 || response.status >= 400) {
    return PRIVACY_POLICY_URL_ERROR;
  }

  const text = response.text.toLowerCase();
  const hasPrivacyPolicy = text.includes("隐私") || text.includes("privacy");
  const hasAudioDisclosure = text.includes("音频") || text.includes("audio");
  const hasLimitedUseDisclosure = text.includes("limited use");
  if (!hasPrivacyPolicy || !hasAudioDisclosure || !hasLimitedUseDisclosure) {
    return PRIVACY_POLICY_URL_ERROR;
  }

  return undefined;
}
