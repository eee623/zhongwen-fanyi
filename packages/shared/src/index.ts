export type LanguageCode = "en" | "zh";

export type TranslationProvider = "aliyun-live-translate" | "mock-live-translate";

export type VoiceCloneFrequency = "once" | "always";

export interface ExtensionSettings {
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  provider: TranslationProvider;
  voiceCloneFrequency: VoiceCloneFrequency;
  lowLatencyPreviewEnabled: boolean;
  subtitlesEnabled: boolean;
  dubbingEnabled: boolean;
  originalVolume: number;
  translatedVolume: number;
  subtitleSize: number;
  floatingSubtitles: boolean;
  fullscreenSubtitles: boolean;
  backendUrl: string;
}

export interface AliSessionUpdateEvent {
  event_id: string;
  type: "session.update";
  session: {
    modalities: ["text"] | ["text", "audio"];
    voice: "default";
    enable_voice_clone: true;
    voice_clone_options: {
      frequency: VoiceCloneFrequency;
    };
    sample_rate: 16000;
    input_audio_format: "pcm";
    output_audio_format: "pcm";
    input_audio_transcription: {
      model: "qwen3-asr-flash-realtime";
      language: LanguageCode;
    };
    translation: {
      language: LanguageCode;
    };
  };
}

export type ClientToApiMessage =
  | {
      type: "session.start";
      settings: ExtensionSettings;
      tabId?: number;
      startedAt: number;
    }
  | {
      type: "audio.append";
      audioBase64: string;
      capturedAt: number;
    }
  | {
      type: "latency.mark";
      mark: LatencyMarkName;
      at: number;
    }
  | {
      type: "audio.drop";
      reason: "translated_audio_queue_overflow";
      droppedAt: number;
      queuedSeconds: number;
    }
  | {
      type: "session.finish";
      finishedAt: number;
    };

export type ApiToClientMessage =
  | {
      type: "session.ready";
      sessionId: string;
    }
  | {
      type: "translation.partial";
      text: string;
      stash: string;
      responseId?: string;
    }
  | {
      type: "translation.final";
      text: string;
      responseId?: string;
    }
  | {
      type: "audio.delta";
      audioBase64: string;
      responseId?: string;
      sampleRate: 16000;
      format: "pcm";
    }
  | {
      type: "usage";
      usage: unknown;
    }
  | {
      type: "latency.mark";
      mark: LatencyMarkName;
      at: number;
    }
  | {
      type: "error";
      code: string;
      message: string;
      retryable: boolean;
    };

export type LatencyMarkName =
  | "sessionStarted"
  | "audioInput"
  | "sentToAli"
  | "firstText"
  | "previewPlaybackStarted"
  | "firstTranslatedAudio"
  | "playbackStarted";

export interface LatencySnapshot {
  inputToSentToAliMs?: number;
  inputToFirstTextMs?: number;
  inputToPreviewPlaybackMs?: number;
  inputToFirstAudioMs?: number;
  inputToPlaybackMs?: number;
  sentToAliToFirstTextMs?: number;
  sentToAliToFirstAudioMs?: number;
  sessionToFirstAudioMs?: number;
  translatedAudioDroppedChunks?: number;
}

export const ALI_LIVE_TRANSLATE_MODEL = "qwen3.5-livetranslate-flash-realtime";

export const defaultSettings: ExtensionSettings = {
  sourceLanguage: "en",
  targetLanguage: "zh",
  provider: "aliyun-live-translate",
  voiceCloneFrequency: "always",
  lowLatencyPreviewEnabled: true,
  subtitlesEnabled: true,
  dubbingEnabled: true,
  originalVolume: 0.2,
  translatedVolume: 0.9,
  subtitleSize: 24,
  floatingSubtitles: true,
  fullscreenSubtitles: true,
  backendUrl: "ws://localhost:8787/v1/live"
};

export function normalizeSettings(settings: Partial<ExtensionSettings>): ExtensionSettings {
  const merged = {
    ...defaultSettings,
    ...settings
  };

  return {
    ...merged,
    voiceCloneFrequency: normalizeVoiceCloneFrequency(merged.voiceCloneFrequency),
    lowLatencyPreviewEnabled: normalizeBoolean(
      merged.lowLatencyPreviewEnabled,
      defaultSettings.lowLatencyPreviewEnabled
    ),
    originalVolume: clamp(merged.originalVolume, 0, 1),
    translatedVolume: clamp(merged.translatedVolume, 0, 1),
    subtitleSize: Math.round(clamp(merged.subtitleSize, 14, 40))
  };
}

export function buildAliSessionUpdate(
  settings: ExtensionSettings,
  eventId = "event_session_update"
): AliSessionUpdateEvent {
  const normalized = normalizeSettings(settings);

  return {
    event_id: eventId,
    type: "session.update",
    session: {
      modalities: normalized.dubbingEnabled ? ["text", "audio"] : ["text"],
      voice: "default",
      enable_voice_clone: true,
      voice_clone_options: {
        frequency: normalized.voiceCloneFrequency
      },
      sample_rate: 16000,
      input_audio_format: "pcm",
      output_audio_format: "pcm",
      input_audio_transcription: {
        model: "qwen3-asr-flash-realtime",
        language: normalized.sourceLanguage
      },
      translation: {
        language: normalized.targetLanguage
      }
    }
  };
}

export function createLatencyTracker(sessionStartedAt = Date.now()) {
  const marks = new Map<LatencyMarkName, number>([["sessionStarted", sessionStartedAt]]);

  return {
    mark(name: LatencyMarkName, at = Date.now()) {
      if (!marks.has(name)) {
        marks.set(name, at);
      }
    },
    snapshot(): LatencySnapshot {
      const sessionStarted = marks.get("sessionStarted");
      const audioInput = marks.get("audioInput");
      const sentToAli = marks.get("sentToAli");
      const firstText = marks.get("firstText");
      const previewPlaybackStarted = marks.get("previewPlaybackStarted");
      const firstTranslatedAudio = marks.get("firstTranslatedAudio");
      const playbackStarted = marks.get("playbackStarted");

      return {
        inputToSentToAliMs: diff(audioInput, sentToAli),
        inputToFirstTextMs: diff(audioInput, firstText),
        inputToPreviewPlaybackMs: diff(audioInput, previewPlaybackStarted),
        inputToFirstAudioMs: diff(audioInput, firstTranslatedAudio),
        inputToPlaybackMs: diff(audioInput, playbackStarted),
        sentToAliToFirstTextMs: diff(sentToAli, firstText),
        sentToAliToFirstAudioMs: diff(sentToAli, firstTranslatedAudio),
        sessionToFirstAudioMs: diff(sessionStarted, firstTranslatedAudio)
      };
    }
  };
}

function normalizeVoiceCloneFrequency(value: unknown): VoiceCloneFrequency {
  return value === "once" || value === "always" ? value : "always";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function diff(start?: number, end?: number): number | undefined {
  if (start === undefined || end === undefined) {
    return undefined;
  }
  return Math.max(0, end - start);
}
