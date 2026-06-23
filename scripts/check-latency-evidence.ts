import { readFile } from "node:fs/promises";
import { evaluateLatencyEvidenceGate, type LatencyEvidenceRecord } from "../apps/api/src/latencyEvidence";

const evidencePath = process.argv[2] ?? "docs/latency-evidence.jsonl";

try {
  const records = await readEvidence(evidencePath);
  const result = evaluateLatencyEvidenceGate(records);
  if (!result.ok) {
    console.error(`[latency-evidence error] ${result.reason}`);
    process.exit(1);
  }

  console.log("Recorded Aliyun translated-audio latency evidence passed.");
} catch (error) {
  console.error(`[latency-evidence error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function readEvidence(path: string): Promise<LatencyEvidenceRecord[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LatencyEvidenceRecord);
}
