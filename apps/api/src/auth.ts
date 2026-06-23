import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthConfig {
  devClientToken: string;
  devUserId: string;
  tokenSecret?: string;
  allowDevClientToken?: boolean;
}

export type AuthResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      reason: "missing_token" | "invalid_token" | "expired_token";
    };

export function authenticateToken(token: string | undefined, config: AuthConfig): AuthResult {
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }
  if (config.tokenSecret) {
    const signedResult = verifyClientToken(token, { secret: config.tokenSecret });
    if (signedResult.ok || signedResult.reason === "expired_token") {
      return signedResult;
    }
  }
  if (config.allowDevClientToken === false) {
    return { ok: false, reason: "invalid_token" };
  }
  if (token !== config.devClientToken) {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true, userId: config.devUserId };
}

export function extractTokenFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  return new URL(url, "http://localhost").searchParams.get("token") ?? undefined;
}

export interface IssueClientTokenOptions {
  userId: string;
  secret: string;
  expiresInSeconds: number;
  now?: number;
}

export interface VerifyClientTokenOptions {
  secret: string;
  now?: number;
}

export function issueClientToken({
  userId,
  secret,
  expiresInSeconds,
  now = Math.floor(Date.now() / 1000)
}: IssueClientTokenOptions): string {
  const payload = {
    sub: userId,
    exp: now + expiresInSeconds
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyClientToken(token: string, { secret, now = Math.floor(Date.now() / 1000) }: VerifyClientTokenOptions): AuthResult {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false, reason: "invalid_token" };
  }

  const expected = sign(encodedPayload, secret);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "invalid_token" };
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return { ok: false, reason: "invalid_token" };
  }
  if (payload.exp < now) {
    return { ok: false, reason: "expired_token" };
  }

  return { ok: true, userId: payload.sub };
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function parsePayload(encodedPayload: string): { sub: string; exp: number } | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return undefined;
    }
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return undefined;
  }
}
