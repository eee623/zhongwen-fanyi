import { describe, expect, it } from "vitest";
import {
  createManualAcceptanceReportTemplate,
  requiredManualAcceptanceScenarios,
  validateManualAcceptanceReport
} from "../src/manualAcceptance";

describe("manual acceptance report", () => {
  function completedReport() {
    return createManualAcceptanceReportTemplate("2026-06-23T00:00:00.000Z")
      .replace("构建版本：TODO", "构建版本：0.1.0")
      .replace("测试人员：TODO", "测试人员：manual tester")
      .replace("Chrome 版本：TODO", "Chrome 版本：Chrome 126")
      .replaceAll("- [ ] Result: PASS", "- [x] Result: PASS")
      .replaceAll("TODO", "2026-06-23 08:30 CST actual Chrome popup run captured in manual notes");
  }

  it("covers the release-critical Chrome playback scenarios from the test plan", () => {
    const template = createManualAcceptanceReportTemplate();

    expect(requiredManualAcceptanceScenarios.map((scenario) => scenario.id)).toEqual([
      "html5-mock",
      "html5-aliyun",
      "youtube-aliyun",
      "youku-aliyun",
      "bilibili-aliyun",
      "local-mp4",
      "file-access-blocked",
      "unsupported-local-format",
      "volume-mix",
      "subtitle-fullscreen",
      "session-lifecycle",
      "voice-clone",
      "low-latency-preview",
      "latency-diagnostics"
    ]);
    expect(template).toContain("YouTube");
    expect(template).toContain("优酷");
    expect(template).toContain("B站");
    expect(template).toContain("Chrome 可播放本地 mp4/webm");
    expect(template).toContain("首字/首音/播放");
    expect(template).toContain("极速预听");
  });

  it("prints the local media fixture command needed before file URL acceptance", () => {
    const template = createManualAcceptanceReportTemplate();

    expect(template).toContain("npm run manual:media-fixtures");
    expect(template).toContain("manual-test/generated/local-english-fixture.mp4");
    expect(template).toContain("manual-test/generated/local-english-fixture.webm");
    expect(template).toContain("Chrome 扩展详情页开启 Allow access to file URLs");
  });

  it("rejects an unfilled manual acceptance report", () => {
    const result = validateManualAcceptanceReport(createManualAcceptanceReportTemplate());

    expect(result.ready).toBe(false);
    expect(result.errors).toContain("Build version must be recorded.");
    expect(result.errors).toContain("html5-mock must be marked as PASS.");
    expect(result.errors).toContain("latency-diagnostics still contains TODO placeholders.");
  });

  it("rejects a report that passes scenarios but omits audit metadata", () => {
    const report = completedReport().replace("Chrome 版本：Chrome 126", "Chrome 版本：TODO");

    expect(validateManualAcceptanceReport(report)).toEqual({
      ready: false,
      errors: ["Chrome version must be recorded."]
    });
  });

  it("rejects generic evidence text even when every scenario is marked PASS", () => {
    const report = createManualAcceptanceReportTemplate("2026-06-23T00:00:00.000Z")
      .replace("构建版本：TODO", "构建版本：0.1.0")
      .replace("测试人员：TODO", "测试人员：manual tester")
      .replace("Chrome 版本：TODO", "Chrome 版本：Chrome 126")
      .replaceAll("- [ ] Result: PASS", "- [x] Result: PASS")
      .replaceAll("TODO", "recorded");

    expect(validateManualAcceptanceReport(report).errors).toContain(
      'html5-mock evidence "字幕出现" must contain a concrete observation.'
    );
  });

  it("rejects a report that does not include local file preflight evidence requirements", () => {
    const report = completedReport().replace(
      /## 验收前准备[\s\S]*?\n(?=## html5-mock)/,
      ""
    );

    expect(validateManualAcceptanceReport(report)).toEqual({
      ready: false,
      errors: ["Manual acceptance preflight section is missing."]
    });
  });

  it("accepts a completed manual acceptance report with every required scenario marked PASS", () => {
    const report = createManualAcceptanceReportTemplate("2026-06-23T00:00:00.000Z")
      .replace("构建版本：TODO", "构建版本：0.1.0 build 2026-06-23")
      .replace("测试人员：TODO", "测试人员：manual tester")
      .replace("Chrome 版本：TODO", "Chrome 版本：Chrome 126.0.0.0")
      .replaceAll("- [ ] Result: PASS", "- [x] Result: PASS")
      .replaceAll(": TODO", ": 2026-06-23 08:30 CST actual Chrome popup run captured in manual notes");

    expect(validateManualAcceptanceReport(report)).toEqual({
      ready: true,
      errors: []
    });
  });
});
