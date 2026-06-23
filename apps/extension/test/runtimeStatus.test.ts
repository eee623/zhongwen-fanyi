import { describe, expect, it } from "vitest";
import { runtimeStatusFromOffscreenStatus } from "../src/runtimeStatus";

describe("background runtime status", () => {
  it("keeps the active tab while offscreen is starting or running", () => {
    expect(runtimeStatusFromOffscreenStatus({ status: "starting" }, 42)).toEqual({
      running: true,
      tabId: 42
    });
    expect(runtimeStatusFromOffscreenStatus({ status: "running" }, 42)).toEqual({
      running: true,
      tabId: 42
    });
  });

  it("clears the active tab when offscreen stops or errors", () => {
    expect(runtimeStatusFromOffscreenStatus({ status: "stopped" }, 42)).toEqual({
      running: false
    });
    expect(runtimeStatusFromOffscreenStatus({ status: "error", message: "Backend WebSocket error." }, 42)).toEqual({
      running: false,
      lastError: "Backend WebSocket error."
    });
  });
});
