import { describe, expect, it } from "vitest";
import { clientCredentialEndpointForLiveUrl, resolveSessionCredential } from "../src/clientAuth";

describe("extension session credential exchange", () => {
  it("maps live websocket URLs to the HTTP credential endpoint", () => {
    expect(clientCredentialEndpointForLiveUrl("ws://localhost:8787/v1/live")).toBe(
      "http://localhost:8787/v1/auth/client-token"
    );
    expect(clientCredentialEndpointForLiveUrl("wss://api.example.com/v1/live?token=old")).toBe(
      "https://api.example.com/v1/auth/client-token"
    );
  });

  it("exchanges an issuer credential for a short-lived websocket credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await resolveSessionCredential("ws://localhost:8787/v1/live", "issuer-token", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          clientToken: "signed-client-token",
          tokenType: "Bearer",
          expiresInSeconds: 60
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    expect(result).toEqual({ ok: true, credential: "signed-client-token", source: "exchanged" });
    expect(calls).toEqual([
      {
        url: "http://localhost:8787/v1/auth/client-token",
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer issuer-token"
          }
        }
      }
    ]);
  });

  it("keeps using the provided credential when the local backend has no signing secret", async () => {
    const result = await resolveSessionCredential("ws://localhost:8787/v1/live", "dev-client-token", async () => {
      return new Response(JSON.stringify({ ok: false, error: "client_token_secret_not_configured" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    });

    expect(result).toEqual({ ok: true, credential: "dev-client-token", source: "fallback" });
  });
});
