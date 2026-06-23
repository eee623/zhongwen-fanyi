import { describe, expect, it } from "vitest";
import { accountStartGate, accountStatusEndpointForLiveUrl, fetchAccountStatus } from "../src/accountStatus";

describe("extension account status", () => {
  it("maps live websocket URLs to the account status endpoint", () => {
    expect(accountStatusEndpointForLiveUrl("ws://localhost:8787/v1/live")).toBe(
      "http://localhost:8787/v1/account/status"
    );
    expect(accountStatusEndpointForLiveUrl("wss://api.example.com/v1/live?token=old")).toBe(
      "https://api.example.com/v1/account/status"
    );
  });

  it("fetches account status with the resolved session credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await fetchAccountStatus("ws://localhost:8787/v1/live", "session-credential", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          plan: "pro",
          remainingSeconds: 185,
          remainingMinutes: 4,
          maxConcurrentSessions: 2,
          activeSessions: 1,
          canStartSession: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    expect(result).toEqual({
      ok: true,
      status: {
        plan: "pro",
        remainingSeconds: 185,
        remainingMinutes: 4,
        maxConcurrentSessions: 2,
        activeSessions: 1,
        canStartSession: true
      }
    });
    expect(calls).toEqual([
      {
        url: "http://localhost:8787/v1/account/status",
        init: {
          method: "GET",
          headers: {
            authorization: "Bearer session-credential"
          }
        }
      }
    ]);
  });

  it("blocks starting when quota is exhausted or concurrency is full", () => {
    expect(
      accountStartGate({
        plan: "pro",
        remainingSeconds: 0,
        remainingMinutes: 0,
        maxConcurrentSessions: 1,
        activeSessions: 0,
        canStartSession: false,
        blockReason: "quota_exhausted"
      })
    ).toEqual({ ok: false, message: "额度已用完" });

    expect(
      accountStartGate({
        plan: "business",
        remainingSeconds: 600,
        remainingMinutes: 10,
        maxConcurrentSessions: 2,
        activeSessions: 2,
        canStartSession: false,
        blockReason: "concurrency_limit"
      })
    ).toEqual({ ok: false, message: "并发已满" });
  });

  it("allows starting when account status is healthy or not loaded yet", () => {
    expect(accountStartGate(undefined)).toEqual({ ok: true });
    expect(
      accountStartGate({
        plan: "pro",
        remainingSeconds: 600,
        remainingMinutes: 10,
        maxConcurrentSessions: 1,
        activeSessions: 0,
        canStartSession: true
      })
    ).toEqual({ ok: true });
  });
});
