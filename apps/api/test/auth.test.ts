import { describe, expect, it } from "vitest";
import {
  authenticateToken,
  extractTokenFromUrl,
  issueClientToken,
  verifyClientToken
} from "../src/auth";

describe("client authentication", () => {
  it("accepts a configured short-lived client token without exposing cloud keys", () => {
    expect(
      authenticateToken("dev-client-token", {
        devClientToken: "dev-client-token",
        devUserId: "user_1"
      })
    ).toEqual({ ok: true, userId: "user_1" });
  });

  it("rejects missing or unexpected tokens", () => {
    expect(authenticateToken(undefined, { devClientToken: "dev-client-token", devUserId: "user_1" })).toEqual({
      ok: false,
      reason: "missing_token"
    });
    expect(authenticateToken("wrong", { devClientToken: "dev-client-token", devUserId: "user_1" })).toEqual({
      ok: false,
      reason: "invalid_token"
    });
  });

  it("can disable the development token fallback for production traffic", () => {
    const signedToken = issueClientToken({
      userId: "user_1",
      secret: "test-secret",
      expiresInSeconds: 60
    });

    expect(
      authenticateToken("dev-client-token", {
        devClientToken: "dev-client-token",
        devUserId: "user_1",
        tokenSecret: "test-secret",
        allowDevClientToken: false
      })
    ).toEqual({ ok: false, reason: "invalid_token" });
    expect(
      authenticateToken(signedToken, {
        devClientToken: "dev-client-token",
        devUserId: "user_1",
        tokenSecret: "test-secret",
        allowDevClientToken: false
      })
    ).toEqual({ ok: true, userId: "user_1" });
  });

  it("extracts tokens from browser-compatible websocket URLs", () => {
    expect(extractTokenFromUrl("/v1/live?token=abc123")).toBe("abc123");
  });

  it("issues and verifies signed expiring client tokens", () => {
    const token = issueClientToken({
      userId: "user_1",
      secret: "test-secret",
      expiresInSeconds: 60,
      now: 1000
    });

    expect(verifyClientToken(token, { secret: "test-secret", now: 1050 })).toEqual({
      ok: true,
      userId: "user_1"
    });
  });

  it("rejects expired or tampered signed client tokens", () => {
    const token = issueClientToken({
      userId: "user_1",
      secret: "test-secret",
      expiresInSeconds: 60,
      now: 1000
    });
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "user_2", exp: 1060 }), "utf8").toString("base64url");
    const tampered = `${tamperedPayload}.${signature}`;

    expect(verifyClientToken(token, { secret: "test-secret", now: 1061 })).toEqual({
      ok: false,
      reason: "expired_token"
    });
    expect(verifyClientToken(tampered, { secret: "test-secret", now: 1050 })).toEqual({
      ok: false,
      reason: "invalid_token"
    });
  });
});
