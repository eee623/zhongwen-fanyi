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
    expect(site.files["index.html"]).not.toContain("<style>");
    expect(site.files["index.html"]).not.toContain("<script>");
    expect(site.files["index.html"]).not.toContain(String.fromCharCode(8212));
    expect(site.files["assets/checkout.css"]).toContain("prefers-color-scheme");
    expect(site.files["assets/checkout.js"]).toContain("fetch(statusUrl");
    expect(site.files["_headers"]).toContain("Content-Security-Policy: default-src 'self'");
    expect(site.files["_headers"]).toContain("connect-src https:");
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
    const order = checkoutOrderFromSearch("?orderId=ord_1&statusUrl=http%3A%2F%2Fapi.example.com%2Fstatus");

    expect(order.statusUrl).toBeUndefined();
  });
});
