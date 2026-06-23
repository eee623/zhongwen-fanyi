import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createProductionLaunchMaterialsReport } from "../apps/api/src/productionLaunchMaterials";

const outputPath = resolve(process.cwd(), process.argv[2] ?? "docs/production-launch-materials.md");
const report = createProductionLaunchMaterialsReport();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, report, "utf8");
console.log(`Production launch materials report written to ${outputPath}`);
