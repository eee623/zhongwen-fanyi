import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { VoiceCloneFrequency } from "@realtime-dubbing/shared";
import type { RealtimeSmokeKpiEvaluation, RealtimeSmokeLatencySummary, RealtimeSmokeScenario } from "./aliyunRealtimeSmoke.js";

export interface LatencyEvidenceInput {
  voiceCloneFrequency: VoiceCloneFrequency;
  runs: number;
  receivedTranslation: boolean;
  receivedAudio: boolean;
  translationPreview: string;
  textChunks: number;
  audioChunks: number;
  elapsedMs: number;
  latencySummary: RealtimeSmokeLatencySummary & {
    inputToSentToAliMs?: LatencyPercentiles;
    inputToPreviewPlaybackMs?: LatencyPercentiles;
    inputToPlaybackMs?: LatencyPercentiles;
    sentToAliToFirstTextMs?: LatencyPercentiles;
    sessionToFirstAudioMs?: LatencyPercentiles;
  };
  kpi: RealtimeSmokeKpiEvaluation;
}

export interface LatencyEvidenceOptions {
  measuredAt?: string;
  label?: string;
}

export interface LatencyEvidenceMatrixInput extends Omit<LatencyEvidenceInput, "voiceCloneFrequency"> {
  voiceCloneFrequency?: VoiceCloneFrequency;
  scenario: RealtimeSmokeScenario;
}

export interface LatencyEvidenceRecord {
  measuredAt: string;
  label: string;
  voiceCloneFrequency: VoiceCloneFrequency;
  runs: number;
  receivedTranslation: boolean;
  receivedAudio: boolean;
  firstTextP95Ms?: number;
  previewPlaybackP95Ms?: number;
  firstAudioP95Ms?: number;
  sentToAliToFirstAudioP95Ms?: number;
  playbackP95Ms?: number;
  kpiPassed: boolean;
  bottleneck: "aliyun-audio-generation" | "browser-or-network-send" | "text-recognition" | "unknown";
  reasons: string[];
}

export interface LatencyEvidenceComparison {
  bestLabel?: string;
  bestVoiceCloneFrequency?: VoiceCloneFrequency;
  bestFirstAudioP95Ms?: number;
  kpiPassed: boolean;
  recommendation: string;
}

export type LatencyEvidenceGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export interface LatencyEvidenceArchivePaths {
  jsonlPath: string;
  markdownPath: string;
}

interface LatencyPercentiles {
  p50: number;
  p95: number;
}

export function buildLatencyEvidenceRecord(
  input: LatencyEvidenceInput,
  options: LatencyEvidenceOptions = {}
): LatencyEvidenceRecord {
  const firstTextP95Ms = input.latencySummary.inputToFirstTextMs?.p95;
  const firstAudioP95Ms = input.latencySummary.inputToFirstAudioMs?.p95;
  const sentToAliToFirstAudioP95Ms = input.latencySummary.sentToAliToFirstAudioMs?.p95;

  return {
    measuredAt: options.measuredAt ?? new Date().toISOString(),
    label: options.label ?? "aliyun-smoke",
    voiceCloneFrequency: input.voiceCloneFrequency,
    runs: input.runs,
    receivedTranslation: input.receivedTranslation,
    receivedAudio: input.receivedAudio,
    firstTextP95Ms,
    previewPlaybackP95Ms: input.latencySummary.inputToPreviewPlaybackMs?.p95,
    firstAudioP95Ms,
    sentToAliToFirstAudioP95Ms,
    playbackP95Ms: input.latencySummary.inputToPlaybackMs?.p95,
    kpiPassed: input.kpi.passed,
    bottleneck: classifyBottleneck({
      firstTextP95Ms,
      firstAudioP95Ms,
      sentToAliToFirstAudioP95Ms,
      inputToSentToAliP95Ms: input.latencySummary.inputToSentToAliMs?.p95,
      firstAudioThresholdMs: input.kpi.thresholds.firstAudioP95Ms
    }),
    reasons: input.kpi.reasons
  };
}

export function buildLatencyEvidenceMatrixRecords(
  inputs: LatencyEvidenceMatrixInput[],
  options: LatencyEvidenceOptions = {}
): LatencyEvidenceRecord[] {
  const measuredAt = options.measuredAt ?? new Date().toISOString();
  const labelPrefix = options.label ?? "aliyun-matrix";

  return inputs.map((input) => {
    const { scenario, voiceCloneFrequency, ...evidenceInput } = input;
    return buildLatencyEvidenceRecord(
      {
        ...evidenceInput,
        voiceCloneFrequency: voiceCloneFrequency ?? scenario.voiceCloneFrequency
      },
      {
        measuredAt,
        label: `${labelPrefix}-${scenario.name}`
      }
    );
  });
}

export function formatLatencyEvidenceMarkdown(records: LatencyEvidenceRecord[]): string {
  const rows = records
    .map((record) =>
      [
        record.measuredAt,
        record.label,
        record.voiceCloneFrequency,
        String(record.runs),
        ms(record.firstTextP95Ms),
        ms(record.previewPlaybackP95Ms),
        ms(record.firstAudioP95Ms),
        ms(record.sentToAliToFirstAudioP95Ms),
        record.kpiPassed ? "PASS" : "FAIL",
        record.bottleneck
      ].join(" | ")
    )
    .map((row) => `| ${row} |`)
    .join("\n");

  const comparison = compareLatencyEvidenceRecords(records);
  return [
    "# Real Aliyun Latency Evidence",
    "",
    "| measuredAt | label | voiceCloneFrequency | runs | firstTextP95Ms | previewPlaybackP95Ms | firstAudioP95Ms | sentToAliToFirstAudioP95Ms | KPI | bottleneck |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    rows || "| - | - | - | 0 | - | - | - | - | - | - |",
    "",
    "首字 P95 低于 1000ms 只能证明字幕链路达标；中文译声首音必须单独看 `firstAudioP95Ms`。",
    "`previewPlaybackP95Ms` 只代表本地极速预听首声，不代表阿里原声音色克隆配音达标。",
    "当 `sentToAliToFirstAudioP95Ms` 接近 `firstAudioP95Ms` 且超过阈值时，主要瓶颈在上游中文音频生成。",
    "",
    `Current recommendation: ${comparison.recommendation}`
  ].join("\n");
}

export function compareLatencyEvidenceRecords(records: LatencyEvidenceRecord[]): LatencyEvidenceComparison {
  const measured = records.filter((record) => record.firstAudioP95Ms !== undefined);
  const best = [...measured].sort(
    (left: LatencyEvidenceRecord, right: LatencyEvidenceRecord) =>
      (left.firstAudioP95Ms ?? Infinity) - (right.firstAudioP95Ms ?? Infinity)
  )[0];
  const kpiPassed = records.some((record) => record.kpiPassed);
  if (!best) {
    return {
      kpiPassed,
      recommendation: "No translated-audio latency evidence is available yet; run npm run smoke:aliyun:record."
    };
  }

  return {
    bestLabel: best.label,
    bestVoiceCloneFrequency: best.voiceCloneFrequency,
    bestFirstAudioP95Ms: best.firstAudioP95Ms,
    kpiPassed,
    recommendation: kpiPassed
      ? "At least one recorded sample meets the one-second translated-audio KPI; rerun the strict KPI gate with multiple samples before release."
      : "Recorded Aliyun voice-clone and pacing samples miss the one-second translated-audio KPI; prioritize an alternate low-latency audio path instead of only tuning voice_clone_options.frequency or PCM pacing."
  };
}

export function evaluateLatencyEvidenceGate(records: LatencyEvidenceRecord[]): LatencyEvidenceGateResult {
  if (records.some((record) => record.kpiPassed)) {
    return { ok: true };
  }

  const comparison = compareLatencyEvidenceRecords(records);
  if (comparison.bestLabel && comparison.bestFirstAudioP95Ms !== undefined) {
    return {
      ok: false,
      reason: `No recorded Aliyun translated-audio sample meets the one-second KPI. Best sample ${comparison.bestLabel} is ${comparison.bestFirstAudioP95Ms}ms.`
    };
  }

  return {
    ok: false,
    reason: "No recorded Aliyun latency evidence is available. Run npm run smoke:aliyun:record."
  };
}

export async function appendLatencyEvidenceArchive(
  record: LatencyEvidenceRecord,
  paths: LatencyEvidenceArchivePaths
): Promise<void> {
  await mkdir(dirname(paths.jsonlPath), { recursive: true });
  await mkdir(dirname(paths.markdownPath), { recursive: true });
  const existing = await readExistingRecords(paths.jsonlPath);
  const records = [...existing, record];
  await writeFile(paths.jsonlPath, `${records.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  await writeFile(paths.markdownPath, `${formatLatencyEvidenceMarkdown(records)}\n`, "utf8");
}

function classifyBottleneck(input: {
  firstTextP95Ms?: number;
  firstAudioP95Ms?: number;
  sentToAliToFirstAudioP95Ms?: number;
  inputToSentToAliP95Ms?: number;
  firstAudioThresholdMs: number;
}): LatencyEvidenceRecord["bottleneck"] {
  if (input.firstAudioP95Ms === undefined) {
    return "unknown";
  }
  if (input.inputToSentToAliP95Ms !== undefined && input.inputToSentToAliP95Ms > input.firstAudioThresholdMs) {
    return "browser-or-network-send";
  }
  if (input.firstTextP95Ms !== undefined && input.firstTextP95Ms > input.firstAudioThresholdMs) {
    return "text-recognition";
  }
  if (
    input.sentToAliToFirstAudioP95Ms !== undefined &&
    input.sentToAliToFirstAudioP95Ms > input.firstAudioThresholdMs
  ) {
    return "aliyun-audio-generation";
  }
  return input.firstAudioP95Ms > input.firstAudioThresholdMs ? "unknown" : "unknown";
}

function ms(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

async function readExistingRecords(path: string): Promise<LatencyEvidenceRecord[]> {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LatencyEvidenceRecord);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
