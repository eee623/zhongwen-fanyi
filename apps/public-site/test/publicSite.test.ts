import { describe, expect, it } from "vitest";
import { buildPublicSite } from "../src/publicSite";

const policyMarkdown = [
  "# 中文同传隐私政策",
  "",
  "最后更新：2026-06-22",
  "",
  "默认不保存原始音频，不保存声纹。",
  "",
  "## Limited Use",
  "",
  "用户数据只用于实时翻译、中文字幕、中文配音、订阅、支付、额度和故障诊断。"
].join("\n");

describe("public site", () => {
  it("combines the public privacy policy and checkout into one deployable site", () => {
    const site = buildPublicSite(policyMarkdown, {
      publicBaseUrl: "https://realtime-dubbing.example"
    });

    expect(site.files["index.html"]).toContain("<title>中文同传</title>");
    expect(site.files["index.html"]).toContain('href="/privacy/"');
    expect(site.files["index.html"]).toContain('href="/pay/"');
    expect(site.files["index.html"]).toContain("蜀ICP备2026033716号");
    expect(site.files["privacy/index.html"]).toContain('rel="canonical" href="https://realtime-dubbing.example/privacy/"');
    expect(site.files["privacy/index.html"]).toContain("不保存原始音频");
    expect(site.files["privacy/index.html"]).toContain("Limited Use");
    expect(site.files["pay/index.html"]).toContain("中文同传收银台");
    expect(site.files["assets/privacy.css"]).toContain("font-family");
    expect(site.files["assets/checkout.css"]).toContain("prefers-color-scheme");
    expect(site.files["assets/checkout.js"]).toContain("textContent");
  });

  it("uses the prepared product images as home page assets", () => {
    const site = buildPublicSite(policyMarkdown);
    const home = site.files["index.html"];

    expect(home).toContain('src="/assets/product/7b579892-ccf1-42cc-b8a8-36b4be626d83.png"');
    expect(home).toContain('src="/assets/product/c99831d7-ec02-4ba2-8a10-21764d4b0bfe.png"');
    expect(home).toContain('src="/assets/product/4b6e942b-db77-43e7-a51c-8a55d7ff721f.png"');
    expect(site.assets).toEqual([
      {
        outputPath: "assets/product/7b579892-ccf1-42cc-b8a8-36b4be626d83.png",
        sourcePath: "store-assets/public-site/7b579892-ccf1-42cc-b8a8-36b4be626d83.png"
      },
      {
        outputPath: "assets/product/c99831d7-ec02-4ba2-8a10-21764d4b0bfe.png",
        sourcePath: "store-assets/public-site/c99831d7-ec02-4ba2-8a10-21764d4b0bfe.png"
      },
      {
        outputPath: "assets/product/4b6e942b-db77-43e7-a51c-8a55d7ff721f.png",
        sourcePath: "store-assets/public-site/4b6e942b-db77-43e7-a51c-8a55d7ff721f.png"
      }
    ]);
  });

  it("uses a review-friendly static hosting policy", () => {
    const site = buildPublicSite(policyMarkdown);

    expect(site.files["robots.txt"]).toContain("Allow: /privacy/");
    expect(site.files["robots.txt"]).toContain("Disallow: /pay/");
    expect(site.files["_headers"]).toContain("X-Content-Type-Options: nosniff");
    expect(site.files["_headers"]).toContain("Content-Security-Policy: default-src 'self'");
    expect(site.files["_headers"]).toContain("connect-src https:");
    expect(site.files["index.html"]).toContain('href="/assets/public.css"');
    expect(site.files["index.html"]).not.toContain("<style>");
    expect(site.files["index.html"]).not.toContain("<script>");
  });

  it("keeps generated public files free from long dash typography", () => {
    const site = buildPublicSite(policyMarkdown);
    const disallowedDash = /[\u2013\u2014]/;

    for (const [path, content] of Object.entries(site.files)) {
      expect(content, path).not.toMatch(disallowedDash);
    }
  });
});
