import type { ClientToApiMessage } from "@realtime-dubbing/shared";

type ClientLatencyMarkMessage = Extract<ClientToApiMessage, { type: "latency.mark" }>;
type ClientAudioDropMessage = Extract<ClientToApiMessage, { type: "audio.drop" }>;

export function createPlaybackStartedMessage(at = Date.now()): ClientLatencyMarkMessage {
  return {
    type: "latency.mark",
    mark: "playbackStarted",
    at
  };
}

export function createPreviewPlaybackStartedMessage(at = Date.now()): ClientLatencyMarkMessage {
  return {
    type: "latency.mark",
    mark: "previewPlaybackStarted",
    at
  };
}

export function createTranslatedAudioDroppedMessage(
  droppedAt = Date.now(),
  queuedSeconds: number
): ClientAudioDropMessage {
  return {
    type: "audio.drop",
    reason: "translated_audio_queue_overflow",
    droppedAt,
    queuedSeconds
  };
}
