import { describe, expect, it } from "vitest";
import { extractForwardedRuntimeMessage } from "../src/contentForwarding";
import type { RuntimeMessage } from "../src/messages";

describe("content runtime forwarding", () => {
  it("extracts extension-internal messages that the content script should forward", () => {
    const inner: RuntimeMessage = { type: "popup.stop" };

    expect(
      extractForwardedRuntimeMessage({
        type: "content.forward-runtime-message",
        message: inner
      })
    ).toBe(inner);
  });

  it("ignores ordinary subtitle messages", () => {
    expect(
      extractForwardedRuntimeMessage({
        type: "subtitle.clear"
      })
    ).toBeUndefined();
  });
});
