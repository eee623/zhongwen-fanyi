import { describe, expect, it } from "vitest";
import {
  createPlaybackStartedMessage,
  createPreviewPlaybackStartedMessage,
  createTranslatedAudioDroppedMessage
} from "../src/latency";

describe("extension latency reporting", () => {
  it("creates a backend latency mark when translated audio starts playing", () => {
    expect(createPlaybackStartedMessage(1550)).toEqual({
      type: "latency.mark",
      mark: "playbackStarted",
      at: 1550
    });
  });

  it("creates a backend latency mark when low latency preview speech starts", () => {
    expect(createPreviewPlaybackStartedMessage(1250)).toEqual({
      type: "latency.mark",
      mark: "previewPlaybackStarted",
      at: 1250
    });
  });

  it("creates a backend quality mark when stale translated audio is dropped", () => {
    expect(createTranslatedAudioDroppedMessage(1234, 1.25)).toEqual({
      type: "audio.drop",
      reason: "translated_audio_queue_overflow",
      droppedAt: 1234,
      queuedSeconds: 1.25
    });
  });
});
