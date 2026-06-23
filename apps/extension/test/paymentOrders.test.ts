import { describe, expect, it } from "vitest";
import {
  checkoutUrlFromPaymentOrder,
  createPaymentOrder,
  paymentOrderNotice,
  paymentOrdersEndpointForLiveUrl
} from "../src/paymentOrders";

describe("extension payment orders", () => {
  it("maps live websocket URLs to the payment orders endpoint", () => {
    expect(paymentOrdersEndpointForLiveUrl("ws://localhost:8787/v1/live")).toBe(
      "http://localhost:8787/v1/payment-orders"
    );
    expect(paymentOrdersEndpointForLiveUrl("wss://api.example.com/v1/live?token=old")).toBe(
      "https://api.example.com/v1/payment-orders"
    );
  });

  it("creates payment orders with the resolved session credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await createPaymentOrder(
      "ws://localhost:8787/v1/live",
      "session-credential",
      {
        provider: "alipay",
        packageId: "pro_20m_cny_39"
      },
      async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            orderId: "ord_1",
            provider: "alipay",
            userId: "user_1",
            packageId: "pro_20m_cny_39",
            paidMinutes: 20,
            amountCents: 3900,
            currency: "CNY",
            status: "pending",
            checkout: {
              mode: "provider_redirect_pending",
              checkoutUrl: "https://pay.example.com/checkout/ord_1"
            }
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    );

    expect(result).toEqual({
      ok: true,
      order: {
        orderId: "ord_1",
        provider: "alipay",
        userId: "user_1",
        packageId: "pro_20m_cny_39",
        paidMinutes: 20,
        amountCents: 3900,
        currency: "CNY",
        status: "pending",
        checkout: {
          mode: "provider_redirect_pending",
          checkoutUrl: "https://pay.example.com/checkout/ord_1"
        }
      }
    });
    expect(calls).toEqual([
      {
        url: "http://localhost:8787/v1/payment-orders",
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer session-credential",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            provider: "alipay",
            packageId: "pro_20m_cny_39"
          })
        }
      }
    ]);
  });

  it("returns server error messages when payment order creation fails", async () => {
    const result = await createPaymentOrder(
      "ws://localhost:8787/v1/live",
      "session-credential",
      {
        provider: "wechat",
        packageId: "pro_20m_cny_39"
      },
      async () =>
        new Response(JSON.stringify({ ok: false, error: "payment_order_store_not_configured" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        })
    );

    expect(result).toEqual({
      ok: false,
      error: "payment_order_store_not_configured"
    });
  });

  it("formats a concise pending checkout notice for popup status", () => {
    expect(
      paymentOrderNotice({
        orderId: "ord_1",
        provider: "alipay",
        userId: "user_1",
        packageId: "pro_20m_cny_39",
        paidMinutes: 20,
        amountCents: 3900,
        currency: "CNY",
        status: "pending",
        checkout: {
          mode: "provider_redirect_pending"
        }
      })
    ).toBe("已创建支付宝订单 ord_1，20 分钟 / ¥39.00");
  });

  it("only exposes HTTPS checkout URLs for external navigation", () => {
    const baseOrder = {
      orderId: "ord_1",
      provider: "alipay" as const,
      userId: "user_1",
      packageId: "pro_20m_cny_39" as const,
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY" as const,
      status: "pending" as const,
      checkout: {
        mode: "provider_redirect_pending" as const,
        checkoutUrl: "https://pay.example.com/checkout/ord_1"
      }
    };

    expect(checkoutUrlFromPaymentOrder(baseOrder)).toBe("https://pay.example.com/checkout/ord_1");
    expect(
      checkoutUrlFromPaymentOrder({
        ...baseOrder,
        checkout: { ...baseOrder.checkout, checkoutUrl: "http://pay.example.com/checkout/ord_1" }
      })
    ).toBeUndefined();
    expect(
      checkoutUrlFromPaymentOrder({
        ...baseOrder,
        checkout: { ...baseOrder.checkout, checkoutUrl: "javascript:alert(1)" }
      })
    ).toBeUndefined();
  });
});
