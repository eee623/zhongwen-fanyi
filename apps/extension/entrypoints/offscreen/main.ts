import type { ApiToClientMessage, ClientToApiMessage, ExtensionSettings } from "@realtime-dubbing/shared";
import {
  base64Pcm16ToAudioBuffer,
  downsampleFloat32,
  floatToPcm16Base64,
  REALTIME_CAPTURE_BUFFER_SIZE,
  shouldDropTranslatedAudioForRealtime
} from "../../src/audio";
import {
  createPlaybackStartedMessage,
  createPreviewPlaybackStartedMessage,
  createTranslatedAudioDroppedMessage
} from "../../src/latency";
import type { RuntimeMessage } from "../../src/messages";
import {
  createOffscreenBackendState,
  offscreenBackendStateFromApiEvent,
  shouldSendCapturedAudio,
  type OffscreenBackendState
} from "../../src/offscreenSession";
import { scheduleFirstPlaybackStarted, type PlaybackTelemetryState } from "../../src/playbackTelemetry";
import {
  createPreviewSpeechState,
  previewSpeechStateFromApiEvent,
  previewTextFromApiEvent,
  shouldCancelPreviewSpeechForApiEvent,
  type PreviewSpeechState
} from "../../src/previewSpeech";
import { shouldPlayTranslatedAudio, shouldStopOffscreenForApiEvent } from "../../src/routing";

interface AudioSession extends PlaybackTelemetryState {
  audioContext: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  originalGain: GainNode;
  translatedGain: GainNode;
  processor: ScriptProcessorNode;
  websocket: WebSocket;
  nextPlaybackTime: number;
  playbackTelemetryTimers: number[];
  backendState: OffscreenBackendState;
  previewSpeechState: PreviewSpeechState;
  settings: ExtensionSettings;
}

let activeSession: AudioSession | undefined;

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "offscreen.start") {
    void startSession(message.streamId, message.settings, message.clientToken);
  }
  if (message.type === "offscreen.stop") {
    stopSession();
  }
  if (message.type === "offscreen.settings" && activeSession) {
    activeSession.settings = message.settings;
    activeSession.originalGain.gain.value = message.settings.originalVolume;
    activeSession.translatedGain.gain.value = message.settings.translatedVolume;
  }
});

async function startSession(streamId: string, settings: ExtensionSettings, clientToken: string) {
  stopSession();
  notifyStatus("starting");

  try {
    const stream = await getTabStream(streamId);
    const audioContext = new AudioContext({ sampleRate: 48000 });
    const source = audioContext.createMediaStreamSource(stream);
    const originalGain = audioContext.createGain();
    const translatedGain = audioContext.createGain();
    const processor = audioContext.createScriptProcessor(REALTIME_CAPTURE_BUFFER_SIZE, 1, 1);
    const websocket = new WebSocket(withClientToken(settings.backendUrl, clientToken));
    const session: AudioSession = {
      audioContext,
      stream,
      source,
      originalGain,
      translatedGain,
      processor,
      websocket,
      nextPlaybackTime: audioContext.currentTime,
      playbackStartedReported: false,
      playbackTelemetryTimers: [],
      backendState: createOffscreenBackendState(),
      previewSpeechState: createPreviewSpeechState(),
      settings
    };

    activeSession = session;
    originalGain.gain.value = settings.originalVolume;
    translatedGain.gain.value = settings.translatedVolume;
    translatedGain.connect(audioContext.destination);
    source.connect(originalGain);
    originalGain.connect(audioContext.destination);
    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (event) => {
      if (!shouldSendCapturedAudio(session.backendState, websocket.readyState)) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const resampled = downsampleFloat32(input, audioContext.sampleRate, 16000);
      sendBackend(websocket, {
        type: "audio.append",
        audioBase64: floatToPcm16Base64(resampled),
        capturedAt: Date.now()
      });
    };

    websocket.addEventListener("open", () => {
      sendBackend(websocket, {
        type: "session.start",
        settings,
        startedAt: Date.now()
      });
    });

    websocket.addEventListener("message", (event) => {
      const apiEvent = parseApiEvent(event.data);
      if (!apiEvent) {
        return;
      }
      const nextBackendState = offscreenBackendStateFromApiEvent(session.backendState, apiEvent);
      if (!session.backendState.backendReady && nextBackendState.backendReady) {
        notifyStatus("running");
      }
      session.backendState = nextBackendState;
      void chrome.runtime.sendMessage({ type: "offscreen.api-event", event: apiEvent } satisfies RuntimeMessage);
      const previewText = previewTextFromApiEvent(apiEvent, session.settings, session.previewSpeechState);
      const previewSpoken = previewText
        ? speakLowLatencyPreview(previewText, session.settings, (at) => reportPreviewPlaybackStarted(session, at))
        : false;
      if (shouldCancelPreviewSpeechForApiEvent(session.previewSpeechState, apiEvent)) {
        window.speechSynthesis?.cancel();
      }
      session.previewSpeechState = previewSpeechStateFromApiEvent(session.previewSpeechState, apiEvent, previewSpoken);
      if (shouldPlayTranslatedAudio(apiEvent, session.settings)) {
        playTranslatedAudio(session, apiEvent.audioBase64);
      }
      if (shouldStopOffscreenForApiEvent(apiEvent)) {
        stopSession();
      }
    });

    websocket.addEventListener("close", () => {
      notifyStatus("stopped");
    });

    websocket.addEventListener("error", () => {
      notifyStatus("error", "Backend WebSocket error.");
    });
  } catch (error) {
    notifyStatus("error", error instanceof Error ? error.message : "Failed to start offscreen audio session.");
  }
}

function stopSession() {
  if (!activeSession) {
    return;
  }

  sendBackend(activeSession.websocket, {
    type: "session.finish",
    finishedAt: Date.now()
  });
  activeSession.processor.disconnect();
  activeSession.source.disconnect();
  activeSession.originalGain.disconnect();
  activeSession.translatedGain.disconnect();
  activeSession.stream.getTracks().forEach((track) => track.stop());
  activeSession.playbackTelemetryTimers.forEach((timer) => window.clearTimeout(timer));
  window.speechSynthesis?.cancel();
  activeSession.websocket.close(1000, "offscreen.stop");
  void activeSession.audioContext.close();
  activeSession = undefined;
  notifyStatus("stopped");
}

async function getTabStream(streamId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    } as MediaTrackConstraints,
    video: false
  });
}

function speakLowLatencyPreview(text: string, settings: ExtensionSettings, onStart: (at: number) => void): boolean {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.volume = settings.translatedVolume;
  utterance.rate = 1.05;
  utterance.onstart = () => onStart(Date.now());
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

function playTranslatedAudio(session: AudioSession, audioBase64: string) {
  const queuedSeconds = session.nextPlaybackTime - session.audioContext.currentTime;
  if (shouldDropTranslatedAudioForRealtime(session.audioContext.currentTime, session.nextPlaybackTime)) {
    sendBackend(session.websocket, createTranslatedAudioDroppedMessage(Date.now(), queuedSeconds));
    return;
  }

  const buffer = base64Pcm16ToAudioBuffer(session.audioContext, audioBase64, 16000);
  const source = session.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(session.translatedGain);
  const startAt = Math.max(session.audioContext.currentTime, session.nextPlaybackTime);
  source.start(startAt);
  session.nextPlaybackTime = startAt + buffer.duration;

  const timer = scheduleFirstPlaybackStarted(session, startAt, {
    currentTime: () => session.audioContext.currentTime,
    now: Date.now,
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    report: (at) => reportPlaybackStarted(session, at)
  });
  if (timer !== undefined) {
    session.playbackTelemetryTimers.push(timer);
  }
}

function reportPlaybackStarted(session: AudioSession, at: number) {
  const playbackStarted = createPlaybackStartedMessage(at);
  sendBackend(session.websocket, playbackStarted);
  void chrome.runtime.sendMessage({
    type: "offscreen.api-event",
    event: playbackStarted
  } satisfies RuntimeMessage);
}

function reportPreviewPlaybackStarted(session: AudioSession, at: number) {
  const previewPlaybackStarted = createPreviewPlaybackStartedMessage(at);
  sendBackend(session.websocket, previewPlaybackStarted);
  void chrome.runtime.sendMessage({
    type: "offscreen.api-event",
    event: previewPlaybackStarted
  } satisfies RuntimeMessage);
}

function sendBackend(websocket: WebSocket, message: ClientToApiMessage) {
  if (websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
  }
}

function parseApiEvent(data: unknown): ApiToClientMessage | undefined {
  try {
    return JSON.parse(String(data)) as ApiToClientMessage;
  } catch {
    return undefined;
  }
}

function withClientToken(backendUrl: string, clientToken: string): string {
  const url = new URL(backendUrl);
  url.searchParams.set("token", clientToken);
  return url.toString();
}

function notifyStatus(status: "idle" | "starting" | "running" | "stopped" | "error", message?: string) {
  void chrome.runtime.sendMessage({
    type: "offscreen.status",
    status,
    message
  } satisfies RuntimeMessage);
}
