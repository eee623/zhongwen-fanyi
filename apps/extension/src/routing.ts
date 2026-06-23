import type { ApiToClientMessage, ExtensionSettings } from "@realtime-dubbing/shared";
import { mergeTranscript } from "./audio";
import type { ContentMessage, RuntimeMessage } from "./messages";

export function contentMessageFromApiEvent(
  event: ApiToClientMessage,
  settings: ExtensionSettings
): ContentMessage | undefined {
  const visibility = subtitleVisibilityFromSettings(settings);
  if (event.type === "translation.partial") {
    return {
      type: "subtitle.update",
      text: event.text,
      stash: event.stash,
      subtitleSize: settings.subtitleSize,
      ...visibility
    };
  }

  if (event.type === "translation.final") {
    return {
      type: "subtitle.update",
      text: mergeTranscript(event.text),
      subtitleSize: settings.subtitleSize,
      ...visibility
    };
  }

  return undefined;
}

export function shouldPlayTranslatedAudio(
  event: ApiToClientMessage,
  settings: ExtensionSettings
): event is Extract<ApiToClientMessage, { type: "audio.delta" }> {
  return event.type === "audio.delta" && settings.dubbingEnabled && event.audioBase64.length > 0;
}

export function shouldStopOffscreenForApiEvent(event: ApiToClientMessage): boolean {
  return event.type === "error" && !event.retryable;
}

export function runtimeMessagesForSettingsUpdate(settings: ExtensionSettings): RuntimeMessage[] {
  return [
    {
      type: "offscreen.settings",
      settings
    },
    {
      type: "subtitle.settings",
      subtitleSize: settings.subtitleSize,
      ...subtitleVisibilityFromSettings(settings)
    }
  ];
}

export function subtitleVisibilityFromSettings(settings: ExtensionSettings) {
  return {
    visible: settings.subtitlesEnabled,
    floatingVisible: settings.subtitlesEnabled && settings.floatingSubtitles,
    fullscreenVisible: settings.subtitlesEnabled && settings.fullscreenSubtitles
  };
}
