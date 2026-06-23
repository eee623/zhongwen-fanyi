import { describe, expect, it } from "vitest";
import { describeLatencyKpiStatus, fetchLatencySummary, latencySummaryEndpointForLiveUrl } from "../src/diagnostics";

describe("extension diagnostics", () => {
  it("maps live websocket URLs to the latency summary endpoint", () => {
    expect(latencySummaryEndpointForLiveUrl("ws://localhost:8787/v1/live")).toBe(
      "http://localhost:8787/v1/latency/summary"
    );
    expect(latencySummaryEndpointForLiveUrl("wss://api.example.com/v1/live?token=old")).toBe(
      "https://api.example.com/v1/latency/summary"
    );
  });

  it("fetches latency summary with the resolved session credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const summary = await fetchLatencySummary("ws://localhost:8787/v1/live", "session-credential", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          count: 2,
          inputToSentToAliMs: { p50: 24, p95: 40 },
          inputToPreviewPlaybackMs: { p50: 190, p95: 260 },
          inputToFirstAudioMs: { p50: 420, p95: 760 },
          inputToPlaybackMs: { p50: 510, p95: 890 },
          sentToAliToFirstAudioMs: { p50: 396, p95: 720 },
          translatedAudioDroppedChunks: { p50: 0, p95: 2 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    expect(summary).toEqual({
      ok: true,
      summary: {
        count: 2,
        inputToSentToAliMs: { p50: 24, p95: 40 },
        inputToPreviewPlaybackMs: { p50: 190, p95: 260 },
        inputToFirstAudioMs: { p50: 420, p95: 760 },
        inputToPlaybackMs: { p50: 510, p95: 890 },
        sentToAliToFirstAudioMs: { p50: 396, p95: 720 },
        translatedAudioDroppedChunks: { p50: 0, p95: 2 }
      }
    });
    expect(calls).toEqual([
      {
        url: "http://localhost:8787/v1/latency/summary",
        init: {
          method: "GET",
          headers: {
            authorization: "Bearer session-credential"
          }
        }
      }
    ]);
  });

  it("keeps low latency preview separate from cloned translated audio KPI", () => {
    expect(
      describeLatencyKpiStatus({
        count: 1,
        inputToFirstTextMs: { p50: 690, p95: 707 },
        inputToPreviewPlaybackMs: { p50: 240, p95: 280 },
        inputToFirstAudioMs: { p50: 2600, p95: 2676 },
        sentToAliToFirstAudioMs: { p50: 2450, p95: 2456 }
      })
    ).toEqual({
      tone: "blocked",
      title: "原声音色译声未达标",
      detail: "首音 P95 2676ms，高于 1000ms；预听 P95 280ms 只代表本地桥接，不代表原声音色配音。"
    });
  });

  it("reports a pass only when cloned translated audio is within one second", () => {
    expect(
      describeLatencyKpiStatus({
        count: 3,
        inputToFirstTextMs: { p50: 480, p95: 650 },
        inputToPreviewPlaybackMs: { p50: 210, p95: 260 },
        inputToFirstAudioMs: { p50: 720, p95: 920 }
      })
    ).toEqual({
      tone: "ok",
      title: "原声音色译声达标",
      detail: "首音 P95 920ms，低于 1000ms；预听仍只作为本地桥接。"
    });
  });

  it("asks for a refresh before any completed latency samples exist", () => {
    expect(describeLatencyKpiStatus({ count: 0 })).toEqual({
      tone: "empty",
      title: "暂无延迟样本",
      detail: "启动同传并播放一段英语音频后刷新。"
    });
  });
});
