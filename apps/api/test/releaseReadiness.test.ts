import { describe, expect, it } from "vitest";
import {
  defaultReleaseGates,
  parseReleaseReadinessArgs,
  selectReleaseGates,
  summarizeReleaseReadiness
} from "../src/releaseReadiness";

describe("release readiness summary", () => {
  it("defines the required release gates for this MVP", () => {
    expect(defaultReleaseGates.map((gate) => gate.command)).toEqual([
      "npm test",
      "npm run typecheck",
      "npm run build",
      "npm run smoke:mock",
      "npm run check:latency-evidence",
      "npm run check:production-config",
      "npm run manual:acceptance-check",
      "npm run check:aliyun",
      "npm run smoke:aliyun:kpi",
      "npm run check:chrome-store"
    ]);
    expect(defaultReleaseGates.every((gate) => gate.required)).toBe(true);
  });

  it("can select a local-only release gate set without real Aliyun calls", () => {
    const gates = selectReleaseGates({ includeExternal: false });

    expect(gates.map((gate) => gate.command)).toEqual([
      "npm test",
      "npm run typecheck",
      "npm run build",
      "npm run smoke:mock",
      "npm run check:latency-evidence",
      "npm run check:production-config",
      "npm run manual:acceptance-check",
      "npm run check:chrome-store"
    ]);
    expect(gates.map((gate) => gate.id)).not.toContain("aliyun-preflight");
    expect(gates.map((gate) => gate.id)).not.toContain("aliyun-kpi");
  });

  it("keeps the full release gate set by default", () => {
    expect(selectReleaseGates().map((gate) => gate.id)).toEqual(defaultReleaseGates.map((gate) => gate.id));
  });

  it("parses release status flags for local-only checks", () => {
    expect(parseReleaseReadinessArgs(["--no-external"])).toEqual({ includeExternal: false, mode: "local-only" });
    expect(parseReleaseReadinessArgs(["--local-only"])).toEqual({ includeExternal: false, mode: "local-only" });
    expect(parseReleaseReadinessArgs([])).toEqual({ includeExternal: true, mode: "full" });
  });

  it("reports blockers for failed required release gates", () => {
    const summary = summarizeReleaseReadiness([
      {
        id: "unit-tests",
        label: "Unit tests",
        required: true,
        external: false,
        passed: true,
        command: "npm test"
      },
      {
        id: "chrome-store",
        label: "Chrome Web Store gate",
        required: true,
        external: false,
        passed: false,
        command: "npm run check:chrome-store",
        detail: "Chrome Web Store submission must include a public HTTPS privacy policy URL."
      },
      {
        id: "aliyun-kpi",
        label: "Aliyun one-second dubbing KPI",
        required: true,
        external: true,
        passed: false,
        command: "npm run smoke:aliyun:kpi",
        detail: "首音 P95 2497ms 高于 1000ms 目标"
      }
    ]);

    expect(summary).toEqual({
      ready: false,
      total: 3,
      passed: 1,
      failed: 2,
      blockers: [
        {
          id: "chrome-store",
          label: "Chrome Web Store gate",
          command: "npm run check:chrome-store",
          detail: "Chrome Web Store submission must include a public HTTPS privacy policy URL."
        },
        {
          id: "aliyun-kpi",
          label: "Aliyun one-second dubbing KPI",
          command: "npm run smoke:aliyun:kpi",
          detail: "首音 P95 2497ms 高于 1000ms 目标"
        }
      ],
      warnings: []
    });
  });

  it("adds remediation commands for known release blockers", () => {
    const summary = summarizeReleaseReadiness([
      {
        id: "production-config",
        label: "Production API configuration",
        required: true,
        external: false,
        passed: false,
        command: "npm run check:production-config",
        detail: "failed with exit 1 after 300ms"
      },
      {
        id: "latency-evidence",
        label: "Recorded Aliyun latency evidence",
        required: true,
        external: false,
        passed: false,
        command: "npm run check:latency-evidence",
        detail: "No recorded Aliyun translated-audio sample meets the one-second KPI."
      },
      {
        id: "manual-acceptance",
        label: "Manual Chrome acceptance report",
        required: true,
        external: false,
        passed: false,
        command: "npm run manual:acceptance-check",
        detail: "html5-mock must be marked as PASS."
      }
    ]);

    expect(summary.blockers).toEqual([
      expect.objectContaining({
        id: "production-config",
        remediation: "Run `npm run production:materials`, fill the missing production secrets and payment verification material, then rerun `npm run check:production-config`."
      }),
      expect.objectContaining({
        id: "latency-evidence",
        remediation: "Run `npm run smoke:aliyun:matrix:record` to collect fresh Aliyun latency evidence; if firstAudioP95Ms remains above 1000ms, keep this blocker open and use an alternate low-latency audio path."
      }),
      expect.objectContaining({
        id: "manual-acceptance",
        remediation: "Run `npm run manual:acceptance-template` only for a new report, or `npm run manual:acceptance-template -- --force` to intentionally reset it; complete real Chrome popup checks, replace every TODO, mark each scenario PASS, then rerun `npm run manual:acceptance-check`."
      })
    ]);
  });

  it("keeps failed optional gates as warnings without blocking release readiness", () => {
    const summary = summarizeReleaseReadiness([
      {
        id: "manual-chrome",
        label: "Manual Chrome walkthrough",
        required: false,
        external: false,
        passed: false,
        command: "npm run manual:mock",
        detail: "Manual check not run."
      }
    ]);

    expect(summary).toEqual({
      ready: true,
      total: 1,
      passed: 0,
      failed: 1,
      blockers: [],
      warnings: [
        {
          id: "manual-chrome",
          label: "Manual Chrome walkthrough",
          command: "npm run manual:mock",
          detail: "Manual check not run."
        }
      ]
    });
  });
});
