import { createLatencyTracker, type LatencyMarkName } from "@realtime-dubbing/shared";

export function createSessionMetrics(now = Date.now) {
  const tracker = createLatencyTracker(now());
  let translatedAudioDroppedChunks = 0;

  return {
    mark(name: LatencyMarkName, at = now()) {
      tracker.mark(name, at);
      return {
        type: "latency.mark" as const,
        mark: name,
        at
      };
    },
    recordTranslatedAudioDrop() {
      translatedAudioDroppedChunks += 1;
    },
    snapshot() {
      return {
        ...tracker.snapshot(),
        ...(translatedAudioDroppedChunks > 0 ? { translatedAudioDroppedChunks } : {})
      };
    }
  };
}
