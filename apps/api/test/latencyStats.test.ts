import { describe, expect, it } from "vitest";
import { createInMemoryLatencyStore } from "../src/latencyStats";

describe("latency stats store", () => {
  it("summarizes first audio and playback latency with p50 and p95", () => {
    const store = createInMemoryLatencyStore();

    store.record("user_1", {
      inputToSentToAliMs: 20,
      inputToFirstTextMs: 120,
      inputToPreviewPlaybackMs: 180,
      inputToFirstAudioMs: 400,
      inputToPlaybackMs: 450,
      sentToAliToFirstTextMs: 100,
      sentToAliToFirstAudioMs: 380,
      sessionToFirstAudioMs: 520,
      translatedAudioDroppedChunks: 0
    });
    store.record("user_1", {
      inputToSentToAliMs: 40,
      inputToFirstTextMs: 140,
      inputToPreviewPlaybackMs: 220,
      inputToFirstAudioMs: 700,
      inputToPlaybackMs: 800,
      sentToAliToFirstTextMs: 100,
      sentToAliToFirstAudioMs: 660,
      sessionToFirstAudioMs: 900,
      translatedAudioDroppedChunks: 2
    });
    store.record("user_1", {
      inputToSentToAliMs: 60,
      inputToFirstTextMs: 160,
      inputToPreviewPlaybackMs: 260,
      inputToFirstAudioMs: 900,
      inputToPlaybackMs: 1100,
      sentToAliToFirstTextMs: 100,
      sentToAliToFirstAudioMs: 840,
      sessionToFirstAudioMs: 1200,
      translatedAudioDroppedChunks: 7
    });

    expect(store.summary("user_1")).toEqual({
      count: 3,
      inputToSentToAliMs: { p50: 40, p95: 60 },
      inputToFirstTextMs: { p50: 140, p95: 160 },
      inputToPreviewPlaybackMs: { p50: 220, p95: 260 },
      inputToFirstAudioMs: { p50: 700, p95: 900 },
      inputToPlaybackMs: { p50: 800, p95: 1100 },
      sentToAliToFirstTextMs: { p50: 100, p95: 100 },
      sentToAliToFirstAudioMs: { p50: 660, p95: 840 },
      sessionToFirstAudioMs: { p50: 900, p95: 1200 },
      translatedAudioDroppedChunks: { p50: 2, p95: 7 }
    });
  });

  it("ignores incomplete latency snapshots", () => {
    const store = createInMemoryLatencyStore();

    store.record("user_1", {
      inputToFirstTextMs: 120
    });

    expect(store.summary("user_1")).toEqual({ count: 0 });
  });
});
