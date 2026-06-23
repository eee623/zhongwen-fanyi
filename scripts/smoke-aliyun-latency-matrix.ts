import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { AddressInfo } from "node:net";
import { join } from "node:path";
import { issueClientToken } from "../apps/api/src/auth";
import { loadConfig } from "../apps/api/src/config";
import {
  createRealtimeSmokeScenarioConfig,
  evaluateRealtimeSmokeKpi,
  parseRealtimeSmokeScenarioSpec,
  rankRealtimeSmokeExperimentResults,
  runRealtimeWebSocketSmoke,
  summarizeRealtimeSmokeRuns,
  type RealtimeSmokeLatencySummary
} from "../apps/api/src/aliyunRealtimeSmoke";
import {
  appendLatencyEvidenceArchive,
  buildLatencyEvidenceMatrixRecords
} from "../apps/api/src/latencyEvidence";
import { createLiveTranslationServer } from "../apps/api/src/sessionServer";
import { defaultSettings, normalizeSettings } from "../packages/shared/src/index";

const speechText =
  process.env.ALIYUN_SMOKE_TEXT ?? "Hello, this is a real time translation and dubbing latency matrix test.";
const maxWaitMs = Number.parseInt(process.env.ALIYUN_SMOKE_TIMEOUT_MS ?? "30000", 10);
const runCount = parsePositiveInteger(process.env.ALIYUN_MATRIX_RUNS ?? "1", "ALIYUN_MATRIX_RUNS");
const scenarios = parseRealtimeSmokeScenarioSpec(process.env.ALIYUN_LATENCY_MATRIX);
const recordEvidence = process.env.ALIYUN_MATRIX_RECORD_EVIDENCE === "1";
const tempDir = join(process.cwd(), ".tmp", `aliyun-latency-matrix-${Date.now()}`);
const aiffPath = join(tempDir, "speech.aiff");
const pcmPath = join(tempDir, "speech.pcm");

mkdirSync(tempDir, { recursive: true });

try {
  const sayPath = requireCommand("say", ["/usr/bin/say"]);
  const ffmpegPath = requireCommand("ffmpeg", ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);
  const config = loadConfig();
  if (!config.aliApiKey.startsWith("sk-")) {
    throw new Error("DASHSCOPE_API_KEY is required in .env and must start with sk-.");
  }

  runCommand(sayPath, ["-v", process.env.ALIYUN_SMOKE_VOICE ?? "Samantha", "-o", aiffPath, speechText]);
  runCommand(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    aiffPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "s16le",
    pcmPath
  ]);

  const pcm = readFileSync(pcmPath);
  const scenarioResults = [];
  for (const scenario of scenarios) {
    const scenarioConfig = createRealtimeSmokeScenarioConfig(config);
    const api = createLiveTranslationServer(scenarioConfig);
    await api.listen();
    try {
      const apiPort = (api.server.address() as AddressInfo).port;
      const token = config.auth.tokenSecret
        ? issueClientToken({
            userId: config.auth.devUserId,
            secret: config.auth.tokenSecret,
            expiresInSeconds: config.clientTokenTtlSeconds
          })
        : config.auth.devClientToken;
      const runs = [];
      for (let run = 0; run < runCount; run += 1) {
        runs.push(
          await runRealtimeWebSocketSmoke({
            websocketUrl: `ws://127.0.0.1:${apiPort}/v1/live?token=${encodeURIComponent(token)}`,
            pcm,
            settings: normalizeSettings({
              ...defaultSettings,
              voiceCloneFrequency: scenario.voiceCloneFrequency
            }),
            maxWaitMs,
            sendIntervalMs: scenario.sendIntervalMs,
            pcmChunkOptions: {
              chunkDurationMs: scenario.chunkDurationMs
            }
          })
        );
      }

      const result = summarizeRealtimeSmokeRuns(runs);
      const latencySummary = await readLatencySummary(apiPort, token);
      scenarioResults.push({
        scenario,
        ...result,
        latencySummary,
        kpi: evaluateRealtimeSmokeKpi(latencySummary)
      });
    } finally {
      await api.close();
    }
  }

  const ranked = rankRealtimeSmokeExperimentResults(scenarioResults);
  if (recordEvidence) {
    const records = buildLatencyEvidenceMatrixRecords(scenarioResults, {
      label: process.env.ALIYUN_MATRIX_EVIDENCE_LABEL ?? "aliyun-matrix"
    });
    for (const record of records) {
      await appendLatencyEvidenceArchive(record, {
        jsonlPath: process.env.ALIYUN_MATRIX_EVIDENCE_JSONL ?? "docs/latency-evidence.jsonl",
        markdownPath: process.env.ALIYUN_MATRIX_EVIDENCE_MARKDOWN ?? "docs/latency-evidence.md"
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        runsPerScenario: runCount,
        matrix: scenarios.map((scenario) => scenario.name),
        rankedByFirstAudioP95: ranked.map((result) => ({
          scenario: result.scenario.name,
          voiceCloneFrequency: result.scenario.voiceCloneFrequency,
          chunkDurationMs: result.scenario.chunkDurationMs,
          sendIntervalMs: result.scenario.sendIntervalMs,
          firstTextP95Ms: result.latencySummary.inputToFirstTextMs?.p95,
          firstAudioP95Ms: result.latencySummary.inputToFirstAudioMs?.p95,
          kpiPassed: result.kpi.passed
        })),
        scenarios: scenarioResults
      },
      null,
      2
    )
  );

  if (scenarioResults.some((result) => !result.receivedTranslation || !result.receivedAudio)) {
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function requireCommand(name: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const result = spawnSync("/usr/bin/env", ["which", name], { encoding: "utf8" });
  const resolved = result.stdout.trim();
  if (result.status === 0 && resolved) {
    return resolved;
  }
  throw new Error(`Required command not found: ${name}.`);
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function readLatencySummary(apiPort: number, token: string): Promise<RealtimeSmokeLatencySummary> {
  const response = await fetch(`http://127.0.0.1:${apiPort}/v1/latency/summary`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Latency summary request failed with ${response.status}.`);
  }
  return response.json() as Promise<RealtimeSmokeLatencySummary>;
}
