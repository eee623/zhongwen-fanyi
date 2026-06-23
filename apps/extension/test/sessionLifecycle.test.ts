import { describe, expect, it } from "vitest";
import { shouldStopSessionForTabUpdate } from "../src/sessionLifecycle";

describe("extension session lifecycle", () => {
  it("stops the active session when the captured tab reloads or navigates", () => {
    expect(shouldStopSessionForTabUpdate(7, 7, { status: "loading" })).toBe(true);
    expect(shouldStopSessionForTabUpdate(7, 7, { url: "https://example.com/next" })).toBe(true);
  });

  it("keeps the session running for unrelated tab updates and non-navigation changes", () => {
    expect(shouldStopSessionForTabUpdate(7, 8, { status: "loading" })).toBe(false);
    expect(shouldStopSessionForTabUpdate(undefined, 7, { status: "loading" })).toBe(false);
    expect(shouldStopSessionForTabUpdate(7, 7, { title: "Video title" })).toBe(false);
    expect(shouldStopSessionForTabUpdate(7, 7, { status: "complete" })).toBe(false);
  });
});
