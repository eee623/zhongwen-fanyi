export type CheckoutProvider = "alipay" | "wechat";
export type CheckoutPackageId = "pro_20m_cny_39";

export interface CheckoutOrder {
  orderId: string;
  provider: CheckoutProvider;
  packageId: CheckoutPackageId;
  paidMinutes: number;
  amountCents: number;
  currency: "CNY";
  statusUrl?: string;
}

export interface CheckoutSite {
  files: Record<string, string>;
}

interface CheckoutPackage {
  packageId: CheckoutPackageId;
  paidMinutes: number;
  amountCents: number;
  currency: "CNY";
}

const checkoutPackages: Record<CheckoutPackageId, CheckoutPackage> = {
  pro_20m_cny_39: {
    packageId: "pro_20m_cny_39",
    paidMinutes: 20,
    amountCents: 3900,
    currency: "CNY"
  }
};

export function buildCheckoutSite(): CheckoutSite {
  return {
    files: {
      "index.html": renderCheckoutPage(),
      "pay/index.html": renderCheckoutPage(),
      "assets/checkout.css": renderStylesheet(),
      "assets/checkout.js": renderClientScript(),
      "robots.txt": "User-agent: *\nDisallow: /\n",
      "_headers": renderHeaders()
    }
  };
}

export function checkoutOrderFromSearch(search: string): CheckoutOrder {
  const params = new URLSearchParams(search);
  const packageId = readPackageId(params.get("packageId"));
  const checkoutPackage = checkoutPackages[packageId];
  return {
    orderId: params.get("orderId")?.trim() || "pending_order",
    provider: readProvider(params.get("provider")),
    packageId,
    paidMinutes: checkoutPackage.paidMinutes,
    amountCents: checkoutPackage.amountCents,
    currency: checkoutPackage.currency,
    statusUrl: readHttpsUrl(params.get("statusUrl"))
  };
}

export function checkoutProviderLabel(provider: CheckoutProvider): string {
  return provider === "wechat" ? "微信支付" : "支付宝";
}

export function checkoutOrderNotice(order: CheckoutOrder): string {
  return `${checkoutProviderLabel(order.provider)}订单 ${escapeHtml(order.orderId)}，${order.paidMinutes} 分钟 / ${formatCny(order.amountCents)}`;
}

function readProvider(value: string | null): CheckoutProvider {
  return value === "wechat" ? "wechat" : "alipay";
}

function readPackageId(value: string | null): CheckoutPackageId {
  return value === "pro_20m_cny_39" ? value : "pro_20m_cny_39";
}

function readHttpsUrl(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function renderCheckoutPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>中文同传收银台</title>
    <meta name="description" content="中文同传订阅订单收银台。">
    <link rel="stylesheet" href="/assets/checkout.css">
  </head>
  <body>
    <main class="shell">
      <section class="checkout">
        <div class="summary">
          <p class="label">中文同传订阅</p>
          <h1>确认订单</h1>
          <p class="intro">核对订单后，等待支付平台收银台接入完成。</p>
          <dl class="details" aria-label="订单信息">
            <div>
              <dt>订单号</dt>
              <dd id="order-id">读取中</dd>
            </div>
            <div>
              <dt>支付方式</dt>
              <dd id="provider">读取中</dd>
            </div>
            <div>
              <dt>套餐</dt>
              <dd id="package">20 分钟中文同传</dd>
            </div>
            <div>
              <dt>金额</dt>
              <dd id="amount">¥39.00</dd>
            </div>
          </dl>
        </div>
        <aside class="payment" aria-label="支付状态">
          <p class="payment-title" id="notice">订单读取中</p>
          <p class="payment-copy">
            当前页面已准备承接支付宝和微信支付。真实预下单完成后，这里会展示二维码或跳转按钮。
          </p>
          <p class="status-copy" id="status-copy">等待订单状态同步</p>
          <div class="rail" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <button class="refresh" type="button" id="refresh-button">刷新订单</button>
        </aside>
      </section>
    </main>
    <script src="/assets/checkout.js" defer></script>
  </body>
</html>
`;
}

function renderStylesheet(): string {
  return `:root {
  color-scheme: light dark;
  --bg: #f6f6f2;
  --surface: #fcfcf8;
  --text: #17171f;
  --muted: #62606b;
  --line: #deddd4;
  --accent: #136f63;
  --accent-strong: #0f5149;
  --soft: #e9f3ef;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 320px;
  min-height: 100dvh;
  margin: 0;
  color: var(--text);
  background: var(--bg);
}

.shell {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 32px 18px;
}

.checkout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  width: min(940px, 100%);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgb(34 35 30 / 0.10);
}

.summary,
.payment {
  padding: 34px;
}

.summary {
  border-right: 1px solid var(--line);
}

.label {
  margin: 0 0 14px;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 800;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 6vw, 54px);
  line-height: 1.02;
  letter-spacing: 0;
}

.intro {
  max-width: 34rem;
  margin: 16px 0 28px;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.7;
}

.details {
  display: grid;
  gap: 10px;
  margin: 0;
}

.details div {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 16px;
  min-height: 42px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}

dt {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 15px;
  font-weight: 850;
}

.payment {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 22px;
  background: var(--soft);
}

.payment-title {
  margin: 0;
  font-size: 19px;
  font-weight: 900;
  line-height: 1.35;
}

.payment-copy {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}

.status-copy {
  margin: 12px 0 0;
  color: var(--accent-strong);
  font-size: 14px;
  font-weight: 850;
  line-height: 1.55;
}

.rail {
  display: grid;
  gap: 9px;
  margin-top: auto;
}

.rail span {
  display: block;
  height: 12px;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-radius: 999px;
}

.rail span:nth-child(2) {
  width: 72%;
}

.rail span:nth-child(3) {
  width: 48%;
}

.refresh {
  width: 100%;
  height: 46px;
  color: #f4fbf7;
  background: var(--accent-strong);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
}

.refresh:active {
  transform: translateY(1px);
}

.refresh:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 3px;
}

@media (max-width: 760px) {
  .shell {
    padding: 16px;
    place-items: stretch;
  }

  .checkout {
    grid-template-columns: 1fr;
  }

  .summary {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .summary,
  .payment {
    padding: 24px;
  }

  .details div {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101115;
    --surface: #1a1b20;
    --text: #f1f0e8;
    --muted: #b7b3a7;
    --line: #34363d;
    --accent: #70c7b3;
    --accent-strong: #91d7c5;
    --soft: #152722;
  }

  .checkout {
    box-shadow: 0 24px 80px rgb(0 0 0 / 0.24);
  }

  .refresh {
    color: #10201c;
  }
}
`;
}

function renderClientScript(): string {
  return `"use strict";
const packages = {
  pro_20m_cny_39: {
    paidMinutes: 20,
    amountCents: 3900,
    currency: "CNY"
  }
};

function providerLabel(provider) {
  return provider === "wechat" ? "微信支付" : "支付宝";
}

function packageId(value) {
  return value === "pro_20m_cny_39" ? value : "pro_20m_cny_39";
}

function providerId(value) {
  return value === "wechat" ? "wechat" : "alipay";
}

function formatCny(amountCents) {
  return "¥" + (amountCents / 100).toFixed(2);
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function render() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId") || "pending_order";
  const provider = providerId(params.get("provider"));
  const pkg = packages[packageId(params.get("packageId"))];
  const statusUrl = safeHttpsUrl(params.get("statusUrl"));
  text("order-id", orderId);
  text("provider", providerLabel(provider));
  text("package", pkg.paidMinutes + " 分钟中文同传");
  text("amount", formatCny(pkg.amountCents));
  text("notice", providerLabel(provider) + "订单 " + orderId + "，" + pkg.paidMinutes + " 分钟 / " + formatCny(pkg.amountCents));
  loadStatus(statusUrl);
}

function safeHttpsUrl(value) {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function loadStatus(statusUrl) {
  if (!statusUrl) {
    text("status-copy", "订单状态查询未配置");
    return;
  }
  try {
    const response = await fetch(statusUrl, {
      headers: {
        accept: "application/json"
      }
    });
    const body = await response.json();
    if (!response.ok) {
      text("status-copy", "订单状态暂不可用");
      return;
    }
    text("status-copy", statusLabel(body.status));
  } catch {
    text("status-copy", "订单状态暂不可用");
  }
}

function statusLabel(status) {
  if (status === "paid") {
    return "已支付，分钟数将同步到账户";
  }
  if (status === "canceled") {
    return "订单已取消";
  }
  if (status === "refunded") {
    return "订单已退款";
  }
  return "等待支付";
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  const refresh = document.getElementById("refresh-button");
  if (refresh) {
    refresh.addEventListener("click", () => window.location.reload());
  }
});
`;
}

function renderHeaders(): string {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; connect-src https:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
`;
}

function formatCny(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
