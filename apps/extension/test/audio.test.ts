import { describe, expect, it } from "vitest";
import {
  captureBufferDurationMs,
  downsampleFloat32,
  floatToPcm16Base64,
  mergeTranscript,
  shouldDropTranslatedAudioForRealtime,
  MAX_TRANSLATED_AUDIO_QUEUE_SECONDS,
  REALTIME_CAPTURE_BUFFER_SIZE
} from "../src/audio";

describe("browser audio helpers", () => {
  it("converts float samples to base64 encoded PCM16", () => {
    const encoded = floatToPcm16Base64(new Float32Array([-1, 0, 1]));

    expect(Buffer.from(encoded, "base64")).toEqual(Buffer.from([0, 128, 0, 0, 255, 127]));
  });

  it("prefers stable text while showing the latest stash", () => {
    expect(mergeTranscript("你好", "，世界")).toBe("你好，世界");
    expect(mergeTranscript("", "正在翻译")).toBe("正在翻译");
  });

  it("downsamples browser audio to the 16 kHz model input rate", () => {
    const input = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.75]);
    const output = downsampleFloat32(input, 48000, 16000);

    expect(output[0]).toBeCloseTo(0.25);
    expect(output[1]).toBeCloseTo(0.8333);
  });

  it("keeps realtime capture callbacks near 10 ms at the browser sample rate", () => {
    expect(REALTIME_CAPTURE_BUFFER_SIZE).toBe(512);
    expect(captureBufferDurationMs(REALTIME_CAPTURE_BUFFER_SIZE, 48000)).toBeLessThanOrEqual(12);
    expect(captureBufferDurationMs(4096, 48000)).toBeGreaterThan(80);
  });

  it("drops translated audio chunks when playback is already more than one second late", () => {
    expect(MAX_TRANSLATED_AUDIO_QUEUE_SECONDS).toBe(1);
    expect(shouldDropTranslatedAudioForRealtime(10, 10.8)).toBe(false);
    expect(shouldDropTranslatedAudioForRealtime(10, 11.01)).toBe(true);
    expect(shouldDropTranslatedAudioForRealtime(10, 9.9)).toBe(false);
  });
});
