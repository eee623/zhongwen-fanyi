"use strict";
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
