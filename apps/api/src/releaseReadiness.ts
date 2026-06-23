export interface ReleaseGate {
  id: string;
  label: string;
  command: string;
  required: boolean;
  external: boolean;
}

export interface ReleaseGateResult extends ReleaseGate {
  passed: boolean;
  detail?: string;
}

export interface ReleaseReadinessIssue {
  id: string;
  label: string;
  command: string;
  detail?: string;
  remediation?: string;
}

export interface ReleaseReadinessSummary {
  ready: boolean;
  total: number;
  passed: number;
  failed: number;
  blockers: ReleaseReadinessIssue[];
  warnings: ReleaseReadinessIssue[];
}

export interface ReleaseReadinessOptions {
  includeExternal: boolean;
}

export interface ReleaseReadinessCliOptions extends ReleaseReadinessOptions {
  mode: "full" | "local-only";
}

export const defaultReleaseGates: ReleaseGate[] = [
  {
    id: "unit-tests",
    label: "Unit and integration tests",
    command: "npm test",
    required: true,
    external: false
  },
  {
    id: "typecheck",
    label: "TypeScript typecheck",
    command: "npm run typecheck",
    required: true,
    external: false
  },
  {
    id: "build",
    label: "Production build",
    command: "npm run build",
    required: true,
    external: false
  },
  {
    id: "mock-smoke",
    label: "Mock realtime smoke",
    command: "npm run smoke:mock",
    required: true,
    external: false
  },
  {
    id: "latency-evidence",
    label: "Recorded Aliyun latency evidence",
    command: "npm run check:latency-evidence",
    required: true,
    external: false
  },
  {
    id: "production-config",
    label: "Production API configuration",
    command: "npm run check:production-config",
    required: true,
    external: false
  },
  {
    id: "manual-acceptance",
    label: "Manual Chrome acceptance report",
    command: "npm run manual:acceptance-check",
    required: true,
    external: false
  },
  {
    id: "aliyun-preflight",
    label: "Aliyun LiveTranslate preflight",
    command: "npm run check:aliyun",
    required: true,
    external: true
  },
  {
    id: "aliyun-kpi",
    label: "Aliyun one-second dubbing KPI",
    command: "npm run smoke:aliyun:kpi",
    required: true,
    external: true
  },
  {
    id: "chrome-store",
    label: "Chrome Web Store gate",
    command: "npm run check:chrome-store",
    required: true,
    external: false
  }
];

export function selectReleaseGates(options: Partial<ReleaseReadinessOptions> = {}): ReleaseGate[] {
  const includeExternal = options.includeExternal ?? true;
  return defaultReleaseGates.filter((gate) => includeExternal || !gate.external);
}

export function parseReleaseReadinessArgs(args: string[]): ReleaseReadinessCliOptions {
  const includeExternal = !args.includes("--no-external") && !args.includes("--local-only");
  return {
    includeExternal,
    mode: includeExternal ? "full" : "local-only"
  };
}

export function summarizeReleaseReadiness(results: ReleaseGateResult[]): ReleaseReadinessSummary {
  const failedResults = results.filter((result) => !result.passed);
  const blockers = failedResults.filter((result) => result.required).map(releaseIssueFromResult);
  const warnings = failedResults.filter((result) => !result.required).map(releaseIssueFromResult);

  return {
    ready: blockers.length === 0,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: failedResults.length,
    blockers,
    warnings
  };
}

function releaseIssueFromResult(result: ReleaseGateResult): ReleaseReadinessIssue {
  return {
    id: result.id,
    label: result.label,
    command: result.command,
    detail: result.detail,
    remediation: remediationForGate(result.id)
  };
}

function remediationForGate(id: string): string | undefined {
  switch (id) {
    case "production-config":
      return "Run `npm run production:materials`, fill the missing production secrets and payment verification material, then rerun `npm run check:production-config`.";
    case "latency-evidence":
      return "Run `npm run smoke:aliyun:matrix:record` to collect fresh Aliyun latency evidence; if firstAudioP95Ms remains above 1000ms, keep this blocker open and use an alternate low-latency audio path.";
    case "manual-acceptance":
      return "Run `npm run manual:acceptance-template` only for a new report, or `npm run manual:acceptance-template -- --force` to intentionally reset it; complete real Chrome popup checks, replace every TODO, mark each scenario PASS, then rerun `npm run manual:acceptance-check`.";
    default:
      return undefined;
  }
}
