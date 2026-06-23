import { describe, expect, it } from "vitest";
import { captureConsentText } from "../src/captureConsent";

describe("capture consent copy", () => {
  it("discloses that tab audio capture only starts after the user clicks start", () => {
    expect(captureConsentText()).toContain("点击启动后");
    expect(captureConsentText()).toContain("当前标签页音频");
    expect(captureConsentText()).toContain("停止会立即断流");
  });
});
