import { describe, expect, it } from "vitest";
import {
  buildCheckoutSite,
  checkoutOrderFromSearch,
  checkoutOrderNotice,
  checkoutProviderLabel
} from "../src/checkoutSite";

describe("checkout site", () => {
  it("builds a static checkout page with local assets and security headers", () => {
    const site = buildCheckoutSite();

    expect(site.files["index.html"]).toContain("<!doctype html>");
    expect(site.files["pay/index.html"]).toBe(site.files["index.html"]);
    expect(site.files["index.html"]).toContain("<title>中文同传收银台</title>");
    expect(site.files["index.html"]).toContain('href="/assets/checkout.css"');
    expect(site.files["index.html"]).toContain('src="/assets/checkout.js"');
    expect(site.files["index.html"]).toContain('id="status-copy"');
    expect(site.files["index.html"]).toContain('class="checkout-header"');
    expect(site.files["index.html"]).toContain('id="provider-tabs"');
    expect(site.files["index.html"]).toContain('id="payment-link"');
    expect(site.files["index.html"]).toContain('id="qr-code"');
    expect(site.files["index.html"]).toContain('id="polling-state"');
    expect(site.files["index.html"]).toContain('class="provider-logo alipay-logo"');
    expect(site.files["index.html"]).toContain('class="provider-logo wechat-logo"');
    expect(site.files["index.html"]).not.toContain("真实接入边界");
    expect(site.files["index.html"]).not.toContain("需要后端返回");
    expect(site.files["index.html"]).not.toContain("后端生成");
    expect(site.files["index.html"]).not.toContain("paymentUrl");
    expect(site.files["index.html"]).not.toContain("qrCodeUrl");
    expect(site.files["index.html"]).not.toContain("statusUrl");
    expect(site.files["index.html"]).not.toContain("订单状态签名校验");
    expect(site.files["index.html"]).not.toContain("<style>");
    expect(site.files["index.html"]).not.toContain("<script>");
    expect(site.files["index.html"]).not.toContain(String.fromCharCode(8212));
    expect(site.files["assets/checkout.css"]).toContain("prefers-color-scheme");
    expect(site.files["assets/checkout.css"]).toContain(".payment-methods");
    expect(site.files["assets/checkout.css"]).toContain(".provider-logo");
    expect(site.files["assets/checkout.css"]).toContain(".qr-frame");
    expect(site.files["assets/checkout.js"]).toContain("fetch(statusUrl");
    expect(site.files["assets/checkout.js"]).toContain("setProviderFromUser");
    expect(site.files["assets/checkout.js"]).toContain("paymentUrl");
    expect(site.files["assets/checkout.js"]).toContain("qrCodeUrl");
    expect(site.files["assets/checkout.js"]).toContain("setInterval");
    expect(site.files["_headers"]).toContain("Content-Security-Policy: default-src 'self'");
    expect(site.files["_headers"]).toContain("connect-src https:");
    expect(site.files["_headers"]).toContain("img-src 'self' https: data:");
    expect(site.files["robots.txt"]).toContain("Disallow: /");
  });

  it("parses and escapes checkout URL params", () => {
    const order = checkoutOrderFromSearch(
      "?orderId=ord_%3Cscript%3E&provider=wechat&packageId=pro_20m_cny_39&statusUrl=https%3A%2F%2Fapi.example.com%2Fv1%2Fpayment-orders%2Ford_1%2Fstatus%3Ftoken%3Dabc"
    );

    expect(order).toEqual({
      orderId: "ord_<script>",
      provider: "wechat",
      packageId: "pro_20m_cny_39",
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY",
      statusUrl: "https://api.example.com/v1/payment-orders/ord_1/status?token=abc"
    });
    expect(checkoutOrderNotice(order)).toBe("微信支付订单 ord_&lt;script&gt;，20 分钟 / ¥39.00");
  });

  it("defaults unknown provider and package to a safe pending order", () => {
    const order = checkoutOrderFromSearch("?orderId=ord_1&provider=card&packageId=free");

    expect(order).toMatchObject({
      orderId: "ord_1",
      provider: "alipay",
      packageId: "pro_20m_cny_39",
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY"
    });
    expect(checkoutProviderLabel(order.provider)).toBe("支付宝");
  });

  it("drops non-HTTPS status URLs from checkout params", () => {
    const order = checkoutOrderFromSearch(
      "?orderId=ord_1&statusUrl=http%3A%2F%2Fapi.example.com%2Fstatus&paymentUrl=http%3A%2F%2Fpay.example.com&qrCodeUrl=http%3A%2F%2Fpay.example.com%2Fqr.png"
    );

    expect(order.statusUrl).toBeUndefined();
    expect(order.paymentUrl).toBeUndefined();
    expect(order.qrCodeUrl).toBeUndefined();
  });

  it("accepts HTTPS provider payment and QR code URLs for payment handoff", () => {
    const order = checkoutOrderFromSearch(
      "?orderId=ord_1&provider=wechat&paymentUrl=https%3A%2F%2Fpay.example.com%2Ffallback%2Ford_1&qrCodeUrl=https%3A%2F%2Fpay.example.com%2Ffallback%2Ford_1.png&alipayPaymentUrl=https%3A%2F%2Fpay.example.com%2Falipay%2Ford_1&wechatPaymentUrl=https%3A%2F%2Fpay.example.com%2Fwechat%2Ford_1&wechatQrCodeUrl=https%3A%2F%2Fpay.example.com%2Fwechat%2Ford_1.png"
    );

    expect(order.paymentUrl).toBe("https://pay.example.com/fallback/ord_1");
    expect(order.qrCodeUrl).toBe("https://pay.example.com/fallback/ord_1.png");
    expect(order.alipayPaymentUrl).toBe("https://pay.example.com/alipay/ord_1");
    expect(order.wechatPaymentUrl).toBe("https://pay.example.com/wechat/ord_1");
    expect(order.wechatQrCodeUrl).toBe("https://pay.example.com/wechat/ord_1.png");
  });
});
