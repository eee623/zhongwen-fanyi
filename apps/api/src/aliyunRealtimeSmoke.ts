import { WebSocket } from "ws";
import type { ApiConfig } from "./config.js";
import { createInMemoryLatencyStore } from "./latencyStats.js";
import {
  defaultSettings,
  normalizeSettings,
  type ApiToClientMessage,
  type ClientToApiMessage,
  type ExtensionSettings,
  type VoiceCloneFrequency
} from "@realtime-dubbing/shared";

export const DEFAULT_REALTIME_CHUNK_DURATION_MS = 10;
export const DEFAULT_REALTIME_SEND_INTERVAL_MS = 10;
export const DEFAULT_REALTIME_KPI_THRESHOLDS = {
  firstTextP95Ms: 1000,
  firstAudioP95Ms: 1000
};

export interface PcmChunkOptions {
  sampleRate?: number;
  chunkDurationMs?: number;
}

export interface RealtimeSmokeLatencyPercentiles {
  p50: number;
  p95: number;
}

export interface RealtimeSmokeLatencySummary {
  count: number;
  inputToSentToAliMs?: RealtimeSmokeLatencyPercentiles;
  inputToFirstTextMs?: RealtimeSmokeLatencyPercentiles;
  inputToPreviewPlaybackMs?: RealtimeSmokeLatencyPercentiles;
  inputToFirstAudioMs?: RealtimeSmokeLatencyPercentiles;
  inputToPlaybackMs?: RealtimeSmokeLatencyPercentiles;
  sentToAliToFirstTextMs?: RealtimeSmokeLatencyPercentiles;
  sentToAliToFirstAudioMs?: RealtimeSmokeLatencyPercentiles;
  sessionToFirstAudioMs?: RealtimeSmokeLatencyPercentiles;
}

export interface RealtimeSmokeScenario {
  name: string;
  voiceCloneFrequency: VoiceCloneFrequency;
  chunkDurationMs: number;
  sendIntervalMs: number;
}

export interface RealtimeSmokeExperimentRankingInput {
  scenario: RealtimeSmokeScenario;
  latencySummary: RealtimeSmokeLatencySummary;
}

export function createRealtimeSmokeScenarioConfig(config: ApiConfig): ApiConfig {
  return {
    ...config,
    port: 0,
    liveTranslateMode: "aliyun",
    latencyStore: createInMemoryLatencyStore()
  };
}

export interface RealtimeSmokeKpiThresholds {
  firstTextP95Ms: number;
  firstAudioP95Ms: number;
}

export interface RealtimeSmokeKpiCheck {
  passed: boolean;
  actualMs?: number;
  thresholdMs: number;
}

export interface RealtimeSmokeKpiEvaluation {
  passed: boolean;
  thresholds: RealtimeSmokeKpiThresholds;
  checks: {
    firstTextP95: RealtimeSmokeKpiCheck;
    firstAudioP95: RealtimeSmokeKpiCheck;
  };
  reasons: string[];
}

export interface RealtimeWebSocketSmokeOptions {
  websocketUrl: string;
  pcm: Buffer;
  settings?: Partial<ExtensionSettings>;
  maxWaitMs?: number;
  sendIntervalMs?: number;
  pcmChunkOptions?: PcmChunkOptions;
}

export interface RealtimeWebSocketSmokeResult {
  receivedTranslation: boolean;
  receivedAudio: boolean;
  translationPreview: string;
  textChunks: number;
  audioChunks: number;
  elapsedMs: number;
}

export interface RealtimeWebSocketSmokeBatchResult extends RealtimeWebSocketSmokeResult {
  runs: number;
  results: RealtimeWebSocketSmokeResult[];
}

export function createPcmAudioChunks(pcm: Buffer, options: PcmChunkOptions = {}): string[] {
  const sampleRate = options.sampleRate ?? 16000;
  const chunkDurationMs = options.chunkDurationMs ?? DEFAULT_REALTIME_CHUNK_DURATION_MS;
  const bytesPerChunk = Math.max(1, Math.round(sampleRate * 2 * (chunkDurationMs / 1000)));
  const chunks: string[] = [];

  for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
    chunks.push(pcm.subarray(offset, offset + bytesPerChunk).toString("base64"));
  }

  return chunks;
}

export function parseRealtimeSmokeScenarioSpec(spec?: string): RealtimeSmokeScenario[] {
  const source = spec?.trim() || "always:20:20,once:20:20,always:10:10,once:10:10";
  return source.split(",").map((entry) => parseRealtimeSmokeScenarioEntry(entry.trim()));
}

export function rankRealtimeSmokeExperimentResults<T extends RealtimeSmokeExperimentRankingInput>(results: T[]): T[] {
  return [...results].sort((left, right) => {
    const leftAudioP95 = left.latencySummary.inputToFirstAudioMs?.p95 ?? Number.POSITIVE_INFINITY;
    const rightAudioP95 = right.latencySummary.inputToFirstAudioMs?.p95 ?? Number.POSITIVE_INFINITY;
    if (leftAudioP95 !== rightAudioP95) {
      return leftAudioP95 - rightAudioP95;
    }
    const leftTextP95 = left.latencySummary.inputToFirstTextMs?.p95 ?? Number.POSITIVE_INFINITY;
    const rightTextP95 = right.latencySummary.inputToFirstTextMs?.p95 ?? Number.POSITIVE_INFINITY;
    return leftTextP95 - rightTextP95;
  });
}

export function summarizeRealtimeSmokeRuns(results: RealtimeWebSocketSmokeResult[]): RealtimeWebSocketSmokeBatchResult {
  const receivedTranslation = results.length > 0 && results.every((result) => result.receivedTranslation);
  const receivedAudio = results.length > 0 && results.every((result) => result.receivedAudio);
  const latestPreview = [...results]
    .reverse()
    .find((result) => result.translationPreview.trim().length > 0)?.translationPreview ?? "";

  return {
    runs: results.length,
    receivedTranslation,
    receivedAudio,
    translationPreview: latestPreview,
    textChunks: results.reduce((total, result) => total + result.textChunks, 0),
    audioChunks: results.reduce((total, result) => total + result.audioChunks, 0),
    elapsedMs: results.reduce((total, result) => total + result.elapsedMs, 0),
    results
  };
}

export function evaluateRealtimeSmokeKpi(
  summary: RealtimeSmokeLatencySummary,
  thresholds: RealtimeSmokeKpiThresholds = DEFAULT_REALTIME_KPI_THRESHOLDS
): RealtimeSmokeKpiEvaluation {
  const firstTextP95 = summary.inputToFirstTextMs?.p95;
  const firstAudioP95 = summary.inputToFirstAudioMs?.p95;
  const checks = {
    firstTextP95: buildKpiCheck(firstTextP95, thresholds.firstTextP95Ms),
    firstAudioP95: buildKpiCheck(firstAudioP95, thresholds.firstAudioP95Ms)
  };
  const reasons: string[] = [];

  if (summary.count < 1) {
    reasons.push("没有完整延迟样本");
  } else if (firstTextP95 === undefined) {
    reasons.push("缺少首字 P95 延迟");
  } else if (!checks.firstTextP95.passed) {
    reasons.push(`首字 P95 ${firstTextP95}ms 高于 ${thresholds.firstTextP95Ms}ms 目标`);
  }
  if (summary.count > 0) {
    if (firstAudioP95 === undefined) {
      reasons.push("缺少首音 P95 延迟");
    } else if (!checks.firstAudioP95.passed) {
      reasons.push(`首音 P95 ${firstAudioP95}ms 高于 ${thresholds.firstAudioP95Ms}ms 目标`);
    }
  }

  return {
    passed: summary.count > 0 && checks.firstTextP95.passed && checks.firstAudioP95.passed,
    thresholds,
    checks,
    reasons
  };
}

function buildKpiCheck(actualMs: number | undefined, thresholdMs: number): RealtimeSmokeKpiCheck {
  return {
    passed: actualMs !== undefined && actualMs <= thresholdMs,
    actualMs,
    thresholdMs
  };
}

function parseRealtimeSmokeScenarioEntry(entry: string): RealtimeSmokeScenario {
  const [frequency, chunkDurationMsText, sendIntervalMsText] = entry.split(":");
  if (frequency !== "once" && frequency !== "always") {
    throw new Error("ALIYUN_LATENCY_MATRIX entries must use once or always");
  }

  const chunkDurationMs = parseScenarioPositiveInteger(chunkDurationMsText);
  const sendIntervalMs = parseScenarioPositiveInteger(sendIntervalMsText);
  return {
    name: `${frequency}-c${chunkDurationMs}-s${sendIntervalMs}`,
    voiceCloneFrequency: frequency,
    chunkDurationMs,
    sendIntervalMs
  };
}

function parseScenarioPositiveInteger(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("ALIYUN_LATENCY_MATRIX chunk and send values must be positive integers");
  }
  return parsed;
}

export async function runRealtimeWebSocketSmoke(
  options: RealtimeWebSocketSmokeOptions
): Promise<RealtimeWebSocketSmokeResult> {
  const startedAt = Date.now();
  const maxWaitMs = options.maxWaitMs ?? 20_000;
  const sendIntervalMs = options.sendIntervalMs ?? DEFAULT_REALTIME_SEND_INTERVAL_MS;
  const chunks = createPcmAudioChunks(options.pcm, options.pcmChunkOptions);
  const settings = normalizeSettings(options.settings ?? defaultSettings);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.websocketUrl);
    let settled = false;
    let finishRequested = false;
    let ready = false;
    let sentIndex = 0;
    let sendTimer: NodeJS.Timeout | undefined;
    let closeTimer: NodeJS.Timeout | undefined;
    let translationPreview = "";
    let textChunks = 0;
    let audioChunks = 0;
    const timeout = setTimeout(() => {
      finish();
    }, maxWaitMs);

    socket.on("open", () => {
      send({
        type: "session.start",
        settings,
        startedAt: Date.now()
      });
      pumpAudio();
    });

    socket.on("message", (raw) => {
      const event = parseApiEvent(raw);
      if (!event) {
        return;
      }
      if (event.type === "session.ready" && !ready) {
        ready = true;
        return;
      }
      if (event.type === "translation.partial" || event.type === "translation.final") {
        textChunks += 1;
        translationPreview = event.text || translationPreview;
      }
      if (event.type === "audio.delta") {
        audioChunks += 1;
        send({
          type: "latency.mark",
          mark: "playbackStarted",
          at: Date.now()
        });
      }
      if (textChunks > 0 && audioChunks > 0) {
        finish();
      }
    });

    socket.on("error", (error) => {
      cleanup();
      reject(error);
    });

    socket.on("close", () => {
      settle();
    });

    function pumpAudio() {
      if (sentIndex >= chunks.length) {
        return;
      }
      send({
        type: "audio.append",
        audioBase64: chunks[sentIndex] ?? "",
        capturedAt: Date.now()
      });
      sentIndex += 1;
      if (sentIndex < chunks.length) {
        sendTimer = setTimeout(pumpAudio, sendIntervalMs);
      }
    }

    function finish() {
      if (settled || finishRequested) {
        return;
      }
      finishRequested = true;
      if (sendTimer) {
        clearTimeout(sendTimer);
        sendTimer = undefined;
      }
      send({
        type: "session.finish",
        finishedAt: Date.now()
      });
      closeTimer = setTimeout(() => {
        socket.close(1000, "smoke_complete");
      }, 250);
    }

    function settle() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({
        receivedTranslation: textChunks > 0,
        receivedAudio: audioChunks > 0,
        translationPreview,
        textChunks,
        audioChunks,
        elapsedMs: Math.max(0, Date.now() - startedAt)
      });
    }

    function send(message: ClientToApiMessage) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      if (sendTimer) {
        clearTimeout(sendTimer);
      }
      if (closeTimer) {
        clearTimeout(closeTimer);
      }
    }
  });
}

function parseApiEvent(raw: WebSocket.RawData): ApiToClientMessage | undefined {
  try {
    return JSON.parse(raw.toString()) as ApiToClientMessage;
  } catch {
    return undefined;
  }
}
