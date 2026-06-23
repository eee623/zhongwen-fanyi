import type { ApiToClientMessage, ExtensionSettings } from "@realtime-dubbing/shared";

export interface PreviewSpeechState {
  previewSpoken: boolean;
  clonedAudioStarted: boolean;
}

export function createPreviewSpeechState(): PreviewSpeechState {
  return {
    previewSpoken: false,
    clonedAudioStarted: false
  };
}

export function previewTextFromApiEvent(
  event: ApiToClientMessage,
  settings: ExtensionSettings,
  state: PreviewSpeechState
): string | undefined {
  if (!settings.dubbingEnabled || !settings.lowLatencyPreviewEnabled || state.previewSpoken || state.clonedAudioStarted) {
    return undefined;
  }
  if (event.type !== "translation.partial" && event.type !== "translation.final") {
    return undefined;
  }

  const text = event.type === "translation.partial" ? `${event.text}${event.stash}`.trim() : event.text.trim();
  return text || undefined;
}

export function previewSpeechStateFromApiEvent(
  state: PreviewSpeechState,
  event: ApiToClientMessage,
  previewSpoken: boolean
): PreviewSpeechState {
  return {
    previewSpoken: state.previewSpoken || previewSpoken,
    clonedAudioStarted: state.clonedAudioStarted || event.type === "audio.delta"
  };
}

export function shouldCancelPreviewSpeechForApiEvent(state: PreviewSpeechState, event: ApiToClientMessage): boolean {
  return state.previewSpoken && !state.clonedAudioStarted && event.type === "audio.delta";
}
