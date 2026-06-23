import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { AddressInfo } from "node:net";
import { join } from "node:path";
import { issueClientToken } from "../apps/api/src/auth";
import { loadConfig } from "../apps/api/src/config";
import {
  evaluateRealtimeSmokeKpi,
  runRealtimeWebSocketSmoke,
  summarizeRealtimeSmokeRuns
} from "../apps/api/src/aliyunRealtimeSmoke";
import { appendLatencyEvidenceArchive, buildLatencyEvidenceRecord } from "../apps/api/src/latencyEvidence";
import { createLiveTranslationServer } from "../apps/api/src/sessionServer";
import { defaultSettings, normalizeSettings, type VoiceCloneFrequency } from "../packages/shared/src/index";

const speechText =
  process.env.ALIYUN_SMOKE_TEXT ?? "Hello, this is a real time translation and dubbing smoke test.";
const maxWaitMs = Number.parseInt(process.env.ALIYUN_SMOKE_TIMEOUT_MS ?? "30000", 10);
const runCount = parsePositiveInteger(process.env.ALIYUN_SMOKE_RUNS ?? "1", "ALIYUN_SMOKE_RUNS");
const strictKpi = process.env.ALIYUN_SMOKE_STRICT_KPI === "1";
const recordEvidence = process.env.ALIYUN_SMOKE_RECORD_EVIDENCE === "1";
const voiceCloneFrequency = parseVoiceCloneFrequency(process.env.ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY);
const smokeSettings = normalizeSettings({
  ...defaultSettings,
  voiceCloneFrequency
});
const tempDir = join(process.cwd(), ".tmp", `aliyun-realtime-smoke-${Date.now()}`);
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

  const api = createLiveTranslationServer({
    ...config,
    port: 0,
    liveTranslateMode: "aliyun"
  });
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
    const results = [];
    for (let run = 0; run < runCount; run += 1) {
      results.push(
        await runRealtimeWebSocketSmoke({
          websocketUrl: `ws://127.0.0.1:${apiPort}/v1/live?token=${encodeURIComponent(token)}`,
          pcm: readFileSync(pcmPath),
          settings: smokeSettings,
          maxWaitMs
        })
      );
    }
    const result = summarizeRealtimeSmokeRuns(results);
    const latencySummary = await readLatencySummary(apiPort, token);
    const kpi = evaluateRealtimeSmokeKpi(latencySummary);
    const output = {
      voiceCloneFrequency: smokeSettings.voiceCloneFrequency,
      ...result,
      latencySummary,
      kpi
    };
    if (recordEvidence) {
      await appendLatencyEvidenceArchive(
        buildLatencyEvidenceRecord(output, {
          label: process.env.ALIYUN_SMOKE_EVIDENCE_LABEL ?? "aliyun-smoke"
        }),
        {
          jsonlPath: process.env.ALIYUN_SMOKE_EVIDENCE_JSONL ?? "docs/latency-evidence.jsonl",
          markdownPath: process.env.ALIYUN_SMOKE_EVIDENCE_MARKDOWN ?? "docs/latency-evidence.md"
        }
      );
    }
    console.log(JSON.stringify(output, null, 2));
    if (!result.receivedTranslation || !result.receivedAudio) {
      process.exit(1);
    }
    if (strictKpi && !kpi.passed) {
      process.exit(1);
    }
  } finally {
    await api.close();
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

function parseVoiceCloneFrequency(value: string | undefined): VoiceCloneFrequency {
  if (value === undefined || value === "") {
    return "always";
  }
  if (value === "once" || value === "always") {
    return value;
  }
  throw new Error("ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY must be once or always.");
}

async function readLatencySummary(apiPort: number, token: string) {
  const response = await fetch(`http://127.0.0.1:${apiPort}/v1/latency/summary`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Latency summary request failed with ${response.status}.`);
  }
  return response.json();
}
