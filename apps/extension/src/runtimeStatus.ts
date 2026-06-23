import type { OffscreenEvent, RuntimeStatus } from "./messages";

type OffscreenStatusEvent = Extract<OffscreenEvent, { type: "offscreen.status" }>;
type OffscreenStatusPatch = Pick<OffscreenStatusEvent, "status" | "message">;

export function runtimeStatusFromOffscreenStatus(
  event: OffscreenStatusPatch,
  activeTabId: number | undefined
): RuntimeStatus {
  if (event.status === "running" || event.status === "starting") {
    return {
      running: true,
      tabId: activeTabId
    };
  }

  return {
    running: false,
    lastError: event.status === "error" ? event.message : undefined
  };
}
