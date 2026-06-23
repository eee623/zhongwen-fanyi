import { describe, expect, it } from "vitest";
import {
  buildLatencyEvidenceMatrixRecords,
  buildLatencyEvidenceRecord,
  compareLatencyEvidenceRecords,
  evaluateLatencyEvidenceGate,
  formatLatencyEvidenceMarkdown,
  type LatencyEvidenceRecord,
  type LatencyEvidenceInput
} from "../src/latencyEvidence";

const sample: LatencyEvidenceInput = {
  voiceCloneFrequency: "always",
  runs: 1,
  receivedTranslation: true,
  receivedAudio: true,
  translationPreview: "你好，",
  textChunks: 7,
  audioChunks: 1,
  elapsedMs: 2659,
  latencySummary: {
    count: 1,
    inputToSentToAliMs: { p50: 234, p95: 234 },
    inputToFirstTextMs: { p50: 707, p95: 707 },
    inputToPreviewPlaybackMs: { p50: 820, p95: 820 },
    inputToFirstAudioMs: { p50: 2651, p95: 2651 },
    inputToPlaybackMs: { p50: 2651, p95: 2651 },
    sentToAliToFirstTextMs: { p50: 473, p95: 473 },
    sentToAliToFirstAudioMs: { p50: 2417, p95: 2417 },
    sessionToFirstAudioMs: { p50: 2652, p95: 2652 }
  },
  kpi: {
    passed: false,
    thresholds: {
      firstTextP95Ms: 1000,
      firstAudioP95Ms: 1000
    },
    checks: {
      firstTextP95: { passed: true, actualMs: 707, thresholdMs: 1000 },
      firstAudioP95: { passed: false, actualMs: 2651, thresholdMs: 1000 }
    },
    reasons: ["首音 P95 2651ms 高于 1000ms 目标"]
  }
};

describe("latency evidence archive", () => {
  it("builds an audit record that identifies upstream audio generation as the bottleneck", () => {
    const record = buildLatencyEvidenceRecord(sample, {
      measuredAt: "2026-06-23T03:20:00.000Z",
      label: "early-streaming-smoke"
    });

    expect(record).toMatchObject({
      measuredAt: "2026-06-23T03:20:00.000Z",
      label: "early-streaming-smoke",
      voiceCloneFrequency: "always",
      firstTextP95Ms: 707,
      previewPlaybackP95Ms: 820,
      firstAudioP95Ms: 2651,
      sentToAliToFirstAudioP95Ms: 2417,
      kpiPassed: false,
      bottleneck: "aliyun-audio-generation"
    });
  });

  it("formats records into a compact markdown report for release evidence", () => {
    const markdown = formatLatencyEvidenceMarkdown([
      buildLatencyEvidenceRecord(sample, {
        measuredAt: "2026-06-23T03:20:00.000Z",
        label: "early-streaming-smoke"
      })
    ]);

    expect(markdown).toContain("# Real Aliyun Latency Evidence");
    expect(markdown).toContain(
      "| early-streaming-smoke | always | 1 | 707 | 820 | 2651 | 2417 | FAIL | aliyun-audio-generation |"
    );
    expect(markdown).toContain("首字 P95 低于 1000ms 只能证明字幕链路达标；中文译声首音必须单独看 `firstAudioP95Ms`。");
  });

  it("builds one latency evidence record per matrix scenario with stable labels", () => {
    const records = buildLatencyEvidenceMatrixRecords(
      [
        {
          scenario: {
            name: "always-c10-s10",
            voiceCloneFrequency: "always",
            chunkDurationMs: 10,
            sendIntervalMs: 10
          },
          ...sample
        },
        {
          scenario: {
            name: "once-c10-s10",
            voiceCloneFrequency: "once",
            chunkDurationMs: 10,
            sendIntervalMs: 10
          },
          ...sample,
          voiceCloneFrequency: "once"
        }
      ],
      {
        measuredAt: "2026-06-23T03:30:00.000Z",
        label: "matrix"
      }
    );

    expect(records.map((record) => record.label)).toEqual(["matrix-always-c10-s10", "matrix-once-c10-s10"]);
    expect(records.map((record) => record.measuredAt)).toEqual([
      "2026-06-23T03:30:00.000Z",
      "2026-06-23T03:30:00.000Z"
    ]);
    expect(records.map((record) => record.voiceCloneFrequency)).toEqual(["always", "once"]);
  });

  it("uses the matrix scenario voice clone frequency when the result has no top-level frequency", () => {
    const [record] = buildLatencyEvidenceMatrixRecords(
      [
        {
          scenario: {
            name: "always-c10-s10",
            voiceCloneFrequency: "always",
            chunkDurationMs: 10,
            sendIntervalMs: 10
          },
          runs: sample.runs,
          receivedTranslation: sample.receivedTranslation,
          receivedAudio: sample.receivedAudio,
          translationPreview: sample.translationPreview,
          textChunks: sample.textChunks,
          audioChunks: sample.audioChunks,
          elapsedMs: sample.elapsedMs,
          latencySummary: sample.latencySummary,
          kpi: sample.kpi
        }
      ],
      {
        measuredAt: "2026-06-23T03:30:00.000Z",
        label: "matrix"
      }
    );

    expect(record?.voiceCloneFrequency).toBe("always");
  });

  it("compares voice clone strategies by first translated audio latency", () => {
    const always: LatencyEvidenceRecord = {
      measuredAt: "2026-06-22T19:22:10.000Z",
      label: "early-streaming-baseline",
      voiceCloneFrequency: "always",
      runs: 1,
      receivedTranslation: true,
      receivedAudio: true,
      firstTextP95Ms: 707,
      firstAudioP95Ms: 2651,
      sentToAliToFirstAudioP95Ms: 2417,
      playbackP95Ms: 2651,
      kpiPassed: false,
      bottleneck: "aliyun-audio-generation",
      reasons: ["首音 P95 2651ms 高于 1000ms 目标"]
    };
    const once: LatencyEvidenceRecord = {
      ...always,
      measuredAt: "2026-06-22T19:25:00.000Z",
      label: "once-low-latency-smoke",
      voiceCloneFrequency: "once",
      firstTextP95Ms: 693,
      firstAudioP95Ms: 2711,
      sentToAliToFirstAudioP95Ms: 2492,
      playbackP95Ms: 2711,
      reasons: ["首音 P95 2711ms 高于 1000ms 目标"]
    };

    expect(compareLatencyEvidenceRecords([always, once])).toEqual({
      bestLabel: "early-streaming-baseline",
      bestVoiceCloneFrequency: "always",
      bestFirstAudioP95Ms: 2651,
      kpiPassed: false,
      recommendation:
        "Recorded Aliyun voice-clone and pacing samples miss the one-second translated-audio KPI; prioritize an alternate low-latency audio path instead of only tuning voice_clone_options.frequency or PCM pacing."
    });
  });

  it("uses a matrix-safe recommendation when more than two latency samples are recorded", () => {
    const records: LatencyEvidenceRecord[] = ["baseline", "once", "matrix-always-c10-s10"].map((label, index) => ({
      measuredAt: `2026-06-22T19:2${index}:10.000Z`,
      label,
      voiceCloneFrequency: index === 1 ? "once" : "always",
      runs: 1,
      receivedTranslation: true,
      receivedAudio: true,
      firstTextP95Ms: 707,
      firstAudioP95Ms: 2600 + index,
      sentToAliToFirstAudioP95Ms: 2400 + index,
      playbackP95Ms: 2600 + index,
      kpiPassed: false,
      bottleneck: "aliyun-audio-generation",
      reasons: [`首音 P95 ${2600 + index}ms 高于 1000ms 目标`]
    }));

    const comparison = compareLatencyEvidenceRecords(records);

    expect(comparison.recommendation).toBe(
      "Recorded Aliyun voice-clone and pacing samples miss the one-second translated-audio KPI; prioritize an alternate low-latency audio path instead of only tuning voice_clone_options.frequency or PCM pacing."
    );
  });

  it("fails the recorded evidence gate until at least one translated-audio KPI sample passes", () => {
    expect(
      evaluateLatencyEvidenceGate([
        {
          measuredAt: "2026-06-22T19:22:10.000Z",
          label: "early-streaming-baseline",
          voiceCloneFrequency: "always",
          runs: 1,
          receivedTranslation: true,
          receivedAudio: true,
          firstTextP95Ms: 707,
          firstAudioP95Ms: 2651,
          sentToAliToFirstAudioP95Ms: 2417,
          playbackP95Ms: 2651,
          kpiPassed: false,
          bottleneck: "aliyun-audio-generation",
          reasons: ["首音 P95 2651ms 高于 1000ms 目标"]
        }
      ])
    ).toEqual({
      ok: false,
      reason:
        "No recorded Aliyun translated-audio sample meets the one-second KPI. Best sample early-streaming-baseline is 2651ms."
    });

    expect(
      evaluateLatencyEvidenceGate([
        {
          measuredAt: "2026-06-22T19:22:10.000Z",
          label: "future-fast-audio",
          voiceCloneFrequency: "always",
          runs: 5,
          receivedTranslation: true,
          receivedAudio: true,
          firstTextP95Ms: 650,
          firstAudioP95Ms: 900,
          sentToAliToFirstAudioP95Ms: 780,
          playbackP95Ms: 910,
          kpiPassed: true,
          bottleneck: "unknown",
          reasons: []
        }
      ])
    ).toEqual({ ok: true });
  });
});
