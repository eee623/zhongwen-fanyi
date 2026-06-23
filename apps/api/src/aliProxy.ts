import { nanoid } from "nanoid";
import type { ApiToClientMessage } from "@realtime-dubbing/shared";
import {
  ALI_LIVE_TRANSLATE_MODEL,
  buildAliSessionUpdate,
  defaultSettings
} from "@realtime-dubbing/shared";

export interface AliRealtimeUrlOptions {
  endpoint: string;
  model?: string;
}

export interface InputAudioAppendEvent {
  event_id: string;
  type: "input_audio_buffer.append";
  audio: string;
}

export type AliServerEvent = {
  type?: string;
  [key: string]: unknown;
};

export function buildAliRealtimeUrl({
  endpoint,
  model = ALI_LIVE_TRANSLATE_MODEL
}: AliRealtimeUrlOptions): string {
  const url = new URL(endpoint);
  url.searchParams.set("model", model);
  return url.toString();
}

export function buildAliAuthorizationHeaders(apiKey: string): string[] {
  return [`Authorization: Bearer ${apiKey}`];
}

export function createAliSessionUpdateEvent(eventId = `event_${nanoid()}`) {
  return buildAliSessionUpdate(defaultSettings, eventId);
}

export function createInputAudioAppendEvent(
  audioBase64: string,
  eventId = `event_${nanoid()}`
): InputAudioAppendEvent {
  return {
    event_id: eventId,
    type: "input_audio_buffer.append",
    audio: audioBase64
  };
}

export function createSessionFinishEvent(eventId = `event_${nanoid()}`) {
  return {
    event_id: eventId,
    type: "session.finish" as const
  };
}

export function createClientEventFromAliEvent(event: AliServerEvent): ApiToClientMessage | undefined {
  switch (event.type) {
    case "response.audio_transcript.text":
    case "response.text.text":
      return {
        type: "translation.partial",
        text: asString(event.text),
        stash: asString(event.stash),
        responseId: asOptionalString(event.response_id)
      };
    case "response.audio_transcript.done":
    case "response.text.done":
      return {
        type: "translation.final",
        text: asString(event.transcript ?? event.text),
        responseId: asOptionalString(event.response_id)
      };
    case "response.audio.delta":
      return {
        type: "audio.delta",
        audioBase64: asString(event.delta),
        responseId: asOptionalString(event.response_id),
        sampleRate: 16000,
        format: "pcm"
      };
    case "response.done":
      return {
        type: "usage",
        usage: getRecord(event.response)?.usage ?? null
      };
    case "session.created":
    case "session.updated":
      return undefined;
    case "error": {
      const error = getRecord(event.error);
      return {
        type: "error",
        code: asString(error?.code ?? "ali_error"),
        message: asString(error?.message ?? "Ali LiveTranslate returned an error."),
        retryable: false
      };
    }
    default:
      return undefined;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

