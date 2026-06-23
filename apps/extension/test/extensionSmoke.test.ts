import { describe, expect, it } from "vitest";
import {
  createExtensionSmokeSettings,
  createContentScriptReadyExpression,
  createExtensionStartExpression,
  createInjectedExtensionStartExpression,
  createInjectedExtensionStopExpression,
  createManualPagePlaybackExpression,
  describeExtensionStartRejection,
  createSubtitleProbeExpression
} from "../src/extensionSmoke";

describe("extension smoke helpers", () => {
  it("creates mock settings for an HTTP manual page smoke run", () => {
    expect(createExtensionSmokeSettings("ws://127.0.0.1:8797/v1/live")).toMatchObject({
      provider: "mock-live-translate",
      backendUrl: "ws://127.0.0.1:8797/v1/live",
      subtitlesEnabled: true,
      dubbingEnabled: true
    });
  });

  it("builds the service worker expression that starts runtime capture", () => {
    const expression = createExtensionStartExpression(
      createExtensionSmokeSettings("ws://127.0.0.1:8797/v1/live"),
      "dev-client-token"
    );

    expect(expression).toContain("popup.start");
    expect(expression).toContain("dev-client-token");
    expect(expression).toContain("ws://127.0.0.1:8797/v1/live");
  });

  it("builds service worker expressions that inject extension messages into the manual tab", () => {
    const settings = createExtensionSmokeSettings("ws://127.0.0.1:8797/v1/live");
    const startExpression = createInjectedExtensionStartExpression(
      "http://127.0.0.1:8798/html5-player.html",
      settings,
      "dev-client-token"
    );
    const stopExpression = createInjectedExtensionStopExpression("http://127.0.0.1:8798/html5-player.html");

    expect(startExpression).toContain("chrome.tabs.sendMessage");
    expect(startExpression).toContain("chrome.scripting.executeScript");
    expect(startExpression).toContain("chrome.tabs.executeScript");
    expect(startExpression).toContain("content.forward-runtime-message");
    expect(startExpression).toContain("currentWindow: true");
    expect(startExpression).toContain("popup.start");
    expect(startExpression).toContain("fallback: \"chrome.scripting.executeScript\"");
    expect(startExpression).toContain("fallback: \"chrome.tabs.executeScript\"");
    expect(stopExpression).toContain("popup.stop");
  });

  it("builds page expressions for playback and subtitle verification", () => {
    expect(createContentScriptReadyExpression()).toContain("realtime-dubbing-subtitle");
    expect(createManualPagePlaybackExpression()).toContain("prepareButton");
    expect(createManualPagePlaybackExpression()).toContain("playButton");
    expect(createSubtitleProbeExpression("模拟中文同传")).toContain("realtime-dubbing-subtitle");
    expect(createSubtitleProbeExpression("模拟中文同传")).toContain("模拟中文同传");
  });

  it("explains activeTab invocation failures without suggesting a permission bypass", () => {
    const message = describeExtensionStartRejection({
      response: {
        response: {
          ok: false,
          error: "Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured."
        }
      }
    });

    expect(message).toContain("Chrome did not grant activeTab");
    expect(message).toContain("open the extension action popup");
    expect(message).toContain("do not bypass activeTab");
  });
});
