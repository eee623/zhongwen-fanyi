import { resolve } from "node:path";
import { writeManualAcceptanceReportTemplate } from "../apps/extension/src/manualAcceptanceWriter";

const args = process.argv.slice(2);
const force = args.includes("--force");
const explicitPath = args.find((arg) => arg !== "--force");
const outputPath = resolve(process.cwd(), explicitPath ?? "docs/manual-acceptance-report.md");

await writeManualAcceptanceReportTemplate(outputPath, {
  force
});
console.log(
  force
    ? `Manual acceptance report template written to ${outputPath}`
    : `Manual acceptance report template written to ${outputPath}. Existing reports are not overwritten without --force.`
);
