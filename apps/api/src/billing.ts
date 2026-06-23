import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Entitlement {
  plan: "trial" | "pro" | "business";
  remainingSeconds: number;
  maxConcurrentSessions: number;
}

export interface AccountStatus extends Entitlement {
  remainingMinutes: number;
  activeSessions: number;
  canStartSession: boolean;
  blockReason?: Exclude<BillingDecision, { ok: true }>["reason"];
}

export type BillingDecision =
  | { ok: true }
  | { ok: false; reason: "unknown_user" | "quota_exhausted" | "concurrency_limit" };

export interface BillingStore {
  canStartSession(userId: string): BillingDecision;
  reserveSession(userId: string, sessionId: string): void;
  releaseSession(userId: string, sessionId: string, usedSeconds: number): void;
  grantSeconds(userId: string, seconds: number, plan?: Entitlement["plan"]): void;
  getEntitlement(userId: string): Entitlement | undefined;
  getAccountStatus(userId: string): AccountStatus | undefined;
}

export function createInMemoryBillingStore(seed: Record<string, Entitlement> = {}): BillingStore {
  const entitlements = new Map<string, Entitlement>(
    Object.entries(seed).map(([userId, entitlement]) => [userId, { ...entitlement }])
  );
  return createBillingStore(entitlements);
}

export function createFileBillingStore(filePath: string, seed: Record<string, Entitlement> = {}): BillingStore {
  const entitlements = loadEntitlements(filePath, seed);
  const persist = () => writeJsonFile(filePath, serializeEntitlements(entitlements));
  if (!existsSync(filePath)) {
    persist();
  }
  return createBillingStore(entitlements, persist);
}

function createBillingStore(entitlements: Map<string, Entitlement>, persist?: () => void): BillingStore {
  const activeSessions = new Map<string, Set<string>>();

  return {
    canStartSession(userId: string): BillingDecision {
      const entitlement = entitlements.get(userId);
      if (!entitlement) {
        return { ok: false, reason: "unknown_user" };
      }
      if (entitlement.remainingSeconds <= 0) {
        return { ok: false, reason: "quota_exhausted" };
      }
      if ((activeSessions.get(userId)?.size ?? 0) >= entitlement.maxConcurrentSessions) {
        return { ok: false, reason: "concurrency_limit" };
      }
      return { ok: true };
    },
    reserveSession(userId: string, sessionId: string) {
      const sessions = activeSessions.get(userId) ?? new Set<string>();
      sessions.add(sessionId);
      activeSessions.set(userId, sessions);
    },
    releaseSession(userId: string, sessionId: string, usedSeconds: number) {
      activeSessions.get(userId)?.delete(sessionId);
      const entitlement = entitlements.get(userId);
      if (entitlement) {
        entitlement.remainingSeconds = Math.max(0, entitlement.remainingSeconds - Math.ceil(usedSeconds));
        persist?.();
      }
    },
    grantSeconds(userId: string, seconds: number, plan: Entitlement["plan"] = "pro") {
      const entitlement =
        entitlements.get(userId) ??
        ({
          plan,
          remainingSeconds: 0,
          maxConcurrentSessions: 1
        } satisfies Entitlement);

      entitlement.plan = plan;
      entitlement.remainingSeconds += Math.max(0, Math.ceil(seconds));
      entitlements.set(userId, entitlement);
      persist?.();
    },
    getEntitlement(userId: string) {
      const entitlement = entitlements.get(userId);
      return entitlement ? { ...entitlement } : undefined;
    },
    getAccountStatus(userId: string) {
      const entitlement = entitlements.get(userId);
      if (!entitlement) {
        return undefined;
      }
      const decision = this.canStartSession(userId);
      return {
        ...entitlement,
        remainingMinutes: Math.ceil(entitlement.remainingSeconds / 60),
        activeSessions: activeSessions.get(userId)?.size ?? 0,
        maxConcurrentSessions: entitlement.maxConcurrentSessions,
        canStartSession: decision.ok,
        blockReason: decision.ok ? undefined : decision.reason
      };
    }
  };
}

function loadEntitlements(filePath: string, seed: Record<string, Entitlement>): Map<string, Entitlement> {
  if (!existsSync(filePath)) {
    return new Map(Object.entries(seed).map(([userId, entitlement]) => [userId, { ...entitlement }]));
  }

  const parsed = readJsonFile<Record<string, Entitlement>>(filePath, "File-backed billing store");
  for (const [userId, entitlement] of Object.entries(parsed)) {
    if (!isEntitlement(entitlement)) {
      throw new Error(`File-backed billing store has invalid entitlement for ${userId}: ${filePath}`);
    }
  }
  return new Map(Object.entries(parsed).map(([userId, entitlement]) => [userId, { ...entitlement }]));
}

function serializeEntitlements(entitlements: Map<string, Entitlement>): Record<string, Entitlement> {
  return Object.fromEntries(
    [...entitlements.entries()].map(([userId, entitlement]) => [userId, { ...entitlement }])
  );
}

function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tempPath, filePath);
}

function readJsonFile<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} is not valid JSON: ${filePath}`);
    }
    throw error;
  }
}

function isEntitlement(value: unknown): value is Entitlement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entitlement = value as Partial<Entitlement>;
  return (
    (entitlement.plan === "trial" || entitlement.plan === "pro" || entitlement.plan === "business") &&
    typeof entitlement.remainingSeconds === "number" &&
    Number.isFinite(entitlement.remainingSeconds) &&
    entitlement.remainingSeconds >= 0 &&
    typeof entitlement.maxConcurrentSessions === "number" &&
    Number.isInteger(entitlement.maxConcurrentSessions) &&
    entitlement.maxConcurrentSessions > 0
  );
}
