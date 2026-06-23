export const SUBTITLE_OVERLAY_ID = "realtime-dubbing-subtitle";

export interface SubtitleHost {
  append(node: unknown): void;
}

export interface SubtitleOverlayNode {
  parentElement: unknown | null;
}

export interface SubtitleHostDocument {
  documentElement: SubtitleHost;
  fullscreenElement: SubtitleHost | null;
}

export interface SubtitleDisplayOptions {
  hasText: boolean;
  visible: boolean;
  floatingVisible: boolean;
  fullscreenVisible: boolean;
  isFullscreen: boolean;
}

export function resolveSubtitleHost(documentLike: SubtitleHostDocument): SubtitleHost {
  return documentLike.fullscreenElement ?? documentLike.documentElement;
}

export function ensureSubtitleOverlayMounted(
  documentLike: SubtitleHostDocument,
  overlay: SubtitleOverlayNode
): void {
  const host = resolveSubtitleHost(documentLike);
  if (overlay.parentElement !== host) {
    host.append(overlay);
  }
}

export function resolveSubtitleDisplay(options: SubtitleDisplayOptions): "block" | "none" {
  if (!options.hasText || !options.visible) {
    return "none";
  }

  const modeVisible = options.isFullscreen ? options.fullscreenVisible : options.floatingVisible;
  return modeVisible ? "block" : "none";
}
