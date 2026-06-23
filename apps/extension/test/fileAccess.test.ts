import { describe, expect, it } from "vitest";
import {
  extensionDetailsUrl,
  fileAccessStatusForTabUrl,
  getCurrentTabFileAccessStatus,
  isFileUrl
} from "../src/fileAccess";

describe("extension file URL access", () => {
  it("recognizes local file URLs without treating normal pages as local files", () => {
    expect(isFileUrl("file:///Users/lijun/movie.mp4")).toBe(true);
    expect(isFileUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isFileUrl(undefined)).toBe(false);
    expect(isFileUrl("not a url")).toBe(false);
  });

  it("blocks startup on local file pages until file scheme access is enabled", () => {
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.mp4", false, "abc123")).toEqual({
      ok: false,
      isFilePage: true,
      allowed: false,
      manageUrl: "chrome://extensions/?id=abc123",
      message: "本地视频页需要先开启扩展的 file:// 访问权限"
    });
  });

  it("allows normal web pages without requiring a file scheme access check", () => {
    expect(fileAccessStatusForTabUrl("https://www.youtube.com/watch?v=abc", false, "abc123")).toEqual({
      ok: true,
      isFilePage: false,
      allowed: true,
      manageUrl: "chrome://extensions/?id=abc123"
    });
  });

  it("blocks local formats that are outside the Chrome-playable MVP scope", () => {
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.mkv", true, "abc123")).toEqual({
      ok: false,
      isFilePage: true,
      allowed: true,
      manageUrl: "chrome://extensions/?id=abc123",
      message: "第一版仅支持 Chrome 可直接播放的本地视频，mkv/avi 暂不支持"
    });
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.AVI", true, "abc123").ok).toBe(false);
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.mp4", true, "abc123").ok).toBe(true);
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/player.html", true, "abc123").ok).toBe(true);
  });

  it("blocks unrelated local files instead of treating every file URL as a supported video source", () => {
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/notes.txt", true, "abc123")).toEqual({
      ok: false,
      isFilePage: true,
      allowed: true,
      manageUrl: "chrome://extensions/?id=abc123",
      message: "第一版仅支持 Chrome 可直接播放的本地 mp4/webm 视频或 HTML5 测试页"
    });
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/document.pdf", true, "abc123").ok).toBe(false);
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.webm", true, "abc123").ok).toBe(true);
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/movie.m4v", true, "abc123").ok).toBe(true);
    expect(fileAccessStatusForTabUrl("file:///Users/lijun/test.HTM", true, "abc123").ok).toBe(true);
  });

  it("checks Chrome file access only when the current tab is a local file page", async () => {
    let checks = 0;
    const fileStatus = await getCurrentTabFileAccessStatus({
      runtime: { id: "abc123" },
      tabs: {
        query: async () => [{ url: "file:///Users/lijun/movie.mp4" }]
      },
      extension: {
        isAllowedFileSchemeAccess: async () => {
          checks += 1;
          return true;
        }
      }
    });

    expect(fileStatus).toEqual({
      ok: true,
      isFilePage: true,
      allowed: true,
      manageUrl: "chrome://extensions/?id=abc123"
    });
    expect(checks).toBe(1);

    const webStatus = await getCurrentTabFileAccessStatus({
      runtime: { id: "abc123" },
      tabs: {
        query: async () => [{ url: "https://example.com/video" }]
      },
      extension: {
        isAllowedFileSchemeAccess: async () => {
          checks += 1;
          return false;
        }
      }
    });

    expect(webStatus).toEqual({
      ok: true,
      isFilePage: false,
      allowed: true,
      manageUrl: "chrome://extensions/?id=abc123"
    });
    expect(checks).toBe(1);
  });

  it("falls back to the extensions list when the extension id is unavailable", () => {
    expect(extensionDetailsUrl(undefined)).toBe("chrome://extensions/");
  });
});
