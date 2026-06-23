import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendLatencyEvidenceArchive, type LatencyEvidenceRecord } from "../src/latencyEvidence";

const record: LatencyEvidenceRecord = {
  measuredAt: "2026-06-23T03:20:00.000Z",
  label: "early-streaming-smoke",
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

describe("latency evidence archive files", () => {
  it("appends JSONL evidence and regenerates the markdown report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "latency-evidence-"));
    const jsonlPath = join(dir, "latency-evidence.jsonl");
    const markdownPath = join(dir, "latency-evidence.md");

    try {
      await appendLatencyEvidenceArchive(record, { jsonlPath, markdownPath });

      expect((await readFile(jsonlPath, "utf8")).trim()).toBe(JSON.stringify(record));
      const markdown = await readFile(markdownPath, "utf8");
      expect(markdown).toContain(
        "| early-streaming-smoke | always | 1 | 707 | - | 2651 | 2417 | FAIL | aliyun-audio-generation |"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
