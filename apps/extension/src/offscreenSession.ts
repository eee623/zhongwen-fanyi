import type { ApiToClientMessage } from "@realtime-dubbing/shared";

export interface OffscreenBackendState {
  backendReady: boolean;
}

export function createOffscreenBackendState(): OffscreenBackendState {
  return {
    backendReady: false
  };
}

export function offscreenBackendStateFromApiEvent(
  state: OffscreenBackendState,
  event: ApiToClientMessage
): OffscreenBackendState {
  if (event.type === "session.ready") {
    return {
      ...state,
      backendReady: true
    };
  }

  return state;
}

export function shouldSendCapturedAudio(
  state: OffscreenBackendState,
  websocketReadyState: number,
  openReadyState = WebSocket.OPEN
): boolean {
  void state;
  return websocketReadyState === openReadyState;
}
