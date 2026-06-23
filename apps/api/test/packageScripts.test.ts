import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("root package scripts", () => {
  it("provides a strict Aliyun KPI smoke gate for the one-second dubbing target", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["smoke:aliyun:kpi"]).toBe(
      "ALIYUN_SMOKE_RUNS=5 ALIYUN_SMOKE_STRICT_KPI=1 npm run smoke:aliyun"
    );
    expect(packageJson.scripts?.["check:latency-evidence"]).toBe(
      "tsx scripts/check-latency-evidence.ts docs/latency-evidence.jsonl"
    );
  });

  it("provides an Aliyun latency matrix command for comparing voice clone and chunking strategies", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["smoke:aliyun:matrix"]).toBe(
      "node --env-file=.env node_modules/.bin/tsx scripts/smoke-aliyun-latency-matrix.ts"
    );
    expect(packageJson.scripts?.["smoke:aliyun:matrix:record"]).toBe(
      "ALIYUN_MATRIX_RECORD_EVIDENCE=1 npm run smoke:aliyun:matrix"
    );
    expect(packageJson.scripts?.["smoke:aliyun:record"]).toBe(
      "ALIYUN_SMOKE_RECORD_EVIDENCE=1 npm run smoke:aliyun"
    );
  });

  it("provides a production API configuration release gate", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["check:production-config"]).toBe(
      "node --env-file=.env node_modules/.bin/tsx scripts/check-production-config.ts"
    );
    expect(packageJson.scripts?.["production:env:draft"]).toBe("tsx scripts/create-production-env-draft.ts");
    expect(packageJson.scripts?.["production:materials"]).toBe(
      "node --env-file=.env node_modules/.bin/tsx scripts/create-production-launch-materials.ts"
    );
  });

  it("provides manual Chrome acceptance report commands", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["manual:media-fixtures"]).toBe("tsx scripts/create-local-media-fixtures.ts");
    expect(packageJson.scripts?.["manual:acceptance-template"]).toBe(
      "tsx scripts/create-manual-acceptance-report.ts"
    );
    expect(packageJson.scripts?.["manual:acceptance-check"]).toBe(
      "tsx scripts/check-manual-acceptance-report.ts docs/manual-acceptance-report.md"
    );
  });

  it("provides a release readiness status command", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "../../package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["release:status"]).toBe(
      "node --env-file=.env node_modules/.bin/tsx scripts/release-readiness.ts"
    );
    expect(packageJson.scripts?.["release:status:local"]).toBe(
      "node --env-file=.env node_modules/.bin/tsx scripts/release-readiness.ts --no-external"
    );
  });
});
