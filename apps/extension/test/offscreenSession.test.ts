import { describe, expect, it } from "vitest";
import {
  createOffscreenBackendState,
  offscreenBackendStateFromApiEvent,
  shouldSendCapturedAudio
} from "../src/offscreenSession";

describe("offscreen backend session readiness", () => {
  it("streams captured PCM as soon as the backend websocket is open", () => {
    const starting = createOffscreenBackendState();

    expect(shouldSendCapturedAudio(starting, WebSocket.OPEN)).toBe(true);
    expect(shouldSendCapturedAudio(starting, WebSocket.CONNECTING)).toBe(false);

    const ready = offscreenBackendStateFromApiEvent(starting, {
      type: "session.ready",
      sessionId: "sess_1"
    });

    expect(shouldSendCapturedAudio(ready, WebSocket.OPEN)).toBe(true);
    expect(shouldSendCapturedAudio(ready, WebSocket.CLOSED)).toBe(false);
  });

  it("continues streaming when translated content arrives before session.ready", () => {
    const state = offscreenBackendStateFromApiEvent(createOffscreenBackendState(), {
      type: "translation.partial",
      text: "你好",
      stash: "",
      responseId: "resp_1"
    });

    expect(shouldSendCapturedAudio(state, WebSocket.OPEN)).toBe(true);
  });
});
