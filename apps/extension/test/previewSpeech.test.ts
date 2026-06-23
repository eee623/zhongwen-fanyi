import { describe, expect, it } from "vitest";
import { defaultSettings } from "@realtime-dubbing/shared";
import {
  createPreviewSpeechState,
  previewSpeechStateFromApiEvent,
  previewTextFromApiEvent,
  shouldCancelPreviewSpeechForApiEvent
} from "../src/previewSpeech";

describe("low latency preview speech", () => {
  it("speaks the first translated text before cloned audio arrives", () => {
    const state = createPreviewSpeechState();
    const event = {
      type: "translation.partial",
      text: "你好，",
      stash: "",
      responseId: "resp_1"
    } as const;

    expect(previewTextFromApiEvent(event, defaultSettings, state)).toBe("你好，");

    const spoken = previewSpeechStateFromApiEvent(state, event, true);
    expect(previewTextFromApiEvent(event, defaultSettings, spoken)).toBeUndefined();
  });

  it("does not preview speech when dubbing or the preview switch is disabled", () => {
    const state = createPreviewSpeechState();
    const event = {
      type: "translation.partial",
      text: "你好，",
      stash: "",
      responseId: "resp_1"
    } as const;

    expect(previewTextFromApiEvent(event, { ...defaultSettings, dubbingEnabled: false }, state)).toBeUndefined();
    expect(
      previewTextFromApiEvent(event, { ...defaultSettings, lowLatencyPreviewEnabled: false }, state)
    ).toBeUndefined();
  });

  it("stops previewing after the cloned audio stream has started", () => {
    const audioStarted = previewSpeechStateFromApiEvent(
      createPreviewSpeechState(),
      { type: "audio.delta", audioBase64: "AAAA", sampleRate: 16000, format: "pcm" },
      false
    );

    expect(
      previewTextFromApiEvent(
        { type: "translation.final", text: "你好世界", responseId: "resp_2" },
        defaultSettings,
        audioStarted
      )
    ).toBeUndefined();
  });

  it("cancels local preview speech when cloned translated audio arrives", () => {
    expect(
      shouldCancelPreviewSpeechForApiEvent(
        { previewSpoken: true, clonedAudioStarted: false },
        { type: "audio.delta", audioBase64: "AAAA", sampleRate: 16000, format: "pcm" }
      )
    ).toBe(true);
    expect(
      shouldCancelPreviewSpeechForApiEvent(
        { previewSpoken: false, clonedAudioStarted: false },
        { type: "audio.delta", audioBase64: "AAAA", sampleRate: 16000, format: "pcm" }
      )
    ).toBe(false);
    expect(
      shouldCancelPreviewSpeechForApiEvent(
        { previewSpoken: true, clonedAudioStarted: false },
        { type: "translation.partial", text: "你好", stash: "", responseId: "resp_1" }
      )
    ).toBe(false);
  });
});
