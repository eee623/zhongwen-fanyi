import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("manual HTML5 player test page", () => {
  it("provides a self-contained browser page for Chrome extension audio capture checks", async () => {
    const html = await readFile(new URL("../../../manual-test/html5-player.html", import.meta.url), "utf8");

    expect(html).toContain("<video");
    expect(html).toContain('id="testVideo"');
    expect(html).toContain("canvas.captureStream");
    expect(html).toContain("createMediaStreamDestination");
    expect(html).toContain("window.__dubbingManualTest");
    expect(html).toContain("chrome://extensions");
    expect(html).toContain("file://");
    expect(html).not.toContain("muted></video>");
    expect(html).toContain("video.volume = 0.8");
  });
});
