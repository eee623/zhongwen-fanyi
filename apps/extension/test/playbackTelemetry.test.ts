import { describe, expect, it } from "vitest";
import { scheduleFirstPlaybackStarted } from "../src/playbackTelemetry";

describe("translated playback telemetry", () => {
  it("reports playbackStarted at the scheduled audio playback time", () => {
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const reports: number[] = [];
    const state = { playbackStartedReported: false };

    const timerId = scheduleFirstPlaybackStarted(state, 12.5, {
      currentTime: () => 10,
      now: () => 2000,
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return 42;
      },
      report: (at) => reports.push(at)
    });

    expect(timerId).toBe(42);
    expect(state.playbackStartedReported).toBe(true);
    expect(timers).toHaveLength(1);
    expect(timers[0].delayMs).toBe(2500);
    expect(reports).toEqual([]);

    timers[0].callback();

    expect(reports).toEqual([2000]);
  });

  it("reports immediately when playback is scheduled for now or the past", () => {
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const state = { playbackStartedReported: false };

    scheduleFirstPlaybackStarted(state, 9.8, {
      currentTime: () => 10,
      now: () => 2000,
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return 1;
      },
      report: () => undefined
    });

    expect(timers[0].delayMs).toBe(0);
  });

  it("only schedules the first translated playback mark once per session", () => {
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const state = { playbackStartedReported: false };
    const dependencies = {
      currentTime: () => 10,
      now: () => 2000,
      setTimeout: (callback: () => void, delayMs: number) => {
        timers.push({ callback, delayMs });
        return timers.length;
      },
      report: () => undefined
    };

    expect(scheduleFirstPlaybackStarted(state, 10.1, dependencies)).toBe(1);
    expect(scheduleFirstPlaybackStarted(state, 10.2, dependencies)).toBeUndefined();
    expect(timers).toHaveLength(1);
  });
});
