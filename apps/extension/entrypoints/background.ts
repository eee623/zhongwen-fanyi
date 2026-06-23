import { defineBackground } from "wxt/utils/define-background";
import type { ApiToClientMessage } from "@realtime-dubbing/shared";
import { defaultSettings, type ExtensionSettings } from "@realtime-dubbing/shared";
import { fileAccessStatusForTabUrl, getCurrentTabFileAccessStatus, isFileUrl } from "../src/fileAccess";
import type { RuntimeMessage, RuntimeStatus } from "../src/messages";
import { contentMessageFromApiEvent, runtimeMessagesForSettingsUpdate, subtitleVisibilityFromSettings } from "../src/routing";
import { runtimeStatusFromOffscreenStatus } from "../src/runtimeStatus";
import { shouldStopSessionForTabUpdate } from "../src/sessionLifecycle";

export default defineBackground({
  type: "module",
  main() {
    let status: RuntimeStatus = { running: false };
    let activeTabId: number | undefined;
    let activeSettings: ExtensionSettings = defaultSettings;

    chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
      handleRuntimeMessage(message, sender)
        .then(sendResponse)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown extension error.";
          status = { running: false, lastError: message };
          sendResponse({ ok: false, error: message });
        });
      return true;
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === activeTabId) {
        void stopActiveSession(undefined, false);
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (shouldStopSessionForTabUpdate(activeTabId, tabId, changeInfo)) {
        void stopActiveSession("标签页已刷新或跳转，已停止同传", true);
      }
    });

    async function handleRuntimeMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender) {
      switch (message.type) {
        case "popup.get-status":
          return { ok: true, status };
        case "popup.get-file-access-status":
          return { ok: true, fileAccess: await getCurrentTabFileAccessStatus() };
        case "popup.open-extension-details":
          await chrome.tabs.create({ url: message.url });
          return { ok: true };
        case "popup.open-url":
          await chrome.tabs.create({ url: message.url });
          return { ok: true };
        case "popup.start": {
          const tab = await getActiveTab();
          if (!tab.id) {
            throw new Error("No active tab is available.");
          }
          const fileAccess = await getFileAccessStatusForTab(tab);
          if (!fileAccess.ok) {
            throw new Error(`${fileAccess.message}: ${fileAccess.manageUrl}`);
          }

          await ensureOffscreenDocument();
          const streamId = await getTabStreamId(tab.id);
          activeTabId = tab.id;
          activeSettings = message.settings;
          status = { running: true, tabId: tab.id };
          await sendToTab(tab.id, {
            type: "subtitle.settings",
            subtitleSize: message.settings.subtitleSize,
            ...subtitleVisibilityFromSettings(message.settings)
          });
          await chrome.runtime.sendMessage({
            type: "offscreen.start",
            streamId,
            tabId: tab.id,
            settings: message.settings,
            clientToken: message.clientToken
          } satisfies RuntimeMessage);
          return { ok: true, status };
        }
        case "popup.stop":
          await stopActiveSession(undefined, true);
          return { ok: true, status };
        case "popup.update-settings":
          activeSettings = message.settings;
          if (activeTabId) {
            const [offscreenMessage, subtitleMessage] = runtimeMessagesForSettingsUpdate(message.settings);
            await chrome.runtime.sendMessage(offscreenMessage);
            await sendToTab(activeTabId, subtitleMessage);
          }
          return { ok: true, status };
        case "offscreen.status":
          status = runtimeStatusFromOffscreenStatus(message, activeTabId);
          if (!status.running) {
            activeTabId = undefined;
          }
          return { ok: true };
        case "offscreen.api-event":
          await handleApiEvent(message.event, sender);
          return { ok: true };
        default:
          return { ok: true };
      }
    }

    async function stopActiveSession(lastError?: string, clearSubtitle = true): Promise<void> {
      const tabId = activeTabId;
      try {
        await chrome.runtime.sendMessage({ type: "offscreen.stop" } satisfies RuntimeMessage);
      } catch {
        // The offscreen document may not exist if startup failed before capture began.
      }

      if (clearSubtitle && tabId) {
        try {
          await sendToTab(tabId, { type: "subtitle.clear" });
        } catch {
          // The page may already be navigating or gone; stopping capture still matters most.
        }
      }

      status = { running: false, lastError };
      activeTabId = undefined;
    }

    async function handleApiEvent(event: ApiToClientMessage, sender: chrome.runtime.MessageSender) {
      const tabId = activeTabId ?? sender.tab?.id;
      if (!tabId) {
        return;
      }

      const contentMessage = contentMessageFromApiEvent(event, activeSettings);
      if (contentMessage) {
        await sendToTab(tabId, contentMessage);
      }
      if (event.type === "error") {
        status = { running: false, tabId, lastError: event.message };
      }
    }
  }
});

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab is available.");
  }
  return tab;
}

async function getFileAccessStatusForTab(tab: chrome.tabs.Tab) {
  const allowed = isFileUrl(tab.url) ? await chrome.extension.isAllowedFileSchemeAccess() : false;
  return fileAccessStatusForTabUrl(tab.url, allowed, chrome.runtime.id);
}

async function getTabStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(streamId);
    });
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = chrome.offscreen as typeof chrome.offscreen & {
    hasDocument?: () => Promise<boolean>;
  };
  const hasDocument = offscreen.hasDocument ? await offscreen.hasDocument() : false;
  if (hasDocument) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Capture tab audio, preserve original audio, and play translated Chinese dubbing."
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Only a single offscreen document")) {
      return;
    }
    throw error;
  }
}

async function sendToTab(tabId: number, message: RuntimeMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/content.js"]
    });
    await chrome.tabs.sendMessage(tabId, message);
  }
}
