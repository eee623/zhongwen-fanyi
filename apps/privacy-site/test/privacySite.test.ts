import { describe, expect, it } from "vitest";
import { buildPrivacyPolicySite } from "../src/privacySite";

const policyMarkdown = [
  "# 中文同传隐私政策",
  "",
  "最后更新：2026-06-22",
  "",
  "音频只在用户主动点击启动后处理。默认不保存原始音频，不保存声纹。",
  "",
  "## Limited Use",
  "",
  "用户数据只用于实时翻译、中文字幕、中文配音、订阅、支付、额度和故障诊断。",
  "",
  "- 当前标签页音频会发送到自有后端，再代理到阿里百炼实时翻译服务。",
  "- 用户点击停止后，应立即停止捕获和传输。",
  "",
  "<script>alert('nope')</script>"
].join("\n");

describe("privacy policy site", () => {
  it("builds a Chrome Web Store ready privacy policy page", () => {
    const site = buildPrivacyPolicySite(policyMarkdown, {
      canonicalUrl: "https://realtime-dubbing.app/privacy/"
    });

    expect(site.files["privacy/index.html"]).toContain("<!doctype html>");
    expect(site.files["privacy/index.html"]).toContain("<title>中文同传隐私政策</title>");
    expect(site.files["privacy/index.html"]).toContain('rel="canonical" href="https://realtime-dubbing.app/privacy/"');
    expect(site.files["privacy/index.html"]).toContain("用户主动点击");
    expect(site.files["privacy/index.html"]).toContain("不保存原始音频");
    expect(site.files["privacy/index.html"]).toContain("不保存声纹");
    expect(site.files["privacy/index.html"]).toContain("Limited Use");
    expect(site.files["privacy/index.html"]).toContain("&lt;script&gt;alert(&#39;nope&#39;)&lt;/script&gt;");
  });

  it("emits deploy support files for a public static host", () => {
    const site = buildPrivacyPolicySite(policyMarkdown);

    expect(site.files["index.html"]).toContain('href="/privacy/"');
    expect(site.files["robots.txt"]).toContain("Allow: /privacy/");
    expect(site.files["_headers"]).toContain("X-Content-Type-Options: nosniff");
    expect(site.files["_headers"]).toContain("Content-Security-Policy: default-src 'self'");
    expect(site.files["_headers"]).not.toContain("noindex");
  });

  it("uses only bundled static assets so the CSP does not need inline styles", () => {
    const site = buildPrivacyPolicySite(policyMarkdown);

    expect(site.files["privacy/index.html"]).toContain('href="/assets/privacy.css"');
    expect(site.files["privacy/index.html"]).not.toContain("<style>");
    expect(site.files["assets/privacy.css"]).toContain("font-family");
  });
});
