import { describe, expect, it } from "vitest";
import { runMockE2eSmoke } from "../src/e2eSmoke";

describe("mock e2e smoke", () => {
  it("verifies auth, account status, websocket translation, playback latency, and summary", async () => {
    await expect(runMockE2eSmoke()).resolves.toMatchObject({
      account: {
        canStartSession: true,
        remainingMinutes: 60
      },
      receivedTranslation: true,
      receivedAudio: true,
      latencySummary: {
        count: 1
      }
    });
  });
});
