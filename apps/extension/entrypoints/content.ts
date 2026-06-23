import { defineContentScript } from "wxt/utils/define-content-script";
import { mergeTranscript } from "../src/audio";
import { extractForwardedRuntimeMessage } from "../src/contentForwarding";
import type { RuntimeMessage } from "../src/messages";
import { ensureSubtitleOverlayMounted, resolveSubtitleDisplay, SUBTITLE_OVERLAY_ID } from "../src/subtitleOverlay";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    const overlay = createOverlay();
    let subtitleSize = 24;
    let visible = true;
    let floatingVisible = true;
    let fullscreenVisible = true;

    document.addEventListener("fullscreenchange", () => {
      ensureSubtitleOverlayMounted(document, overlay);
      applyDisplay(overlay, visible, floatingVisible, fullscreenVisible);
    });

    chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
      const forwardedMessage = extractForwardedRuntimeMessage(message);
      if (forwardedMessage) {
        chrome.runtime.sendMessage(forwardedMessage, (response) => {
          sendResponse({
            response,
            lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null
          });
        });
        return true;
      }

      if (message.type === "subtitle.update") {
        ensureSubtitleOverlayMounted(document, overlay);
        subtitleSize = message.subtitleSize;
        visible = message.visible;
        floatingVisible = message.floatingVisible;
        fullscreenVisible = message.fullscreenVisible;
        overlay.textContent = mergeTranscript(message.text, message.stash);
        overlay.style.fontSize = `${subtitleSize}px`;
        applyDisplay(overlay, visible, floatingVisible, fullscreenVisible);
      }

      if (message.type === "subtitle.settings") {
        ensureSubtitleOverlayMounted(document, overlay);
        subtitleSize = message.subtitleSize;
        visible = message.visible;
        floatingVisible = message.floatingVisible;
        fullscreenVisible = message.fullscreenVisible;
        overlay.style.fontSize = `${subtitleSize}px`;
        applyDisplay(overlay, visible, floatingVisible, fullscreenVisible);
      }

      if (message.type === "subtitle.clear") {
        overlay.textContent = "";
        overlay.style.display = "none";
      }
      return false;
    });
  }
});

function applyDisplay(
  overlay: HTMLDivElement,
  visible: boolean,
  floatingVisible: boolean,
  fullscreenVisible: boolean
) {
  overlay.style.display = resolveSubtitleDisplay({
    hasText: Boolean(overlay.textContent),
    visible,
    floatingVisible,
    fullscreenVisible,
    isFullscreen: Boolean(document.fullscreenElement)
  });
}

function createOverlay(): HTMLDivElement {
  const existing = document.getElementById(SUBTITLE_OVERLAY_ID);
  if (existing instanceof HTMLDivElement) {
    ensureSubtitleOverlayMounted(document, existing);
    return existing;
  }

  const overlay = document.createElement("div");
  overlay.id = SUBTITLE_OVERLAY_ID;
  overlay.setAttribute("aria-live", "polite");
  Object.assign(overlay.style, {
    position: "fixed",
    left: "50%",
    bottom: "9vh",
    transform: "translateX(-50%)",
    maxWidth: "min(86vw, 980px)",
    zIndex: "2147483647",
    display: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    background: "rgba(10, 12, 20, 0.72)",
    color: "#ffffff",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontWeight: "700",
    lineHeight: "1.35",
    textAlign: "center",
    textShadow: "0 1px 3px rgba(0, 0, 0, 0.65)",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    boxShadow: "0 10px 34px rgba(0, 0, 0, 0.26)"
  });

  ensureSubtitleOverlayMounted(document, overlay);
  return overlay;
}
