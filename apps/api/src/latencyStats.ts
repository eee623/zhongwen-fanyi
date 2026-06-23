import type { LatencySnapshot } from "@realtime-dubbing/shared";

export interface LatencyPercentiles {
  p50: number;
  p95: number;
}

export interface LatencySummary {
  count: number;
  inputToSentToAliMs?: LatencyPercentiles;
  inputToFirstTextMs?: LatencyPercentiles;
  inputToPreviewPlaybackMs?: LatencyPercentiles;
  inputToFirstAudioMs?: LatencyPercentiles;
  inputToPlaybackMs?: LatencyPercentiles;
  sentToAliToFirstTextMs?: LatencyPercentiles;
  sentToAliToFirstAudioMs?: LatencyPercentiles;
  sessionToFirstAudioMs?: LatencyPercentiles;
  translatedAudioDroppedChunks?: LatencyPercentiles;
}

export interface LatencyStore {
  record(userId: string, snapshot: LatencySnapshot): void;
  summary(userId: string): LatencySummary;
}

interface CompleteLatencySnapshot {
  inputToSentToAliMs?: number;
  inputToFirstTextMs: number;
  inputToPreviewPlaybackMs?: number;
  inputToFirstAudioMs: number;
  inputToPlaybackMs: number;
  sentToAliToFirstTextMs?: number;
  sentToAliToFirstAudioMs?: number;
  sessionToFirstAudioMs: number;
  translatedAudioDroppedChunks?: number;
}

export function createInMemoryLatencyStore(): LatencyStore {
  const snapshotsByUser = new Map<string, CompleteLatencySnapshot[]>();

  return {
    record(userId, snapshot) {
      const complete = completeSnapshot(snapshot);
      if (!complete) {
        return;
      }
      const snapshots = snapshotsByUser.get(userId) ?? [];
      snapshots.push(complete);
      snapshotsByUser.set(userId, snapshots);
    },
    summary(userId) {
      const snapshots = snapshotsByUser.get(userId) ?? [];
      if (snapshots.length === 0) {
        return { count: 0 };
      }

      return {
        count: snapshots.length,
        inputToSentToAliMs: optionalPercentiles(snapshots.map((snapshot) => snapshot.inputToSentToAliMs)),
        inputToFirstTextMs: percentiles(snapshots.map((snapshot) => snapshot.inputToFirstTextMs)),
        inputToPreviewPlaybackMs: optionalPercentiles(snapshots.map((snapshot) => snapshot.inputToPreviewPlaybackMs)),
        inputToFirstAudioMs: percentiles(snapshots.map((snapshot) => snapshot.inputToFirstAudioMs)),
        inputToPlaybackMs: percentiles(snapshots.map((snapshot) => snapshot.inputToPlaybackMs)),
        sentToAliToFirstTextMs: optionalPercentiles(snapshots.map((snapshot) => snapshot.sentToAliToFirstTextMs)),
        sentToAliToFirstAudioMs: optionalPercentiles(snapshots.map((snapshot) => snapshot.sentToAliToFirstAudioMs)),
        sessionToFirstAudioMs: percentiles(snapshots.map((snapshot) => snapshot.sessionToFirstAudioMs)),
        translatedAudioDroppedChunks: optionalPercentiles(
          snapshots.map((snapshot) => snapshot.translatedAudioDroppedChunks)
        )
      };
    }
  };
}

function completeSnapshot(snapshot: LatencySnapshot): CompleteLatencySnapshot | undefined {
  if (
    snapshot.inputToFirstTextMs === undefined ||
    snapshot.inputToFirstAudioMs === undefined ||
    snapshot.inputToPlaybackMs === undefined ||
    snapshot.sessionToFirstAudioMs === undefined
  ) {
    return undefined;
  }

  return {
    inputToSentToAliMs: snapshot.inputToSentToAliMs,
    inputToFirstTextMs: snapshot.inputToFirstTextMs,
    inputToPreviewPlaybackMs: snapshot.inputToPreviewPlaybackMs,
    inputToFirstAudioMs: snapshot.inputToFirstAudioMs,
    inputToPlaybackMs: snapshot.inputToPlaybackMs,
    sentToAliToFirstTextMs: snapshot.sentToAliToFirstTextMs,
    sentToAliToFirstAudioMs: snapshot.sentToAliToFirstAudioMs,
    sessionToFirstAudioMs: snapshot.sessionToFirstAudioMs,
    translatedAudioDroppedChunks: snapshot.translatedAudioDroppedChunks
  };
}

function optionalPercentiles(values: Array<number | undefined>): LatencyPercentiles | undefined {
  const complete = values.filter((value): value is number => typeof value === "number");
  return complete.length > 0 ? percentiles(complete) : undefined;
}

function percentiles(values: number[]): LatencyPercentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95)
  };
}

function nearestRank(sortedValues: number[], percentile: number): number {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentile) - 1));
  return sortedValues[index] ?? 0;
}
