import { buildCheckoutSite } from "../../checkout-site/src/checkoutSite";
import { buildPrivacyPolicySite } from "../../privacy-site/src/privacySite";

export interface PublicSiteOptions {
  publicBaseUrl?: string;
  publicBasePath?: string;
}

export interface PublicSiteAsset {
  outputPath: string;
  sourcePath: string;
}

export interface PublicSite {
  files: Record<string, string>;
  assets: PublicSiteAsset[];
}

const productAssets: PublicSiteAsset[] = [
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
];

export function buildPublicSite(markdown: string, options: PublicSiteOptions = {}): PublicSite {
  const baseUrl = options.publicBaseUrl ? trimTrailingSlash(options.publicBaseUrl) : undefined;
  const basePath = normalizeBasePath(options.publicBasePath);
  const homeCanonicalUrl = baseUrl ? `${baseUrl}/` : undefined;
  const privacyCanonicalUrl = baseUrl ? `${baseUrl}/privacy/` : undefined;
  const privacy = buildPrivacyPolicySite(markdown, { canonicalUrl: privacyCanonicalUrl });
  const checkout = buildCheckoutSite();

  return {
    files: {
      "index.html": renderHomePage(homeCanonicalUrl, basePath),
      "privacy/index.html": renderPrivacyPage(markdown, privacyCanonicalUrl, basePath),
      "pay/index.html": rewriteAbsoluteSitePaths(requireFile(checkout.files, "pay/index.html"), basePath),
      "assets/public.css": renderStylesheet(),
      "assets/privacy.css": requireFile(privacy.files, "assets/privacy.css"),
      "assets/checkout.css": requireFile(checkout.files, "assets/checkout.css"),
      "assets/checkout.js": requireFile(checkout.files, "assets/checkout.js"),
      "favicon.svg": renderFavicon(),
      "robots.txt": renderRobots(baseUrl),
      ...(baseUrl ? { "sitemap.xml": renderSitemap(baseUrl) } : {}),
      "_headers": renderHeaders()
    },
    assets: productAssets
  };
}

function requireFile(files: Record<string, string>, path: string): string {
  const content = files[path];
  if (content === undefined) {
    throw new Error(`Missing site file: ${path}`);
  }
  return content;
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeBasePath(value?: string): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function sitePath(basePath: string, path: string): string {
  if (!basePath || !path.startsWith("/")) {
    return path;
  }
  return `${basePath}${path}`;
}

function rewriteAbsoluteSitePaths(html: string, basePath: string): string {
  if (!basePath) {
    return html;
  }
  return html.replaceAll('href="/', `href="${basePath}/`).replaceAll('src="/', `src="${basePath}/`);
}

function renderHomePage(canonicalUrl?: string, basePath = ""): string {
  const [homeImage, planImage, checkoutImage] = productAssets;
  const canonicalLink = canonicalUrl ? `\n    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : "";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>中文同传</title>${canonicalLink}
    <meta name="description" content="中文同传 Chrome 扩展，支持网页视频和 Chrome 可播放本地视频的英文转中文字幕与中文配音。">
    <meta name="theme-color" content="#6847f5">
    <meta property="og:title" content="中文同传">
    <meta property="og:description" content="浏览器实时中文同传插件，支持英文视频转中文字幕和中文配音。">
    <meta property="og:type" content="website">
    <link rel="icon" href="${sitePath(basePath, "/favicon.svg")}" type="image/svg+xml">
    <link rel="stylesheet" href="${sitePath(basePath, "/assets/public.css")}">
  </head>
  <body>
    ${renderSiteHeader("home", basePath)}

    <main>
      <section class="hero" id="home" aria-labelledby="site-title">
        <div class="hero-copy">
          <p class="eyebrow"><span aria-hidden="true">◆</span> 实时翻译 · 字幕显示 · 中文配音</p>
          <h1 id="site-title">浏览器实时<br><span>中文同传插件</span></h1>
          <p class="lead">支持网页视频与 Chrome 可播放本地视频的英文转中文字幕和中文配音。</p>
          <div class="hero-actions">
            <a class="button primary" href="#plans">查看套餐 <span aria-hidden="true">›</span></a>
            <a class="button secondary" href="#service">了解服务</a>
          </div>
          <dl class="feature-row" aria-label="核心能力">
            <div>
              <dt>网页播放器</dt>
              <dd>YouTube、优酷、B站等主流网页播放器</dd>
            </div>
            <div>
              <dt>本地 mp4/webm</dt>
              <dd>支持 Chrome 可播放的本地视频文件</dd>
            </div>
            <div>
              <dt>字幕与配音</dt>
              <dd>实时生成中文字幕和中文配音</dd>
            </div>
            <div>
              <dt>隐私保护</dt>
              <dd>音频仅在用户授权下处理</dd>
            </div>
          </dl>
        </div>
        <figure class="hero-visual">
          <img src="${sitePath(basePath, `/${homeImage.outputPath}`)}" alt="中文同传首页页面展示" width="1672" height="941">
        </figure>
      </section>

      <section class="plans" id="plans" aria-labelledby="plans-title">
        <div class="section-heading">
          <p class="eyebrow compact">专注隐私保护 · 实时翻译与配音 · 安全稳定可靠</p>
          <h2 id="plans-title">专业版套餐</h2>
          <p>浏览器实时中文同传插件，支持网页视频与本地视频英文实时翻译与配音。</p>
        </div>
        <div class="plan-grid">
          <article class="price-panel">
            <p class="plan-name">20 分钟中文同传额度</p>
            <p class="price"><span>¥</span>39.00 <small>/ 20 分钟</small></p>
            <ul>
              <li>英语视频实时转中文字幕</li>
              <li>中文配音播放</li>
              <li>支持网页播放器与 Chrome 本地 mp4/webm 视频</li>
              <li>支持音量混音和字幕大小调节</li>
            </ul>
            <a class="button primary full" href="${sitePath(basePath, "/pay/?packageId=pro_20m_cny_39&amp;provider=alipay")}">立即订阅</a>
            <p class="refund-note">未使用额度可按服务协议申请退款</p>
          </article>
          <figure class="image-panel">
            <img src="${sitePath(basePath, `/${planImage.outputPath}`)}" alt="专业版套餐页面展示" width="1672" height="941">
          </figure>
        </div>
      </section>

      <section class="checkout-section" aria-labelledby="checkout-title">
        <div class="checkout-copy">
          <p class="eyebrow compact">安全支付 · 隐私保护</p>
          <h2 id="checkout-title">清晰的订单确认流程</h2>
          <p>支付前展示商品、金额、支付方式和订单状态。付款成功后，额度会自动充值到账号。</p>
          <a class="button secondary" href="${sitePath(basePath, "/pay/?packageId=pro_20m_cny_39&amp;provider=alipay")}">查看收银台</a>
        </div>
        <figure class="checkout-visual">
          <img src="${sitePath(basePath, `/${checkoutImage.outputPath}`)}" alt="订单确认页面展示" width="1672" height="941">
        </figure>
      </section>

      <section class="service" id="service" aria-labelledby="service-title">
        <h2 id="service-title">服务范围</h2>
        <div class="service-grid">
          <article>
            <h3>支持范围</h3>
            <p>支持网页视频、HTML5 播放器，以及 Chrome 可直接播放的本地 mp4/webm 视频。</p>
          </article>
          <article>
            <h3>隐私边界</h3>
            <p>不保存原始音频和声纹，支付回调仅用于订单状态和额度入账。</p>
          </article>
          <article>
            <h3>第一版限制</h3>
            <p>暂不支持 VLC、IINA、QuickTime 等独立播放器，也不支持 mkv/avi 本地格式。</p>
          </article>
        </div>
      </section>
    </main>

    ${renderSiteFooter(basePath)}
  </body>
</html>
`;
}

function renderPrivacyPage(markdown: string, canonicalUrl?: string, basePath = ""): string {
  const title = extractTitle(markdown) ?? "中文同传隐私政策";
  const canonicalLink = canonicalUrl ? `\n    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : "";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>${canonicalLink}
    <meta name="description" content="中文同传 Chrome 扩展隐私政策，说明音频、账号、订阅、支付和 Limited Use 数据处理。">
    <link rel="icon" href="${sitePath(basePath, "/favicon.svg")}" type="image/svg+xml">
    <link rel="stylesheet" href="${sitePath(basePath, "/assets/public.css")}">
  </head>
  <body>
    ${renderSiteHeader("privacy", basePath)}

    <main class="policy-page">
      <section class="policy-hero" aria-labelledby="policy-title">
        <p class="eyebrow compact">隐私保护 · 数据最小化 · 用户可控</p>
        <h1 id="policy-title">${escapeHtml(title)}</h1>
        <p>我们把隐私政策放在产品网站内部，和订阅、收银台、备案信息保持同一个访问入口。</p>
      </section>
      <article class="policy-content">
        ${renderPolicyBody(markdown)}
      </article>
    </main>

    ${renderSiteFooter(basePath)}
  </body>
</html>
`;
}

function renderSiteHeader(active: "home" | "privacy", basePath = ""): string {
  const homeHref = active === "home" ? "#home" : sitePath(basePath, "/");
  const plansHref = active === "home" ? "#plans" : sitePath(basePath, "/#plans");
  const ctaHref = active === "home" ? "#plans" : sitePath(basePath, "/#plans");
  const homeCurrent = active === "home" ? ' aria-current="page"' : "";
  const privacyCurrent = active === "privacy" ? ' aria-current="page"' : "";

  return `<header class="site-header">
      <a class="brand" href="${sitePath(basePath, "/")}" aria-label="中文同传首页">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">中文同传</span>
        <span class="brand-company">四川笑希软件有限公司</span>
      </a>
      <nav class="top-nav" aria-label="主要导航">
        <a href="${homeHref}"${homeCurrent}>首页</a>
        <a href="${plansHref}">套餐</a>
        <a href="${sitePath(basePath, "/privacy/")}"${privacyCurrent}>隐私政策</a>
        <a href="mailto:eeelj65@gmail.com">联系我们</a>
      </nav>
      <a class="nav-button" href="${ctaHref}">查看套餐</a>
    </header>`;
}

function renderSiteFooter(basePath = ""): string {
  return `<footer class="site-footer">
      <p>© 2026 四川笑希软件有限公司　保留所有权利</p>
      <nav aria-label="页脚导航">
        <a href="${sitePath(basePath, "/privacy/")}">隐私政策</a>
        <a href="${sitePath(basePath, "/pay/")}">用户协议</a>
        <a href="mailto:eeelj65@gmail.com">eeelj65@gmail.com</a>
        <a href="https://beian.miit.gov.cn/" rel="noopener">蜀ICP备2026033716号</a>
      </nav>
    </footer>`;
}

function extractTitle(markdown: string): string | undefined {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : undefined;
}

function renderPolicyBody(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    html.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(escapeHtml(line.replace(/^-\s+/, "")));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return html.join("\n        ");
}

function renderStylesheet(): string {
  return `:root {
  color-scheme: light;
  --bg: #fbfbff;
  --surface: #ffffff;
  --surface-soft: #f7f5ff;
  --text: #101729;
  --muted: #626a7b;
  --line: #e4e7f2;
  --accent: #6847f5;
  --accent-strong: #5734e8;
  --accent-soft: #efeaff;
  --teal: #0f766e;
  --shadow: 0 24px 70px rgb(54 61 95 / 0.12);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at 82% 22%, rgb(244 240 255 / 0.9), transparent 28rem),
    linear-gradient(180deg, #ffffff 0%, var(--bg) 68%, #ffffff 100%);
}

img {
  display: block;
  max-width: 100%;
  height: auto;
}

a {
  color: inherit;
  text-decoration: none;
}

.site-header,
.hero,
.plans,
.checkout-section,
.service,
.policy-page,
.site-footer {
  width: min(1530px, calc(100% - 48px));
  margin: 0 auto;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(250px, 1fr) auto minmax(140px, 1fr);
  gap: 24px;
  align-items: center;
  min-height: 72px;
  margin-top: 18px;
  padding: 0 28px;
  background: rgb(255 255 255 / 0.92);
  border: 1px solid rgb(228 231 242 / 0.75);
  border-radius: 8px;
  box-shadow: 0 14px 36px rgb(30 35 62 / 0.08);
  backdrop-filter: blur(14px);
}

.brand,
.top-nav,
.hero-actions,
.site-footer nav {
  display: flex;
  align-items: center;
}

.brand {
  min-width: 0;
  gap: 14px;
}

.brand-mark {
  position: relative;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #7656ff, #5834dd);
  border-radius: 8px;
  box-shadow: 0 10px 22px rgb(104 71 245 / 0.22);
}

.brand-mark::after {
  position: absolute;
  top: 50%;
  left: 53%;
  width: 0;
  height: 0;
  border-top: 9px solid transparent;
  border-bottom: 9px solid transparent;
  border-left: 13px solid #ffffff;
  content: "";
  transform: translate(-50%, -50%);
}

.brand-name {
  font-size: 27px;
  font-weight: 950;
  line-height: 1;
  white-space: nowrap;
}

.brand-company {
  color: var(--muted);
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.top-nav {
  gap: 48px;
  justify-content: center;
  color: #1d2436;
  font-size: 16px;
  font-weight: 750;
}

.top-nav a {
  position: relative;
  padding: 24px 0;
}

.top-nav a[aria-current="page"],
.top-nav a:hover {
  color: var(--accent-strong);
}

.top-nav a[aria-current="page"]::after,
.top-nav a:hover::after {
  position: absolute;
  right: 0;
  bottom: 17px;
  left: 0;
  height: 3px;
  background: var(--accent);
  border-radius: 999px;
  content: "";
}

.nav-button,
.button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 24px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.nav-button {
  justify-self: end;
  color: #ffffff;
  background: linear-gradient(135deg, #7656ff, var(--accent-strong));
  box-shadow: 0 12px 24px rgb(104 71 245 / 0.22);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(460px, 1fr);
  gap: 62px;
  align-items: center;
  min-height: 680px;
  padding: 66px 0 54px;
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  margin: 0 0 30px;
  padding: 0 17px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  font-size: 15px;
  font-weight: 850;
}

.eyebrow.compact {
  margin-bottom: 14px;
  color: #4c3f87;
  background: #f1effb;
}

h1,
h2,
h3,
p {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  font-size: 70px;
  line-height: 1.08;
  font-weight: 950;
}

h1 span,
h2 span {
  color: var(--accent-strong);
}

.lead {
  max-width: 640px;
  margin-top: 24px;
  color: var(--muted);
  font-size: 22px;
  line-height: 1.55;
}

.hero-actions {
  gap: 22px;
  margin-top: 34px;
}

.button.primary {
  min-width: 210px;
  color: #ffffff;
  background: linear-gradient(135deg, #7656ff, #5834dd);
  box-shadow: 0 14px 30px rgb(104 71 245 / 0.25);
}

.button.secondary {
  min-width: 190px;
  color: var(--accent-strong);
  background: #ffffff;
  border-color: #cfc6ff;
}

.button.full {
  width: 100%;
}

.feature-row {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin: 48px 0 0;
}

.feature-row div {
  width: min(160px, 100%);
}

.feature-row dt {
  color: #121a2e;
  font-size: 15px;
  font-weight: 950;
}

.feature-row dd {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.hero-visual,
.image-panel,
.checkout-visual {
  margin: 0;
}

.hero-visual img,
.image-panel img,
.checkout-visual img {
  width: 100%;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.button:active,
.nav-button:active {
  transform: translateY(1px);
}

a:focus-visible {
  outline: 3px solid rgb(104 71 245 / 0.34);
  outline-offset: 3px;
}

.plans,
.checkout-section,
.service {
  padding: 62px 0;
}

.section-heading {
  max-width: 820px;
  margin: 0 auto 34px;
  text-align: center;
}

h2 {
  font-size: 42px;
  line-height: 1.2;
  font-weight: 950;
}

.section-heading p,
.checkout-copy p,
.service p {
  color: var(--muted);
  font-size: 17px;
  line-height: 1.7;
}

.section-heading > p:last-child {
  margin-top: 14px;
}

.plan-grid,
.checkout-section {
  display: grid;
  grid-template-columns: minmax(330px, 0.55fr) minmax(0, 1fr);
  gap: 38px;
  align-items: center;
}

.price-panel,
.service-grid article {
  background: rgb(255 255 255 / 0.92);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 18px 46px rgb(54 61 95 / 0.08);
}

.price-panel {
  padding: 28px;
}

.plan-name {
  color: #ffffff;
  margin: -28px -28px 28px;
  padding: 28px;
  background: linear-gradient(135deg, #7656ff, #5834dd);
  border-radius: 8px 8px 0 0;
  font-size: 20px;
  font-weight: 900;
  text-align: center;
}

.price {
  color: var(--accent-strong);
  font-size: 54px;
  font-weight: 950;
  line-height: 1;
  text-align: center;
}

.price span {
  font-size: 32px;
}

.price small {
  color: var(--muted);
  font-size: 17px;
  font-weight: 800;
}

.price-panel ul {
  display: grid;
  gap: 14px;
  margin: 28px 0;
  padding: 0;
  list-style: none;
}

.price-panel li {
  position: relative;
  padding-left: 30px;
  color: #252c3e;
  font-size: 15px;
  line-height: 1.55;
}

.price-panel li::before {
  position: absolute;
  top: 0.15em;
  left: 0;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  color: #ffffff;
  background: var(--accent);
  border-radius: 50%;
  content: "✓";
  font-size: 13px;
  font-weight: 950;
}

.refund-note {
  margin-top: 16px;
  color: var(--muted);
  font-size: 14px;
  text-align: center;
}

.checkout-section {
  grid-template-columns: minmax(0, 0.72fr) minmax(420px, 1fr);
}

.checkout-copy {
  max-width: 560px;
}

.checkout-copy p:not(.eyebrow) {
  margin: 18px 0 28px;
}

.service {
  padding-bottom: 78px;
}

.service h2 {
  margin-bottom: 22px;
  text-align: center;
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.service-grid article {
  padding: 24px;
}

h3 {
  margin-bottom: 12px;
  font-size: 20px;
  font-weight: 950;
}

.policy-page {
  max-width: 960px;
  padding: 70px 0 78px;
}

.policy-hero {
  padding: 32px 0 34px;
}

.policy-hero h1 {
  max-width: 760px;
  font-size: 48px;
}

.policy-hero p:not(.eyebrow) {
  max-width: 720px;
  margin-top: 18px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.7;
}

.policy-content {
  padding-top: 32px;
  border-top: 1px solid #dedcf4;
}

.policy-content h2 {
  margin: 42px 0 14px;
  font-size: 24px;
}

.policy-content h2:first-child {
  margin-top: 0;
}

.policy-content p,
.policy-content li {
  color: #30384c;
  font-size: 16px;
  line-height: 1.9;
}

.policy-content p + p {
  margin-top: 16px;
}

.policy-content ul {
  display: grid;
  gap: 10px;
  margin: 16px 0 0;
  padding-left: 20px;
}

.policy-content li::marker {
  color: var(--accent-strong);
}

.site-footer {
  display: flex;
  min-height: 86px;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 22px 0 32px;
  color: var(--muted);
  border-top: 1px solid #dedcf4;
  font-size: 15px;
}

.site-footer nav {
  flex-wrap: wrap;
  gap: 22px;
  justify-content: flex-end;
}

.site-footer a:hover {
  color: var(--accent-strong);
}

@media (max-width: 1160px) {
  .site-header {
    grid-template-columns: 1fr auto;
  }

  .top-nav {
    display: none;
  }

  .hero,
  .plan-grid,
  .checkout-section {
    grid-template-columns: 1fr;
  }

  .hero {
    gap: 36px;
    min-height: 0;
  }

  .hero-visual {
    order: -1;
  }

  .checkout-copy {
    max-width: none;
  }

  .service-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .site-header,
  .hero,
  .plans,
  .checkout-section,
  .service,
  .policy-page,
  .site-footer {
    width: min(100% - 28px, 1530px);
  }

  .site-header {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 16px;
  }

  .brand {
    gap: 10px;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
  }

  .brand-name {
    font-size: 23px;
  }

  .brand-company {
    display: none;
  }

  .nav-button {
    width: 100%;
    justify-self: stretch;
  }

  .hero {
    padding-top: 34px;
  }

  h1 {
    font-size: 42px;
  }

  h2 {
    font-size: 32px;
  }

  .lead {
    font-size: 18px;
  }

  .policy-page {
    padding: 38px 0 56px;
  }

  .policy-hero h1 {
    font-size: 34px;
  }

  .hero-actions {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .button {
    width: 100%;
  }

  .feature-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .feature-row div {
    width: auto;
  }

  .price {
    font-size: 44px;
  }

  .site-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .site-footer nav {
    justify-content: flex-start;
  }
}

@media (max-width: 440px) {
  .feature-row {
    grid-template-columns: 1fr;
  }
}
`;
}

function renderRobots(baseUrl?: string): string {
  const sitemap = baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : "";
  return `User-agent: *\nAllow: /\nDisallow: /pay/\n${sitemap}`;
}

function renderSitemap(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(baseUrl)}/</loc>
  </url>
  <url>
    <loc>${escapeHtml(baseUrl)}/privacy/</loc>
  </url>
</urlset>
`;
}

function renderFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#6847f5"/>
  <path d="M26 20v24l20-12z" fill="#fff"/>
</svg>
`;
}

function renderHeaders(): string {
  return `/*
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; connect-src https:; img-src 'self' https: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
