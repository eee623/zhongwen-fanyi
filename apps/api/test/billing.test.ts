import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileBillingStore, createInMemoryBillingStore } from "../src/billing";

describe("billing entitlement store", () => {
  it("blocks translation sessions when paid minutes are exhausted", () => {
    const store = createInMemoryBillingStore({
      user_1: {
        plan: "pro",
        remainingSeconds: 30,
        maxConcurrentSessions: 1
      }
    });

    expect(store.canStartSession("user_1")).toEqual({ ok: true });
    store.reserveSession("user_1", "session_a");
    expect(store.canStartSession("user_1")).toEqual({
      ok: false,
      reason: "concurrency_limit"
    });
    store.releaseSession("user_1", "session_a", 31);
    expect(store.canStartSession("user_1")).toEqual({
      ok: false,
      reason: "quota_exhausted"
    });
  });

  it("reports the current account status for the popup", () => {
    const store = createInMemoryBillingStore({
      user_1: {
        plan: "business",
        remainingSeconds: 125,
        maxConcurrentSessions: 2
      }
    });

    store.reserveSession("user_1", "session_a");

    expect(store.getAccountStatus("user_1")).toEqual({
      plan: "business",
      remainingSeconds: 125,
      remainingMinutes: 3,
      maxConcurrentSessions: 2,
      activeSessions: 1,
      canStartSession: true
    });
  });

  it("persists paid minutes and deducted usage across store instances", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-billing-"));
    try {
      const storePath = join(tempDir, "billing.json");
      const first = createFileBillingStore(storePath, {
        user_1: {
          plan: "trial",
          remainingSeconds: 60,
          maxConcurrentSessions: 2
        }
      });

      first.grantSeconds("user_1", 120, "pro");
      first.reserveSession("user_1", "session_a");
      first.releaseSession("user_1", "session_a", 35);

      const second = createFileBillingStore(storePath);

      expect(second.getEntitlement("user_1")).toEqual({
        plan: "pro",
        remainingSeconds: 145,
        maxConcurrentSessions: 2
      });
      expect(second.canStartSession("user_1")).toEqual({ ok: true });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps active sessions in memory instead of restoring stale reservations", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-billing-"));
    try {
      const storePath = join(tempDir, "billing.json");
      const first = createFileBillingStore(storePath, {
        user_1: {
          plan: "pro",
          remainingSeconds: 300,
          maxConcurrentSessions: 1
        }
      });

      first.reserveSession("user_1", "session_a");

      expect(first.getAccountStatus("user_1")).toMatchObject({
        activeSessions: 1,
        canStartSession: false,
        blockReason: "concurrency_limit"
      });
      expect(createFileBillingStore(storePath).getAccountStatus("user_1")).toMatchObject({
        activeSessions: 0,
        canStartSession: true
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when the file-backed billing ledger is corrupt", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-billing-"));
    try {
      const storePath = join(tempDir, "billing.json");
      writeFileSync(storePath, "{not-json");

      expect(() => createFileBillingStore(storePath)).toThrowError(
        `File-backed billing store is not valid JSON: ${storePath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when the file-backed billing ledger has an invalid entitlement shape", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-billing-"));
    try {
      const storePath = join(tempDir, "billing.json");
      writeFileSync(
        storePath,
        JSON.stringify({
          user_1: {
            plan: "vip",
            remainingSeconds: "many",
            maxConcurrentSessions: 0
          }
        })
      );

      expect(() => createFileBillingStore(storePath)).toThrowError(
        `File-backed billing store has invalid entitlement for user_1: ${storePath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
