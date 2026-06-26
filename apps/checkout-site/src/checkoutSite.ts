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
  paymentUrl?: string;
  qrCodeUrl?: string;
  alipayPaymentUrl?: string;
  alipayQrCodeUrl?: string;
  wechatPaymentUrl?: string;
  wechatQrCodeUrl?: string;
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
      "favicon.svg": renderFavicon(),
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
    statusUrl: readHttpsUrl(params.get("statusUrl")),
    paymentUrl: readHttpsUrl(params.get("paymentUrl")),
    qrCodeUrl: readHttpsUrl(params.get("qrCodeUrl")),
    alipayPaymentUrl: readHttpsUrl(params.get("alipayPaymentUrl")),
    alipayQrCodeUrl: readHttpsUrl(params.get("alipayQrCodeUrl")),
    wechatPaymentUrl: readHttpsUrl(params.get("wechatPaymentUrl")),
    wechatQrCodeUrl: readHttpsUrl(params.get("wechatQrCodeUrl"))
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
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/checkout.css">
  </head>
  <body>
    <header class="checkout-header">
      <a class="brand" href="/" aria-label="中文同传首页">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-copy">
          <span class="brand-name">中文同传</span>
        </span>
      </a>
      <a class="support-link" href="/privacy/">隐私政策</a>
    </header>

    <main class="shell">
      <section class="checkout-workspace">
        <div class="summary-panel">
          <p class="label">安全收银台</p>
          <h1>确认订单并支付</h1>
          <p class="intro">请核对订单信息，确认无误后完成付款。支付成功后，中文同传额度会自动同步到账户。</p>
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
            <div>
              <dt>有效期</dt>
              <dd id="expires-at">30 分钟</dd>
            </div>
          </dl>
          <div class="assurance-grid" aria-label="支付保障">
            <p>安全支付保护</p>
            <p>支付成功自动入账</p>
            <p>30 分钟内完成付款</p>
          </div>
        </div>

        <aside class="payment-panel" aria-label="支付操作">
          <div class="panel-head">
            <p class="label">支付方式</p>
            <p class="payment-title" id="notice">订单读取中</p>
          </div>
          <div class="payment-methods" id="provider-tabs" role="tablist" aria-label="支付渠道">
            <button class="method-tab active" type="button" data-provider="alipay" role="tab" aria-selected="true" aria-label="选择支付宝">
              <span class="provider-logo alipay-logo" aria-hidden="true">支</span>
              <span>支付宝</span>
            </button>
            <button class="method-tab" type="button" data-provider="wechat" role="tab" aria-selected="false" aria-label="选择微信支付">
              <span class="provider-logo wechat-logo" aria-hidden="true">
                <span></span>
                <span></span>
              </span>
              <span>微信支付</span>
            </button>
          </div>
          <div class="pay-action">
            <p class="polling-state" id="polling-state">等待订单状态</p>
            <div class="qr-frame" id="qr-frame">
              <img id="qr-code" alt="支付二维码" hidden>
              <div class="qr-placeholder" id="qr-placeholder">
                <div class="qr-blocks" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p id="qr-placeholder-title">支付宝二维码准备中</p>
                <small>可点击下方按钮继续支付</small>
              </div>
            </div>
            <a class="payment-link disabled" id="payment-link" href="#" aria-disabled="true">立即支付</a>
            <p class="status-copy" id="status-copy">正在读取订单</p>
          </div>
          <button class="refresh" type="button" id="refresh-button">刷新订单状态</button>
        </aside>
      </section>
    </main>

    <footer class="checkout-footer">
      <p>© 2026</p>
      <nav aria-label="页脚导航">
        <a href="/privacy/">隐私政策</a>
        <a href="https://beian.miit.gov.cn/" rel="noopener">蜀ICP备2026033716号</a>
      </nav>
    </footer>
    <script src="/assets/checkout.js" defer></script>
  </body>
</html>
`;
}

function renderStylesheet(): string {
  return `:root {
  color-scheme: light;
  --bg: #fbfbff;
  --surface: #ffffff;
  --surface-soft: #f6f4ff;
  --text: #101729;
  --muted: #626a7b;
  --line: #e2e6f3;
  --accent: #6847f5;
  --accent-strong: #5734e8;
  --success: #0f766e;
  --warning: #a16207;
  --danger: #b42318;
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
    radial-gradient(circle at 82% 18%, rgb(239 234 255 / 0.86), transparent 30rem),
    linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
}

a {
  color: inherit;
  text-decoration: none;
}

.checkout-header,
.shell,
.checkout-footer {
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
}

.checkout-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 13px;
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

.brand-copy {
  display: grid;
  gap: 4px;
}

.brand-name {
  font-size: 25px;
  font-weight: 950;
  line-height: 1;
}

.support-link {
  color: var(--muted);
  font-size: 14px;
  font-weight: 750;
}

.support-link:hover {
  color: var(--accent-strong);
}

.shell {
  padding: 46px 0 70px;
}

.checkout-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(360px, 0.72fr);
  gap: 28px;
  align-items: stretch;
}

.summary-panel,
.payment-panel {
  background: rgb(255 255 255 / 0.94);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.summary-panel,
.payment-panel {
  padding: 34px;
}

.label {
  margin: 0 0 14px;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 900;
}

h1 {
  margin: 0;
  font-size: clamp(34px, 6vw, 58px);
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
  gap: 0;
  margin: 0;
}

.details div {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 16px;
  min-height: 42px;
  align-items: center;
  padding: 14px 0;
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

.assurance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 26px;
}

.assurance-grid p {
  min-height: 52px;
  margin: 0;
  padding: 12px;
  color: #293249;
  background: var(--surface-soft);
  border: 1px solid #dfd9ff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.45;
}

.payment-panel {
  display: grid;
  gap: 20px;
}

.payment-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.35;
}

.payment-methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 5px;
  background: #f0edff;
  border: 1px solid #dfd9ff;
  border-radius: 8px;
}

.method-tab {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #4b5570;
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 900;
}

.provider-logo {
  position: relative;
  display: inline-grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  color: #ffffff;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 950;
  line-height: 1;
}

.alipay-logo {
  background: #1677ff;
  box-shadow: 0 8px 18px rgb(22 119 255 / 0.22);
}

.wechat-logo {
  background: #20c45a;
  box-shadow: 0 8px 18px rgb(32 196 90 / 0.2);
}

.wechat-logo span {
  position: absolute;
  display: block;
  background: #ffffff;
  border-radius: 999px;
}

.wechat-logo span:first-child {
  top: 7px;
  left: 5px;
  width: 12px;
  height: 9px;
}

.wechat-logo span:last-child {
  right: 5px;
  bottom: 6px;
  width: 10px;
  height: 8px;
}

.method-tab.active {
  color: #ffffff;
  background: linear-gradient(135deg, #7656ff, var(--accent-strong));
  box-shadow: 0 10px 20px rgb(104 71 245 / 0.22);
}

.pay-action {
  display: grid;
  gap: 16px;
  padding: 18px;
  background: linear-gradient(180deg, #ffffff, #faf9ff);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.polling-state {
  width: fit-content;
  margin: 0;
  padding: 7px 11px;
  color: var(--warning);
  background: #fff7ed;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
}

.polling-state.success {
  color: var(--success);
  background: #ecfdf5;
}

.polling-state.error {
  color: var(--danger);
  background: #fff1f1;
}

.qr-frame {
  display: grid;
  min-height: 214px;
  place-items: center;
  padding: 18px;
  background:
    linear-gradient(90deg, rgb(104 71 245 / 0.08) 1px, transparent 1px),
    linear-gradient(rgb(104 71 245 / 0.08) 1px, transparent 1px),
    #ffffff;
  background-size: 18px 18px;
  border: 1px dashed #c8c2f6;
  border-radius: 8px;
}

[hidden] {
  display: none !important;
}

.qr-frame img {
  width: min(190px, 100%);
  height: auto;
  border-radius: 8px;
}

.qr-placeholder {
  display: grid;
  gap: 12px;
  place-items: center;
  opacity: 0.72;
  text-align: center;
}

.qr-blocks {
  display: grid;
  grid-template-columns: 42px 42px;
  grid-template-rows: 42px 42px;
  gap: 14px;
}

.qr-blocks span {
  display: block;
  background: #ddd7ff;
  border-radius: 7px;
}

.qr-blocks span:nth-child(2),
.qr-blocks span:nth-child(3) {
  background: #bfb3ff;
}

.qr-placeholder p {
  margin: 0;
  color: #293249;
  font-size: 14px;
  font-weight: 900;
}

.qr-placeholder small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
}

.payment-link,
.refresh {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: 950;
}

.payment-link {
  color: #ffffff;
  background: linear-gradient(135deg, #7656ff, var(--accent-strong));
  box-shadow: 0 14px 30px rgb(104 71 245 / 0.22);
}

.payment-link.disabled {
  color: #81889d;
  background: #eef0f7;
  box-shadow: none;
  pointer-events: none;
}

.status-copy {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
}

.refresh {
  width: 100%;
  color: var(--accent-strong);
  background: #ffffff;
  border: 1px solid #cfc6ff;
  cursor: pointer;
}

.payment-link:active,
.refresh:active {
  transform: translateY(1px);
}

a:focus-visible,
button:focus-visible {
  outline: 3px solid rgb(104 71 245 / 0.34);
  outline-offset: 3px;
}

.checkout-footer {
  display: flex;
  min-height: 82px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0 32px;
  color: var(--muted);
  border-top: 1px solid #dedcf4;
  font-size: 14px;
}

.checkout-footer p {
  margin: 0;
}

.checkout-footer nav {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .checkout-workspace {
    grid-template-columns: 1fr;
  }

  .assurance-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .checkout-header,
  .shell,
  .checkout-footer {
    width: min(100% - 28px, 1180px);
  }

  .checkout-header,
  .checkout-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .shell {
    padding-top: 24px;
  }

  .summary-panel,
  .payment-panel {
    padding: 22px;
  }

  .details div {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .payment-methods {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101115;
    --surface: #1a1b20;
    --surface-soft: #18142a;
    --text: #f4f2ff;
    --muted: #b8b3cc;
    --line: #343147;
    --accent: #8f76ff;
    --accent-strong: #a895ff;
    --shadow: 0 24px 70px rgb(0 0 0 / 0.28);
  }

  body {
    background:
      radial-gradient(circle at 82% 18%, rgb(72 55 132 / 0.34), transparent 30rem),
      linear-gradient(180deg, #111218 0%, var(--bg) 100%);
  }

  .summary-panel,
  .payment-panel {
    background: rgb(26 27 32 / 0.94);
  }

  .assurance-grid p,
  .pay-action,
  .refresh {
    background: #1f2030;
  }

  .payment-methods {
    background: #201b34;
  }

  .qr-frame {
    background:
      linear-gradient(90deg, rgb(168 149 255 / 0.12) 1px, transparent 1px),
      linear-gradient(rgb(168 149 255 / 0.12) 1px, transparent 1px),
      #171821;
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

let currentOrder = undefined;
let statusTimer = undefined;

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

function setClass(id, className, enabled) {
  const node = document.getElementById(id);
  if (node) {
    node.classList.toggle(className, enabled);
  }
}

function setProviderTabs(provider) {
  document.querySelectorAll("[data-provider]").forEach((node) => {
    const active = node.getAttribute("data-provider") === provider;
    node.classList.toggle("active", active);
    node.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function render() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId") || "pending_order";
  const provider = providerId(params.get("provider"));
  const pkg = packages[packageId(params.get("packageId"))];
  const statusUrl = safeHttpsUrl(params.get("statusUrl"));
  const paymentUrl = safeHttpsUrl(params.get("paymentUrl"));
  const qrCodeUrl = safeHttpsUrl(params.get("qrCodeUrl"));
  const alipayPaymentUrl = safeHttpsUrl(params.get("alipayPaymentUrl"));
  const alipayQrCodeUrl = safeHttpsUrl(params.get("alipayQrCodeUrl"));
  const wechatPaymentUrl = safeHttpsUrl(params.get("wechatPaymentUrl"));
  const wechatQrCodeUrl = safeHttpsUrl(params.get("wechatQrCodeUrl"));
  currentOrder = {
    orderId,
    provider,
    packageId: packageId(params.get("packageId")),
    paidMinutes: pkg.paidMinutes,
    amountCents: pkg.amountCents,
    statusUrl,
    paymentUrl,
    qrCodeUrl,
    alipayPaymentUrl,
    alipayQrCodeUrl,
    wechatPaymentUrl,
    wechatQrCodeUrl,
    status: "pending"
  };
  renderOrder(currentOrder);
  renderPaymentAction(currentOrder);
  startStatusPolling(currentOrder);
}

function renderOrder(order) {
  setProviderTabs(order.provider);
  text("order-id", order.orderId);
  text("provider", providerLabel(order.provider));
  text("package", order.paidMinutes + " 分钟中文同传");
  text("amount", formatCny(order.amountCents));
  text("notice", providerLabel(order.provider) + "订单 " + order.orderId);
  text("expires-at", order.expiresAt ? formatTime(order.expiresAt) : "30 分钟");
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

function statusPayloadUrl(payload) {
  const checkout = payload && typeof payload.checkout === "object" && !Array.isArray(payload.checkout) ? payload.checkout : {};
  return {
    paymentUrl: safeHttpsUrl(payload?.paymentUrl) || safeHttpsUrl(checkout.paymentUrl),
    qrCodeUrl: safeHttpsUrl(payload?.qrCodeUrl) || safeHttpsUrl(checkout.qrCodeUrl),
    alipayPaymentUrl: safeHttpsUrl(payload?.alipayPaymentUrl) || safeHttpsUrl(checkout.alipayPaymentUrl),
    alipayQrCodeUrl: safeHttpsUrl(payload?.alipayQrCodeUrl) || safeHttpsUrl(checkout.alipayQrCodeUrl),
    wechatPaymentUrl: safeHttpsUrl(payload?.wechatPaymentUrl) || safeHttpsUrl(checkout.wechatPaymentUrl),
    wechatQrCodeUrl: safeHttpsUrl(payload?.wechatQrCodeUrl) || safeHttpsUrl(checkout.wechatQrCodeUrl),
    expiresAt: typeof payload?.expiresAt === "number" ? payload.expiresAt : undefined
  };
}

function mergeStatus(order, payload) {
  const urls = statusPayloadUrl(payload);
  return {
    ...order,
    status: typeof payload?.status === "string" ? payload.status : order.status,
    paymentId: typeof payload?.paymentId === "string" ? payload.paymentId : order.paymentId,
    cancelReason: typeof payload?.cancelReason === "string" ? payload.cancelReason : order.cancelReason,
    expiresAt: urls.expiresAt ?? order.expiresAt,
    paymentUrl: urls.paymentUrl ?? order.paymentUrl,
    qrCodeUrl: urls.qrCodeUrl ?? order.qrCodeUrl,
    alipayPaymentUrl: urls.alipayPaymentUrl ?? order.alipayPaymentUrl,
    alipayQrCodeUrl: urls.alipayQrCodeUrl ?? order.alipayQrCodeUrl,
    wechatPaymentUrl: urls.wechatPaymentUrl ?? order.wechatPaymentUrl,
    wechatQrCodeUrl: urls.wechatQrCodeUrl ?? order.wechatQrCodeUrl
  };
}

function startStatusPolling(order) {
  if (statusTimer) {
    window.clearInterval(statusTimer);
    statusTimer = undefined;
  }
  if (!order.statusUrl) {
    text("status-copy", "支付完成后，请回到本页查看到账结果。");
    text("polling-state", "等待支付");
    return;
  }
  loadStatus(order.statusUrl);
  statusTimer = window.setInterval(() => loadStatus(order.statusUrl), 5000);
}

async function loadStatus(statusUrl) {
  try {
    const response = await fetch(statusUrl, {
      headers: {
        accept: "application/json"
      }
    });
    const body = await response.json();
    if (!response.ok) {
      text("status-copy", "订单状态暂不可用");
      text("polling-state", "状态查询失败");
      setClass("polling-state", "error", true);
      return;
    }
    currentOrder = mergeStatus(currentOrder, body);
    renderOrder(currentOrder);
    renderPaymentAction(currentOrder);
    renderStatus(currentOrder);
    if (currentOrder.status !== "pending" && statusTimer) {
      window.clearInterval(statusTimer);
      statusTimer = undefined;
    }
  } catch {
    text("status-copy", "订单状态暂不可用");
    text("polling-state", "状态查询失败");
    setClass("polling-state", "error", true);
  }
}

function renderStatus(order) {
  const label = statusLabel(order.status, order.cancelReason);
  text("status-copy", label);
  text("polling-state", order.status === "pending" ? "正在等待支付" : label);
  setClass("polling-state", "success", order.status === "paid");
  setClass("polling-state", "error", order.status === "canceled" || order.status === "refunded");
}

function statusLabel(status) {
  if (status === "paid") {
    return "已支付，分钟数将同步到账户";
  }
  if (status === "canceled") {
    return "订单已取消或已过期";
  }
  if (status === "refunded") {
    return "订单已退款";
  }
  return "等待支付";
}

function renderPaymentAction(order) {
  const paymentLink = document.getElementById("payment-link");
  const qrFrame = document.getElementById("qr-frame");
  const qrCode = document.getElementById("qr-code");
  const qrPlaceholder = document.getElementById("qr-placeholder");
  const qrPlaceholderTitle = document.getElementById("qr-placeholder-title");
  const actionUrl = paymentUrlForProvider(order);
  const qrUrl = qrCodeUrlForProvider(order);
  if (qrFrame) {
    qrFrame.hidden = false;
  }
  if (qrCode) {
    if (qrUrl) {
      qrCode.src = qrUrl;
      qrCode.hidden = false;
      qrCode.alt = providerLabel(order.provider) + "二维码";
    } else {
      qrCode.removeAttribute("src");
      qrCode.hidden = true;
    }
  }
  if (qrPlaceholder) {
    qrPlaceholder.hidden = Boolean(qrUrl);
  }
  if (qrPlaceholderTitle) {
    qrPlaceholderTitle.textContent = providerLabel(order.provider) + "二维码准备中";
  }
  if (!paymentLink) {
    return;
  }
  const hasAction = Boolean(actionUrl) && order.status === "pending";
  paymentLink.classList.toggle("disabled", !hasAction);
  paymentLink.setAttribute("aria-disabled", hasAction ? "false" : "true");
  paymentLink.href = hasAction ? actionUrl : "#";
  if (order.status === "paid") {
    paymentLink.textContent = "支付已完成";
    return;
  }
  if (order.status === "canceled" || order.status === "refunded") {
    paymentLink.textContent = "订单不可支付";
    return;
  }
  if (order.provider === "wechat") {
    paymentLink.textContent = actionUrl ? "使用微信支付" : "微信支付准备中";
    return;
  }
  paymentLink.textContent = actionUrl ? "立即用支付宝支付" : "支付宝支付准备中";
}

function paymentUrlForProvider(order) {
  if (order.provider === "wechat") {
    return order.wechatPaymentUrl || order.paymentUrl;
  }
  return order.alipayPaymentUrl || order.paymentUrl;
}

function qrCodeUrlForProvider(order) {
  if (order.provider === "wechat") {
    return order.wechatQrCodeUrl || order.qrCodeUrl;
  }
  return order.alipayQrCodeUrl;
}

function setProviderFromUser(provider) {
  if (!currentOrder) {
    return;
  }
  currentOrder = {
    ...currentOrder,
    provider: providerId(provider)
  };
  const url = new URL(window.location.href);
  url.searchParams.set("provider", currentOrder.provider);
  window.history.replaceState(null, "", url.toString());
  renderOrder(currentOrder);
  renderPaymentAction(currentOrder);
  renderStatus(currentOrder);
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "30 分钟";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  const refresh = document.getElementById("refresh-button");
  document.querySelectorAll("[data-provider]").forEach((node) => {
    node.addEventListener("click", () => {
      setProviderFromUser(node.getAttribute("data-provider"));
    });
  });
  if (refresh) {
    refresh.addEventListener("click", () => {
      if (currentOrder?.statusUrl) {
        loadStatus(currentOrder.statusUrl);
      } else {
        window.location.reload();
      }
    });
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
  Content-Security-Policy: default-src 'self'; connect-src https:; img-src 'self' https: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
`;
}

function renderFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#6847f5"/>
  <path d="M26 20v24l20-12z" fill="#fff"/>
</svg>
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
