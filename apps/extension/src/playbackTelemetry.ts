export interface PlaybackTelemetryState {
  playbackStartedReported: boolean;
}

export interface PlaybackTelemetryDependencies<TTimer> {
  currentTime(): number;
  now(): number;
  report(at: number): void;
  setTimeout(callback: () => void, delayMs: number): TTimer;
}

export function scheduleFirstPlaybackStarted<TTimer>(
  state: PlaybackTelemetryState,
  scheduledAudioTime: number,
  dependencies: PlaybackTelemetryDependencies<TTimer>
): TTimer | undefined {
  if (state.playbackStartedReported) {
    return undefined;
  }

  state.playbackStartedReported = true;
  const delayMs = Math.max(0, Math.round((scheduledAudioTime - dependencies.currentTime()) * 1000));
  return dependencies.setTimeout(() => dependencies.report(dependencies.now()), delayMs);
}
