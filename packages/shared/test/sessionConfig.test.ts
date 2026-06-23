import { describe, expect, it } from "vitest";
import {
  buildAliSessionUpdate,
  createLatencyTracker,
  defaultSettings,
  normalizeSettings
} from "../src/index";

describe("Ali LiveTranslate session config", () => {
  it("enables realtime Chinese audio translation with dynamic voice cloning", () => {
    const event = buildAliSessionUpdate(defaultSettings);

    expect(event.type).toBe("session.update");
    expect(event.session).toMatchObject({
      modalities: ["text", "audio"],
      voice: "default",
      enable_voice_clone: true,
      voice_clone_options: { frequency: "always" },
      sample_rate: 16000,
      input_audio_format: "pcm",
      output_audio_format: "pcm",
      input_audio_transcription: {
        model: "qwen3-asr-flash-realtime",
        language: "en"
      },
      translation: { language: "zh" }
    });
  });

  it("allows single-speaker voice cloning mode for latency comparison", () => {
    const event = buildAliSessionUpdate({
      ...defaultSettings,
      voiceCloneFrequency: "once"
    });

    expect(event.session.voice_clone_options).toEqual({ frequency: "once" });
  });
});

describe("extension settings", () => {
  it("defaults voice cloning to dynamic multi-speaker tracking", () => {
    expect(defaultSettings.voiceCloneFrequency).toBe("always");
    expect(defaultSettings.lowLatencyPreviewEnabled).toBe(true);
    expect(normalizeSettings({ ...defaultSettings, voiceCloneFrequency: undefined }).voiceCloneFrequency).toBe("always");
    expect(normalizeSettings({ ...defaultSettings, lowLatencyPreviewEnabled: undefined }).lowLatencyPreviewEnabled).toBe(true);
  });

  it("rejects unsupported stored voice cloning frequencies", () => {
    const settings = normalizeSettings({
      ...defaultSettings,
      voiceCloneFrequency: "never"
    } as unknown as typeof defaultSettings);

    expect(settings.voiceCloneFrequency).toBe("always");
  });

  it("rejects unsupported stored low latency preview switches", () => {
    const settings = normalizeSettings({
      ...defaultSettings,
      lowLatencyPreviewEnabled: "yes"
    } as unknown as typeof defaultSettings);

    expect(settings.lowLatencyPreviewEnabled).toBe(true);
  });

  it("clamps user-controlled volumes and subtitle size", () => {
    const settings = normalizeSettings({
      ...defaultSettings,
      originalVolume: -4,
      translatedVolume: 3,
      subtitleSize: 80
    });

    expect(settings.originalVolume).toBe(0);
    expect(settings.translatedVolume).toBe(1);
    expect(settings.subtitleSize).toBe(40);
  });
});

describe("latency tracker", () => {
  it("records first audio latency separately from text latency", () => {
    const tracker = createLatencyTracker(1000);
    tracker.mark("audioInput", 1010);
    tracker.mark("sentToAli", 1040);
    tracker.mark("firstText", 1220);
    tracker.mark("previewPlaybackStarted", 1260);
    tracker.mark("firstTranslatedAudio", 1730);
    tracker.mark("playbackStarted", 1780);

    expect(tracker.snapshot()).toMatchObject({
      inputToSentToAliMs: 30,
      inputToFirstTextMs: 210,
      inputToPreviewPlaybackMs: 250,
      inputToFirstAudioMs: 720,
      inputToPlaybackMs: 770,
      sentToAliToFirstTextMs: 180,
      sentToAliToFirstAudioMs: 690
    });
  });
});
