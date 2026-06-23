import { describe, expect, it } from "vitest";
import {
  ensureSubtitleOverlayMounted,
  resolveSubtitleDisplay,
  resolveSubtitleHost
} from "../src/subtitleOverlay";

interface FakeOverlay {
  parentElement: FakeHost | null;
}

interface FakeHost {
  name: string;
  children: FakeOverlay[];
  append(node: FakeOverlay): void;
}

function host(name: string): FakeHost {
  return {
    name,
    children: [],
    append(node) {
      node.parentElement = this;
      this.children.push(node);
    }
  };
}

describe("subtitle overlay host selection", () => {
  it("uses the fullscreen element as the subtitle host when a player is fullscreen", () => {
    const root = host("root");
    const player = host("player");

    expect(resolveSubtitleHost({ documentElement: root, fullscreenElement: player })).toBe(player);
  });

  it("falls back to the document root outside fullscreen", () => {
    const root = host("root");

    expect(resolveSubtitleHost({ documentElement: root, fullscreenElement: null })).toBe(root);
  });

  it("moves an existing subtitle overlay into the current fullscreen host", () => {
    const root = host("root");
    const player = host("player");
    const overlay: FakeOverlay = { parentElement: root };
    root.children.push(overlay);

    ensureSubtitleOverlayMounted({ documentElement: root, fullscreenElement: player }, overlay);

    expect(overlay.parentElement).toBe(player);
    expect(player.children).toEqual([overlay]);
  });

  it("does not append again when the overlay is already mounted in the active host", () => {
    const root = host("root");
    const overlay: FakeOverlay = { parentElement: root };
    root.children.push(overlay);

    ensureSubtitleOverlayMounted({ documentElement: root, fullscreenElement: null }, overlay);

    expect(root.children).toEqual([overlay]);
  });
});

describe("subtitle overlay visibility", () => {
  it("uses the floating subtitle switch outside fullscreen", () => {
    expect(
      resolveSubtitleDisplay({
        hasText: true,
        visible: true,
        floatingVisible: false,
        fullscreenVisible: true,
        isFullscreen: false
      })
    ).toBe("none");

    expect(
      resolveSubtitleDisplay({
        hasText: true,
        visible: true,
        floatingVisible: true,
        fullscreenVisible: false,
        isFullscreen: false
      })
    ).toBe("block");
  });

  it("uses the fullscreen subtitle switch when a player is fullscreen", () => {
    expect(
      resolveSubtitleDisplay({
        hasText: true,
        visible: true,
        floatingVisible: true,
        fullscreenVisible: false,
        isFullscreen: true
      })
    ).toBe("none");

    expect(
      resolveSubtitleDisplay({
        hasText: true,
        visible: true,
        floatingVisible: false,
        fullscreenVisible: true,
        isFullscreen: true
      })
    ).toBe("block");
  });

  it("hides when the master subtitle switch is off or there is no text", () => {
    expect(
      resolveSubtitleDisplay({
        hasText: true,
        visible: false,
        floatingVisible: true,
        fullscreenVisible: true,
        isFullscreen: false
      })
    ).toBe("none");

    expect(
      resolveSubtitleDisplay({
        hasText: false,
        visible: true,
        floatingVisible: true,
        fullscreenVisible: true,
        isFullscreen: true
      })
    ).toBe("none");
  });
});
