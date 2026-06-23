import { spawnSync } from "node:child_process";
import {
  defaultReleaseGates,
  parseReleaseReadinessArgs,
  selectReleaseGates,
  summarizeReleaseReadiness,
  type ReleaseGate,
  type ReleaseGateResult
} from "../apps/api/src/releaseReadiness";

const options = parseReleaseReadinessArgs(process.argv.slice(2));
const gates = selectReleaseGates(options);
const skippedExternal = defaultReleaseGates.filter((gate) => gate.external && !gates.includes(gate));

if (options.mode === "local-only") {
  console.log("[release status] local-only mode: skipping external Aliyun preflight and strict KPI calls.");
}

const results = gates.map(runGate);
const summary = summarizeReleaseReadiness(results);

console.log(
  JSON.stringify(
    {
      mode: options.mode,
      ready: summary.ready,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      skippedExternal: skippedExternal.map((gate) => ({
        id: gate.id,
        label: gate.label,
        command: gate.command
      })),
      blockers: summary.blockers,
      warnings: summary.warnings
    },
    null,
    2
  )
);

process.exit(summary.ready ? 0 : 1);

function runGate(gate: ReleaseGate): ReleaseGateResult {
  console.log(`\n[release gate] ${gate.label}`);
  console.log(`$ ${gate.command}`);
  const startedAt = Date.now();
  const result = spawnSync(gate.command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: "inherit"
  });
  const elapsedMs = Date.now() - startedAt;
  const passed = result.status === 0;

  return {
    ...gate,
    passed,
    detail: passed ? `passed in ${elapsedMs}ms` : `failed with exit ${result.status ?? "unknown"} after ${elapsedMs}ms`
  };
}
