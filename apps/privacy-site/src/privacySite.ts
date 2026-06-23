export interface PrivacyPolicySiteOptions {
  canonicalUrl?: string;
}

export interface PrivacyPolicySite {
  files: Record<string, string>;
}

export function buildPrivacyPolicySite(markdown: string, options: PrivacyPolicySiteOptions = {}): PrivacyPolicySite {
  const title = extractTitle(markdown) ?? "中文同传隐私政策";
  const body = renderMarkdown(markdown);
  const canonicalLink = options.canonicalUrl
    ? `\n    <link rel="canonical" href="${escapeHtml(options.canonicalUrl)}">`
    : "";

  return {
    files: {
      "privacy/index.html": renderPrivacyPage(title, body, canonicalLink),
      "assets/privacy.css": renderStylesheet(),
      "index.html": renderRedirectPage(title),
      "robots.txt": "User-agent: *\nAllow: /privacy/\n",
      "_headers": renderHeaders()
    }
  };
}

function extractTitle(markdown: string): string | undefined {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : undefined;
}

function renderMarkdown(markdown: string): string {
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

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      html.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`);
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

function renderPrivacyPage(title: string, body: string, canonicalLink: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>${canonicalLink}
    <meta name="description" content="中文同传 Chrome 扩展隐私政策，说明音频、账号、订阅、支付和 Limited Use 数据处理。">
    <link rel="stylesheet" href="/assets/privacy.css">
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>
`;
}

function renderStylesheet(): string {
  return `:root {
  color-scheme: light;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #15151a;
  background: #f7f7f5;
}

body {
  margin: 0;
}

main {
  box-sizing: border-box;
  width: min(840px, calc(100% - 32px));
  margin: 0 auto;
  padding: 56px 0 72px;
  line-height: 1.75;
}

h1,
h2 {
  line-height: 1.25;
  margin: 0 0 18px;
}

h1 {
  font-size: 34px;
}

h2 {
  font-size: 22px;
  margin-top: 36px;
}

p,
li {
  font-size: 16px;
}

ul {
  padding-left: 22px;
}

a {
  color: #6d3ee8;
}
`;
}

function renderRedirectPage(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta http-equiv="refresh" content="0; url=/privacy/">
  </head>
  <body>
    <a href="/privacy/">隐私政策</a>
  </body>
</html>
`;
}

function renderHeaders(): string {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
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
