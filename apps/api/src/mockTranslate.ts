import type { ApiToClientMessage } from "@realtime-dubbing/shared";

const MOCK_PCM_100MS = Buffer.alloc(1600 * 2).toString("base64");

export function createMockTranslateEvents(now = Date.now()): ApiToClientMessage[] {
  return [
    {
      type: "latency.mark",
      mark: "firstText",
      at: now
    },
    {
      type: "translation.partial",
      text: "模拟中文同传",
      stash: "",
      responseId: "mock_resp"
    },
    {
      type: "latency.mark",
      mark: "firstTranslatedAudio",
      at: now + 20
    },
    {
      type: "audio.delta",
      audioBase64: MOCK_PCM_100MS,
      responseId: "mock_resp",
      sampleRate: 16000,
      format: "pcm"
    }
  ];
}

