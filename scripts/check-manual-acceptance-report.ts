import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateManualAcceptanceReport } from "../apps/extension/src/manualAcceptance";

const reportPath = resolve(process.cwd(), process.argv[2] ?? "docs/manual-acceptance-report.md");
const report = await readFile(reportPath, "utf8");
const result = validateManualAcceptanceReport(report);

if (result.ready) {
  console.log("Manual Chrome acceptance report passed.");
  process.exit(0);
}

for (const error of result.errors) {
  console.error(`[manual-acceptance error] ${error}`);
}
process.exit(1);
