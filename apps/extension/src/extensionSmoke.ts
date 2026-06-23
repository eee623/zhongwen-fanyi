import { defaultSettings, type ExtensionSettings } from "@realtime-dubbing/shared";

export function createExtensionSmokeSettings(backendUrl: string): ExtensionSettings {
  return {
    ...defaultSettings,
    provider: "mock-live-translate",
    backendUrl,
    originalVolume: 0.2,
    translatedVolume: 0.9,
    subtitlesEnabled: true,
    dubbingEnabled: true
  };
}

export function createExtensionStartExpression(settings: ExtensionSettings, clientToken: string): string {
  return `new Promise((resolve) => {
  chrome.runtime.sendMessage(${JSON.stringify(
    {
      type: "popup.start",
      settings,
      clientToken
    },
    null,
    2
  )}, (response) => {
    resolve({
      response,
      lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
    });
  });
})`;
}

export function createInjectedExtensionStartExpression(
  manualPageUrl: string,
  settings: ExtensionSettings,
  clientToken: string
): string {
  return createInjectedExtensionMessageExpression(manualPageUrl, {
    type: "popup.start",
    settings,
    clientToken
  });
}

export function createInjectedExtensionStopExpression(manualPageUrl: string): string {
  return createInjectedExtensionMessageExpression(manualPageUrl, {
    type: "popup.stop"
  });
}

export function createManualPagePlaybackExpression(): string {
  return `(async () => {
  const prepareButton = document.getElementById("prepareButton");
  const playButton = document.getElementById("playButton");
  if (!(prepareButton instanceof HTMLButtonElement) || !(playButton instanceof HTMLButtonElement)) {
    return { ok: false, error: "manual_test_buttons_missing" };
  }
  if (!window.__dubbingManualTest?.ready) {
    prepareButton.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  playButton.click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { ok: true, manualTest: window.__dubbingManualTest };
})()`;
}

export function createContentScriptReadyExpression(): string {
  return `Boolean(document.getElementById("realtime-dubbing-subtitle"))`;
}

export function createSubtitleProbeExpression(expectedText: string): string {
  return `(() => {
  const overlay = document.getElementById("realtime-dubbing-subtitle");
  const text = overlay?.textContent ?? "";
  return {
    found: Boolean(overlay),
    text,
    display: overlay instanceof HTMLElement ? getComputedStyle(overlay).display : null,
    matched: text.includes(${JSON.stringify(expectedText)})
  };
})()`;
}

export function describeExtensionStartRejection(startObject: unknown): string {
  const rawResponse = safeJson(startObject);
  const messages = collectStringValues(startObject);
  const activeTabDenied = messages.some((message) =>
    message.includes("Extension has not been invoked for the current page")
  );

  if (activeTabDenied) {
    return [
      "Extension start was rejected because Chrome did not grant activeTab for the current tab.",
      "For Chrome Web Store compliance, open the extension action popup from the target page and click Start;",
      "do not bypass activeTab or start tabCapture without a user invocation.",
      `Raw response: ${rawResponse}`
    ].join(" ");
  }

  return `Extension start was rejected: ${rawResponse}`;
}

function createInjectedExtensionMessageExpression(manualPageUrl: string, message: unknown): string {
  return `(async () => {
  const tabs = await chrome.tabs.query({});
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs.find((candidate) => candidate.url === ${JSON.stringify(manualPageUrl)}) ?? activeTab;
  if (!tab || typeof tab.id !== "number") {
    return { lastError: "manual_tab_not_found" };
  }
  await chrome.tabs.update(tab.id, { active: true });
  const forwardedMessage = {
      type: "content.forward-runtime-message",
      message: ${JSON.stringify(message, null, 2)}
    };
  const forwarded = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, forwardedMessage, (response) => {
      resolve({
        response,
        lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
      });
    });
  });
  if (!forwarded.lastError) {
    return forwarded;
  }
  if (chrome.scripting && typeof chrome.scripting.executeScript === "function") {
    return new Promise((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: (runtimeMessage) =>
            new Promise((resolveInjected) => {
              chrome.runtime.sendMessage(runtimeMessage, (response) => {
                resolveInjected({
                  response,
                  lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
                });
              });
            }),
          args: [${JSON.stringify(message, null, 2)}]
        },
        (results) => {
          const injected = results?.[0]?.result;
          resolve({
            response: injected?.response,
            lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : injected?.lastError ?? null,
            fallback: "chrome.scripting.executeScript",
            forwardedLastError: forwarded.lastError,
            availableApis: Object.keys(chrome).sort()
          });
        }
      );
    });
  }
  if (typeof chrome.tabs.executeScript === "function") {
    return new Promise((resolve) => {
      chrome.tabs.executeScript(
        tab.id,
        {
          code: ${JSON.stringify(`chrome.runtime.sendMessage(${JSON.stringify(message)}, (response) => response);`)}
        },
        () => {
          resolve({
            response: { ok: !chrome.runtime.lastError },
            lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
            fallback: "chrome.tabs.executeScript",
            forwardedLastError: forwarded.lastError,
            availableApis: Object.keys(chrome).sort()
          });
        }
      );
    });
  }
  return {
    ...forwarded,
    availableApis: Object.keys(chrome).sort(),
    tabsApis: Object.keys(chrome.tabs ?? {}).sort()
  };
})()`;
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringValues(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }
  return [];
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
