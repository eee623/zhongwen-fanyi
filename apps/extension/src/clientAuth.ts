type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CredentialResolution =
  | {
      ok: true;
      credential: string;
      source: "exchanged" | "fallback";
    }
  | {
      ok: false;
      error: string;
    };

export function clientCredentialEndpointForLiveUrl(liveUrl: string): string {
  const url = new URL(liveUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "/v1/auth/client-token";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function resolveSessionCredential(
  liveUrl: string,
  issuerCredential: string,
  fetchImpl: FetchLike = fetch
): Promise<CredentialResolution> {
  const trimmedCredential = issuerCredential.trim();
  if (!trimmedCredential) {
    return { ok: false, error: "请输入账号凭据" };
  }

  let response: Response;
  try {
    response = await fetchImpl(clientCredentialEndpointForLiveUrl(liveUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${trimmedCredential}`
      }
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "凭据换取失败" };
  }

  const body = await readJsonBody(response);
  if (response.status === 503 && body.error === "client_token_secret_not_configured") {
    return { ok: true, credential: trimmedCredential, source: "fallback" };
  }
  if (!response.ok) {
    return { ok: false, error: typeof body.error === "string" ? body.error : "凭据换取失败" };
  }
  if (typeof body.clientToken !== "string") {
    return { ok: false, error: "后端返回的凭据无效" };
  }

  return { ok: true, credential: body.clientToken, source: "exchanged" };
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
