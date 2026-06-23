import { describe, expect, it } from "vitest";
import {
  buildAliRealtimeUrl,
  createClientEventFromAliEvent,
  createInputAudioAppendEvent
} from "../src/aliProxy";

describe("Ali realtime proxy helpers", () => {
  it("builds the configured model URL without exposing the API key", () => {
    const url = buildAliRealtimeUrl({
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      model: "qwen3.5-livetranslate-flash-realtime"
    });

    expect(url).toBe(
      "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime"
    );
    expect(url).not.toContain("sk-");
  });

  it("wraps browser PCM chunks in Ali input_audio_buffer.append events", () => {
    const event = createInputAudioAppendEvent("AAAA", "event_test");

    expect(event).toEqual({
      event_id: "event_test",
      type: "input_audio_buffer.append",
      audio: "AAAA"
    });
  });

  it("maps Ali transcript and audio deltas into client messages", () => {
    expect(
      createClientEventFromAliEvent({
        type: "response.audio_transcript.text",
        text: "你好",
        stash: "世界",
        response_id: "resp_1"
      })
    ).toMatchObject({
      type: "translation.partial",
      text: "你好",
      stash: "世界",
      responseId: "resp_1"
    });

    expect(
      createClientEventFromAliEvent({
        type: "response.audio.delta",
        delta: "UklG",
        response_id: "resp_2"
      })
    ).toMatchObject({
      type: "audio.delta",
      audioBase64: "UklG",
      responseId: "resp_2"
    });
  });
});

