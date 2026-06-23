import { describe, expect, it } from "vitest";
import { defaultSettings } from "@realtime-dubbing/shared";
import {
  contentMessageFromApiEvent,
  runtimeMessagesForSettingsUpdate,
  shouldStopOffscreenForApiEvent,
  shouldPlayTranslatedAudio
} from "../src/routing";

describe("extension runtime routing", () => {
  it("uses the active subtitle settings for translation updates", () => {
    const message = contentMessageFromApiEvent(
      {
        type: "translation.partial",
        text: "你好",
        stash: "世界",
        responseId: "resp_1"
      },
      {
        ...defaultSettings,
        subtitlesEnabled: false,
        floatingSubtitles: true,
        fullscreenSubtitles: true,
        subtitleSize: 33
      }
    );

    expect(message).toEqual({
      type: "subtitle.update",
      text: "你好",
      stash: "世界",
      subtitleSize: 33,
      visible: false,
      floatingVisible: false,
      fullscreenVisible: false
    });
  });

  it("routes floating and fullscreen subtitle switches independently", () => {
    const message = contentMessageFromApiEvent(
      {
        type: "translation.final",
        text: "你好世界",
        responseId: "resp_2"
      },
      {
        ...defaultSettings,
        subtitlesEnabled: true,
        floatingSubtitles: false,
        fullscreenSubtitles: true,
        subtitleSize: 28
      }
    );

    expect(message).toEqual({
      type: "subtitle.update",
      text: "你好世界",
      subtitleSize: 28,
      visible: true,
      floatingVisible: false,
      fullscreenVisible: true
    });
  });

  it("does not play translated audio when dubbing is disabled mid-session", () => {
    expect(
      shouldPlayTranslatedAudio(
        { type: "audio.delta", audioBase64: "AAAA", sampleRate: 16000, format: "pcm" },
        { ...defaultSettings, dubbingEnabled: false }
      )
    ).toBe(false);
  });

  it("creates live update messages for offscreen audio and subtitles", () => {
    const settings = {
      ...defaultSettings,
      subtitlesEnabled: true,
      originalVolume: 0.1,
      translatedVolume: 0.8,
      subtitleSize: 31
    };

    expect(runtimeMessagesForSettingsUpdate(settings)).toEqual([
      { type: "offscreen.settings", settings },
      {
        type: "subtitle.settings",
        subtitleSize: 31,
        visible: true,
        floatingVisible: true,
        fullscreenVisible: true
      }
    ]);
  });

  it("stops offscreen capture on non-retryable backend errors", () => {
    expect(
      shouldStopOffscreenForApiEvent({
        type: "error",
        code: "missing_dashscope_key",
        message: "DASHSCOPE_API_KEY is required on the API server.",
        retryable: false
      })
    ).toBe(true);

    expect(
      shouldStopOffscreenForApiEvent({
        type: "error",
        code: "upstream_error",
        message: "Temporary upstream failure.",
        retryable: true
      })
    ).toBe(false);
    expect(shouldStopOffscreenForApiEvent({ type: "translation.partial", text: "你好", stash: "" })).toBe(false);
  });
});
