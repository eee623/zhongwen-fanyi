import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createManualAcceptanceReportTemplate } from "./manualAcceptance";

export interface ManualAcceptanceReportWriteOptions {
  generatedAt?: string;
  force?: boolean;
}

export async function writeManualAcceptanceReportTemplate(
  outputPath: string,
  options: ManualAcceptanceReportWriteOptions = {}
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const report = createManualAcceptanceReportTemplate(options.generatedAt ?? new Date().toISOString());
  try {
    await writeFile(outputPath, report, {
      encoding: "utf8",
      flag: options.force ? "w" : "wx"
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Manual acceptance report already exists at ${outputPath}. Pass --force to overwrite it.`);
    }
    throw error;
  }
}
