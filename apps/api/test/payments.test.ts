import { createCipheriv, createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryBillingStore } from "../src/billing";
import {
  applyPaymentEvent,
  buildAlipaySignContent,
  buildWechatPayV3SignContent,
  createPendingPaymentOrder,
  createFilePaymentLedger,
  createFilePaymentOrderStore,
  createInMemoryPaymentLedger,
  createInMemoryPaymentOrderStore,
  createPaymentWebhookSignature,
  decryptWechatPayResource,
  expirePaymentOrderIfNeeded,
  validatePaymentEventAgainstOrder,
  verifyAlipayWebhookSignature,
  verifyPaymentWebhookSignature,
  verifyWechatPayV3Signature
} from "../src/payments";

describe("payment webhooks", () => {
  it("grants subscription minutes after a paid Alipay or WeChat event", () => {
    const billing = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const ledger = createInMemoryPaymentLedger();

    const result = applyPaymentEvent(
      {
        provider: "alipay",
        type: "subscription.paid",
        userId: "user_1",
        subscriptionId: "sub_1",
        paymentId: "pay_1",
        paidMinutes: 120,
        occurredAt: 1000
      },
      billing,
      ledger
    );

    expect(result).toEqual({ ok: true, grantedSeconds: 7200, duplicate: false });
    expect(billing.canStartSession("user_1")).toEqual({ ok: true });
    expect(billing.getEntitlement("user_1")).toMatchObject({
      plan: "pro",
      remainingSeconds: 7200
    });
  });

  it("ignores duplicate payment ids without blocking the next renewal payment", () => {
    const billing = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const ledger = createInMemoryPaymentLedger();

    const first = applyPaymentEvent(
      {
        provider: "wechat",
        type: "subscription.paid",
        userId: "user_1",
        subscriptionId: "sub_1",
        paymentId: "wx_pay_1",
        paidMinutes: 30,
        occurredAt: 1000
      },
      billing,
      ledger
    );
    const duplicate = applyPaymentEvent(
      {
        provider: "wechat",
        type: "subscription.paid",
        userId: "user_1",
        subscriptionId: "sub_1",
        paymentId: "wx_pay_1",
        paidMinutes: 30,
        occurredAt: 1005
      },
      billing,
      ledger
    );
    const renewal = applyPaymentEvent(
      {
        provider: "wechat",
        type: "subscription.paid",
        userId: "user_1",
        subscriptionId: "sub_1",
        paymentId: "wx_pay_2",
        paidMinutes: 30,
        occurredAt: 2000
      },
      billing,
      ledger
    );

    expect(first).toEqual({ ok: true, grantedSeconds: 1800, duplicate: false });
    expect(duplicate).toEqual({ ok: true, grantedSeconds: 0, duplicate: true });
    expect(renewal).toEqual({ ok: true, grantedSeconds: 1800, duplicate: false });
    expect(billing.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 3600
    });
  });

  it("persists processed payment ids across ledger instances", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-payments-"));
    try {
      const ledgerPath = join(tempDir, "payment-ledger.json");
      const first = createFilePaymentLedger(ledgerPath);

      first.markProcessed("alipay", "pay_1");

      const second = createFilePaymentLedger(ledgerPath);
      expect(second.hasProcessed("alipay", "pay_1")).toBe(true);
      expect(second.hasProcessed("wechat", "pay_1")).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not grant minutes again when the same payment id is replayed after restart", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-payments-"));
    try {
      const ledgerPath = join(tempDir, "payment-ledger.json");
      const billing = createInMemoryBillingStore({
        user_1: {
          plan: "trial",
          remainingSeconds: 0,
          maxConcurrentSessions: 1
        }
      });
      const event = {
        provider: "wechat" as const,
        type: "subscription.paid" as const,
        userId: "user_1",
        subscriptionId: "sub_1",
        paymentId: "wx_pay_restart_1",
        paidMinutes: 30,
        occurredAt: 1000
      };

      expect(applyPaymentEvent(event, billing, createFilePaymentLedger(ledgerPath))).toEqual({
        ok: true,
        grantedSeconds: 1800,
        duplicate: false
      });
      expect(applyPaymentEvent(event, billing, createFilePaymentLedger(ledgerPath))).toEqual({
        ok: true,
        grantedSeconds: 0,
        duplicate: true
      });
      expect(billing.getEntitlement("user_1")).toMatchObject({
        remainingSeconds: 1800
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects paid events without a stable payment id", () => {
    const billing = createInMemoryBillingStore();
    const ledger = createInMemoryPaymentLedger();

    expect(
      applyPaymentEvent(
        {
          provider: "alipay",
          type: "subscription.paid",
          userId: "user_1",
          subscriptionId: "sub_1",
          paymentId: "",
          paidMinutes: 30,
          occurredAt: 1000
        },
        billing,
        ledger
      )
    ).toEqual({ ok: false, reason: "missing_payment_id" });
  });

  it("validates a signed payment event against an existing pending order before granting minutes", () => {
    const orderStore = createInMemoryPaymentOrderStore({
      sub_1: {
        orderId: "sub_1",
        provider: "alipay",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 120,
        status: "pending"
      }
    });

    const event = {
      provider: "alipay" as const,
      type: "subscription.paid" as const,
      userId: "user_1",
      subscriptionId: "sub_1",
      orderId: "sub_1",
      paymentId: "ali_pay_1",
      paidMinutes: 120,
      amountCents: 3900,
      currency: "CNY",
      occurredAt: 1000
    };

    expect(validatePaymentEventAgainstOrder(event, orderStore)).toEqual({ ok: true, orderId: "sub_1" });

    orderStore.markPaid("sub_1", "ali_pay_1", 1000);
    expect(orderStore.getOrder("sub_1")).toMatchObject({
      status: "paid",
      paymentId: "ali_pay_1",
      paidAt: 1000
    });
  });

  it("creates pending orders from a server-owned package catalog", () => {
    const orderStore = createInMemoryPaymentOrderStore();
    const order = createPendingPaymentOrder({
      orderId: "ord_test_1",
      provider: "wechat",
      userId: "user_1",
      packageId: "pro_20m_cny_39",
      now: 1_780_000_000_000
    });

    orderStore.createOrder(order);

    expect(order).toEqual({
      orderId: "ord_test_1",
      provider: "wechat",
      userId: "user_1",
      packageId: "pro_20m_cny_39",
      expectedAmountCents: 3900,
      currency: "CNY",
      paidMinutes: 20,
      status: "pending",
      createdAt: 1_780_000_000_000,
      expiresAt: 1_780_000_000_000 + 30 * 60 * 1000
    });
    expect(orderStore.getOrder("ord_test_1")).toEqual(order);
  });

  it("cancels pending orders and marks expired orders as not payable", () => {
    const orderStore = createInMemoryPaymentOrderStore();
    const order = createPendingPaymentOrder({
      orderId: "ord_lifecycle_1",
      provider: "alipay",
      userId: "user_1",
      packageId: "pro_20m_cny_39",
      now: 1_780_000_000_000
    });
    orderStore.createOrder(order);

    expect(orderStore.cancelOrder("ord_lifecycle_1", 1_780_000_001_000)).toBe(true);
    expect(orderStore.getOrder("ord_lifecycle_1")).toMatchObject({
      status: "canceled",
      canceledAt: 1_780_000_001_000
    });
    expect(
      validatePaymentEventAgainstOrder(
        {
          provider: "alipay",
          type: "subscription.paid",
          userId: "user_1",
          subscriptionId: "ord_lifecycle_1",
          orderId: "ord_lifecycle_1",
          paymentId: "ali_pay_cancelled",
          paidMinutes: 20,
          amountCents: 3900,
          currency: "CNY",
          occurredAt: 1_780_000_002_000
        },
        orderStore
      )
    ).toEqual({ ok: false, reason: "payment_order_not_payable" });

    const expired = expirePaymentOrderIfNeeded(order, order.expiresAt ?? 0);
    expect(expired).toMatchObject({
      status: "canceled",
      canceledAt: order.expiresAt,
      cancelReason: "expired"
    });
  });

  it("rejects production payment events with mismatched amount, user, provider, or minutes", () => {
    const orderStore = createInMemoryPaymentOrderStore({
      sub_1: {
        orderId: "sub_1",
        provider: "wechat",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 120,
        status: "pending"
      }
    });
    const baseEvent = {
      provider: "wechat" as const,
      type: "subscription.paid" as const,
      userId: "user_1",
      subscriptionId: "sub_1",
      orderId: "sub_1",
      paymentId: "wx_pay_1",
      paidMinutes: 120,
      amountCents: 3900,
      currency: "CNY",
      occurredAt: 1000
    };

    expect(validatePaymentEventAgainstOrder({ ...baseEvent, amountCents: 1 }, orderStore)).toEqual({
      ok: false,
      reason: "payment_order_amount_mismatch"
    });
    expect(validatePaymentEventAgainstOrder({ ...baseEvent, userId: "user_2" }, orderStore)).toEqual({
      ok: false,
      reason: "payment_order_user_mismatch"
    });
    expect(validatePaymentEventAgainstOrder({ ...baseEvent, provider: "alipay" }, orderStore)).toEqual({
      ok: false,
      reason: "payment_order_provider_mismatch"
    });
    expect(validatePaymentEventAgainstOrder({ ...baseEvent, paidMinutes: 60 }, orderStore)).toEqual({
      ok: false,
      reason: "payment_order_minutes_mismatch"
    });
  });

  it("persists payment order paid and canceled status across store instances", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-orders-"));
    try {
      const orderPath = join(tempDir, "payment-orders.json");
      const first = createFilePaymentOrderStore(orderPath, {
        sub_1: {
          orderId: "sub_1",
          provider: "wechat",
          userId: "user_1",
          expectedAmountCents: 3900,
          currency: "CNY",
          paidMinutes: 120,
          status: "pending"
        }
      });

      first.markPaid("sub_1", "wx_pay_1", 1000);
      first.createOrder({
        orderId: "sub_2",
        provider: "wechat",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 120,
        status: "pending"
      });
      first.cancelOrder("sub_2", 2000);

      expect(createFilePaymentOrderStore(orderPath).getOrder("sub_1")).toMatchObject({
        status: "paid",
        paymentId: "wx_pay_1",
        paidAt: 1000
      });
      expect(createFilePaymentOrderStore(orderPath).getOrder("sub_2")).toMatchObject({
        status: "canceled",
        canceledAt: 2000
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("marks only paid payment orders as refunded", () => {
    const orderStore = createInMemoryPaymentOrderStore({
      paid_order: {
        orderId: "paid_order",
        provider: "alipay",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 20,
        status: "paid",
        paymentId: "ali_pay_1",
        paidAt: 1_780_000_000_000
      },
      pending_order: {
        orderId: "pending_order",
        provider: "wechat",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 20,
        status: "pending"
      }
    });

    expect(orderStore.markRefunded("paid_order", 1_780_000_010_000)).toBe(true);
    expect(orderStore.getOrder("paid_order")).toMatchObject({
      status: "refunded",
      paymentId: "ali_pay_1",
      paidAt: 1_780_000_000_000,
      refundedAt: 1_780_000_010_000
    });
    expect(orderStore.markRefunded("pending_order", 1_780_000_020_000)).toBe(false);
    expect(orderStore.markRefunded("missing_order", 1_780_000_020_000)).toBe(false);
    expect(orderStore.getOrder("pending_order")).toMatchObject({
      status: "pending"
    });
  });

  it("fails clearly when a file-backed payment ledger is corrupt", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-payments-"));
    try {
      const ledgerPath = join(tempDir, "payment-ledger.json");
      writeFileSync(ledgerPath, "{not-json");

      expect(() => createFilePaymentLedger(ledgerPath)).toThrowError(
        `File-backed payment ledger is not valid JSON: ${ledgerPath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when a file-backed payment ledger is not a string array", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-payments-"));
    try {
      const ledgerPath = join(tempDir, "payment-ledger.json");
      writeFileSync(ledgerPath, JSON.stringify({ processed: ["alipay:pay_1"] }));

      expect(() => createFilePaymentLedger(ledgerPath)).toThrowError(
        `File-backed payment ledger must be an array of processed payment keys: ${ledgerPath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when a file-backed payment order store is corrupt", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-orders-"));
    try {
      const orderPath = join(tempDir, "payment-orders.json");
      writeFileSync(orderPath, "{not-json");

      expect(() => createFilePaymentOrderStore(orderPath)).toThrowError(
        `File-backed payment order store is not valid JSON: ${orderPath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when a file-backed payment order store has an invalid order shape", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-orders-"));
    try {
      const orderPath = join(tempDir, "payment-orders.json");
      writeFileSync(
        orderPath,
        JSON.stringify({
          ord_bad: {
            orderId: "ord_bad",
            provider: "card",
            userId: "user_1",
            expectedAmountCents: -1,
            currency: "USD",
            paidMinutes: 0,
            status: "waiting"
          }
        })
      );

      expect(() => createFilePaymentOrderStore(orderPath)).toThrowError(
        `File-backed payment order store has invalid order ord_bad: ${orderPath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails clearly when a file-backed payment order key does not match orderId", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "realtime-dubbing-orders-"));
    try {
      const orderPath = join(tempDir, "payment-orders.json");
      writeFileSync(
        orderPath,
        JSON.stringify({
          ord_1: {
            orderId: "ord_2",
            provider: "alipay",
            userId: "user_1",
            expectedAmountCents: 3900,
            currency: "CNY",
            paidMinutes: 20,
            status: "pending"
          }
        })
      );

      expect(() => createFilePaymentOrderStore(orderPath)).toThrowError(
        `File-backed payment order store key ord_1 does not match orderId ord_2: ${orderPath}`
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("signs and verifies webhook bodies with the configured shared secret", () => {
    const body = JSON.stringify({
      userId: "user_1",
      subscriptionId: "sub_1",
      paymentId: "pay_1",
      paidMinutes: 30
    });
    const signature = createPaymentWebhookSignature(body, "webhook-secret");

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(verifyPaymentWebhookSignature(body, signature, "webhook-secret")).toEqual({ ok: true });
    expect(verifyPaymentWebhookSignature(body, signature, "wrong-secret")).toEqual({
      ok: false,
      reason: "invalid_signature"
    });
    expect(verifyPaymentWebhookSignature(`${body} `, signature, "webhook-secret")).toEqual({
      ok: false,
      reason: "invalid_signature"
    });
  });

  it("rejects missing or malformed webhook signatures", () => {
    expect(verifyPaymentWebhookSignature("{}", undefined, "webhook-secret")).toEqual({
      ok: false,
      reason: "missing_signature"
    });
    expect(verifyPaymentWebhookSignature("{}", "not-a-signature", "webhook-secret")).toEqual({
      ok: false,
      reason: "malformed_signature"
    });
  });

  it("builds and verifies Alipay RSA2 notification signatures with decoded sorted parameters", () => {
    const keyPair = generateRsaKeyPair();
    const params = {
      app_id: "2026000000000000",
      out_trade_no: "sub_1",
      trade_no: "2026062222001412340500000001",
      trade_status: "TRADE_SUCCESS",
      total_amount: "39.00",
      subject: "中文同传 专业版",
      sign_type: "RSA2"
    };
    const sign = createSign("RSA-SHA256").update(buildAlipaySignContent(params)).sign(keyPair.privateKeyPem, "base64");

    expect(buildAlipaySignContent({ ...params, sign })).toBe(
      "app_id=2026000000000000&out_trade_no=sub_1&subject=中文同传 专业版&total_amount=39.00&trade_no=2026062222001412340500000001&trade_status=TRADE_SUCCESS"
    );
    expect(verifyAlipayWebhookSignature({ ...params, sign }, keyPair.publicKeyPem)).toEqual({ ok: true });
    expect(verifyAlipayWebhookSignature({ ...params, total_amount: "0.01", sign }, keyPair.publicKeyPem)).toEqual({
      ok: false,
      reason: "invalid_signature"
    });
  });

  it("verifies WeChat Pay API v3 notification signatures by platform certificate serial", () => {
    const keyPair = generateRsaKeyPair();
    const body = JSON.stringify({ event_type: "TRANSACTION.SUCCESS", resource: { ciphertext: "..." } });
    const timestamp = "1780000000";
    const nonce = "nonce-for-wechat";
    const signature = createSign("RSA-SHA256")
      .update(buildWechatPayV3SignContent({ timestamp, nonce, body }))
      .sign(keyPair.privateKeyPem, "base64");

    expect(
      verifyWechatPayV3Signature({
        body,
        headers: {
          "wechatpay-serial": "wechat_serial_1",
          "wechatpay-signature": signature,
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce
        },
        platformCertificates: {
          wechat_serial_1: keyPair.publicKeyPem
        },
        nowSeconds: 1780000001
      })
    ).toEqual({ ok: true });
    expect(
      verifyWechatPayV3Signature({
        body: `${body} `,
        headers: {
          "wechatpay-serial": "wechat_serial_1",
          "wechatpay-signature": signature,
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce
        },
        platformCertificates: {
          wechat_serial_1: keyPair.publicKeyPem
        },
        nowSeconds: 1780000001
      })
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("decrypts WeChat Pay API v3 AES-256-GCM notification resources", () => {
    const apiV3Key = "12345678901234567890123456789012";
    const nonce = "0123456789ab";
    const associatedData = "transaction";
    const plaintext = JSON.stringify({
      out_trade_no: "sub_1",
      transaction_id: "wx_pay_1",
      trade_state: "SUCCESS",
      attach: JSON.stringify({ userId: "user_1", paidMinutes: 30 })
    });

    expect(
      decryptWechatPayResource(
        {
          algorithm: "AEAD_AES_256_GCM",
          nonce,
          associated_data: associatedData,
          ciphertext: encryptWechatResource(plaintext, apiV3Key, nonce, associatedData)
        },
        apiV3Key
      )
    ).toBe(plaintext);
  });
});

function generateRsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString()
  };
}

function encryptWechatResource(plaintext: string, apiV3Key: string, nonce: string, associatedData: string): string {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
}
