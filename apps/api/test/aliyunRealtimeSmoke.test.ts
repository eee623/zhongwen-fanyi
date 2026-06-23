import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@realtime-dubbing/shared";
import { loadConfig } from "../src/config";
import {
  createRealtimeSmokeScenarioConfig,
  createPcmAudioChunks,
  DEFAULT_REALTIME_CHUNK_DURATION_MS,
  DEFAULT_REALTIME_SEND_INTERVAL_MS,
  evaluateRealtimeSmokeKpi,
  parseRealtimeSmokeScenarioSpec,
  rankRealtimeSmokeExperimentResults,
  runRealtimeWebSocketSmoke,
  summarizeRealtimeSmokeRuns
} from "../src/aliyunRealtimeSmoke";

describe("Aliyun realtime smoke helpers", () => {
  it("splits 16k PCM16 audio into base64 realtime chunks", () => {
    const pcm = Buffer.alloc(3200 * 2 + 17, 7);
    const chunks = createPcmAudioChunks(pcm, {
      sampleRate: 16000,
      chunkDurationMs: 100
    });

    expect(chunks).toHaveLength(3);
    expect(Buffer.from(chunks[0] ?? "", "base64")).toHaveLength(3200);
    expect(Buffer.from(chunks[1] ?? "", "base64")).toHaveLength(3200);
    expect(Buffer.from(chunks[2] ?? "", "base64")).toHaveLength(17);
    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, "base64")))).toEqual(pcm);
  });

  it("defaults smoke pacing to browser-like 10 ms audio chunks", () => {
    const pcm = Buffer.alloc(16000 * 2, 7);
    const chunks = createPcmAudioChunks(pcm);

    expect(DEFAULT_REALTIME_CHUNK_DURATION_MS).toBe(10);
    expect(DEFAULT_REALTIME_SEND_INTERVAL_MS).toBe(10);
    expect(chunks).toHaveLength(100);
    expect(Buffer.from(chunks[0] ?? "", "base64")).toHaveLength(320);
    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, "base64")))).toEqual(pcm);
  });

  it("streams PCM before session.ready to mirror the Chrome offscreen startup path", async () => {
    const fakeApi = new WebSocketServer({ port: 0 });
    const port = (fakeApi.address() as AddressInfo).port;
    const messages: Record<string, unknown>[] = [];
    let sentResponse = false;

    fakeApi.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        messages.push(message);
        if (message.type === "audio.append" && !sentResponse) {
          sentResponse = true;
          socket.send(JSON.stringify({ type: "session.ready", sessionId: "sess_smoke" }));
          socket.send(JSON.stringify({ type: "translation.partial", text: "你好", stash: "", responseId: "resp_1" }));
          socket.send(
            JSON.stringify({
              type: "audio.delta",
              audioBase64: "AAAA",
              sampleRate: 16000,
              format: "pcm",
              responseId: "resp_1"
            })
          );
        }
        if (message.type === "session.finish") {
          socket.close(1000, "smoke_complete");
        }
      });
    });

    const result = await runRealtimeWebSocketSmoke({
      websocketUrl: `ws://127.0.0.1:${port}/v1/live?token=test`,
      pcm: Buffer.alloc(6400),
      maxWaitMs: 500,
      sendIntervalMs: 1
    });

    expect(result).toMatchObject({
      receivedTranslation: true,
      receivedAudio: true,
      translationPreview: "你好",
      audioChunks: 1
    });
    expect(messages).toContainEqual(expect.objectContaining({ type: "session.start" }));
    expect(messages).toContainEqual(expect.objectContaining({ type: "audio.append" }));
    expect(messages).toContainEqual(expect.objectContaining({ type: "latency.mark", mark: "playbackStarted" }));
    expect(messages).toContainEqual(expect.objectContaining({ type: "session.finish" }));
    expect(messages.findIndex((message) => message.type === "audio.append")).toBeLessThan(
      messages.findIndex((message) => message.type === "session.finish")
    );

    fakeApi.close();
    await once(fakeApi, "close");
  });

  it("starts smoke sessions with caller-supplied voice clone frequency settings", async () => {
    const fakeApi = new WebSocketServer({ port: 0 });
    const port = (fakeApi.address() as AddressInfo).port;
    const messages: Record<string, unknown>[] = [];

    fakeApi.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        messages.push(message);
        if (message.type === "session.start") {
          socket.send(JSON.stringify({ type: "session.ready", sessionId: "sess_smoke_once" }));
        }
        if (message.type === "session.finish") {
          socket.close(1000, "smoke_complete");
        }
      });
    });

    await runRealtimeWebSocketSmoke({
      websocketUrl: `ws://127.0.0.1:${port}/v1/live?token=test`,
      pcm: Buffer.alloc(0),
      maxWaitMs: 50,
      settings: {
        ...defaultSettings,
        voiceCloneFrequency: "once"
      }
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "session.start",
        settings: expect.objectContaining({ voiceCloneFrequency: "once" })
      })
    );

    fakeApi.close();
    await once(fakeApi, "close");
  });

  it("summarizes multiple realtime smoke runs without hiding failed runs", () => {
    const summary = summarizeRealtimeSmokeRuns([
      {
        receivedTranslation: true,
        receivedAudio: true,
        translationPreview: "你好",
        textChunks: 4,
        audioChunks: 1,
        elapsedMs: 1200
      },
      {
        receivedTranslation: true,
        receivedAudio: false,
        translationPreview: "第二次",
        textChunks: 2,
        audioChunks: 0,
        elapsedMs: 900
      }
    ]);

    expect(summary).toEqual({
      runs: 2,
      receivedTranslation: true,
      receivedAudio: false,
      translationPreview: "第二次",
      textChunks: 6,
      audioChunks: 1,
      elapsedMs: 2100,
      results: [
        {
          receivedTranslation: true,
          receivedAudio: true,
          translationPreview: "你好",
          textChunks: 4,
          audioChunks: 1,
          elapsedMs: 1200
        },
        {
          receivedTranslation: true,
          receivedAudio: false,
          translationPreview: "第二次",
          textChunks: 2,
          audioChunks: 0,
          elapsedMs: 900
        }
      ]
    });
  });

  it("treats an empty realtime smoke run list as failed", () => {
    expect(summarizeRealtimeSmokeRuns([])).toMatchObject({
      runs: 0,
      receivedTranslation: false,
      receivedAudio: false,
      textChunks: 0,
      audioChunks: 0,
      elapsedMs: 0,
      results: []
    });
  });

  it("evaluates the one-second realtime text and dubbing KPI from latency p95", () => {
    expect(
      evaluateRealtimeSmokeKpi({
        count: 5,
        inputToFirstTextMs: { p50: 620, p95: 840 },
        inputToFirstAudioMs: { p50: 1800, p95: 2600 },
        sentToAliToFirstAudioMs: { p50: 1790, p95: 2580 }
      })
    ).toEqual({
      passed: false,
      thresholds: {
        firstTextP95Ms: 1000,
        firstAudioP95Ms: 1000
      },
      checks: {
        firstTextP95: { passed: true, actualMs: 840, thresholdMs: 1000 },
        firstAudioP95: { passed: false, actualMs: 2600, thresholdMs: 1000 }
      },
      reasons: ["首音 P95 2600ms 高于 1000ms 目标"]
    });
  });

  it("does not pass realtime KPI evaluation without completed latency samples", () => {
    expect(evaluateRealtimeSmokeKpi({ count: 0 })).toMatchObject({
      passed: false,
      reasons: ["没有完整延迟样本"]
    });
  });

  it("builds a default latency experiment matrix for voice clone and pacing comparisons", () => {
    expect(parseRealtimeSmokeScenarioSpec()).toEqual([
      {
        name: "always-c20-s20",
        voiceCloneFrequency: "always",
        chunkDurationMs: 20,
        sendIntervalMs: 20
      },
      {
        name: "once-c20-s20",
        voiceCloneFrequency: "once",
        chunkDurationMs: 20,
        sendIntervalMs: 20
      },
      {
        name: "always-c10-s10",
        voiceCloneFrequency: "always",
        chunkDurationMs: 10,
        sendIntervalMs: 10
      },
      {
        name: "once-c10-s10",
        voiceCloneFrequency: "once",
        chunkDurationMs: 10,
        sendIntervalMs: 10
      }
    ]);
  });

  it("parses custom latency experiment scenarios from frequency:chunk:send specs", () => {
    expect(parseRealtimeSmokeScenarioSpec("once:15:10,always:40:20")).toEqual([
      {
        name: "once-c15-s10",
        voiceCloneFrequency: "once",
        chunkDurationMs: 15,
        sendIntervalMs: 10
      },
      {
        name: "always-c40-s20",
        voiceCloneFrequency: "always",
        chunkDurationMs: 40,
        sendIntervalMs: 20
      }
    ]);
  });

  it("rejects invalid latency experiment scenario specs", () => {
    expect(() => parseRealtimeSmokeScenarioSpec("never:20:20")).toThrow(
      "ALIYUN_LATENCY_MATRIX entries must use once or always"
    );
    expect(() => parseRealtimeSmokeScenarioSpec("once:0:20")).toThrow(
      "ALIYUN_LATENCY_MATRIX chunk and send values must be positive integers"
    );
  });

  it("ranks latency experiment results by first translated audio p95", () => {
    const ranked = rankRealtimeSmokeExperimentResults([
      {
        scenario: { name: "slow", voiceCloneFrequency: "always", chunkDurationMs: 20, sendIntervalMs: 20 },
        latencySummary: { count: 1, inputToFirstAudioMs: { p50: 2400, p95: 2600 } }
      },
      {
        scenario: { name: "fast", voiceCloneFrequency: "once", chunkDurationMs: 10, sendIntervalMs: 10 },
        latencySummary: { count: 1, inputToFirstAudioMs: { p50: 900, p95: 950 } }
      },
      {
        scenario: { name: "missing", voiceCloneFrequency: "always", chunkDurationMs: 10, sendIntervalMs: 10 },
        latencySummary: { count: 0 }
      }
    ]);

    expect(ranked.map((result) => result.scenario.name)).toEqual(["fast", "slow", "missing"]);
  });

  it("creates isolated latency stores for each realtime smoke matrix scenario", () => {
    const config = loadConfig({ DEV_USER_ID: "user_1", DASHSCOPE_API_KEY: "sk-test" });
    config.latencyStore.record("user_1", {
      inputToFirstTextMs: 100,
      inputToFirstAudioMs: 200,
      inputToPlaybackMs: 220,
      sessionToFirstAudioMs: 300
    });

    const first = createRealtimeSmokeScenarioConfig(config);
    const second = createRealtimeSmokeScenarioConfig(config);
    first.latencyStore.record("user_1", {
      inputToFirstTextMs: 10,
      inputToFirstAudioMs: 20,
      inputToPlaybackMs: 22,
      sessionToFirstAudioMs: 30
    });

    expect(config.latencyStore.summary("user_1").count).toBe(1);
    expect(first.latencyStore.summary("user_1").count).toBe(1);
    expect(second.latencyStore.summary("user_1")).toEqual({ count: 0 });
  });
});
