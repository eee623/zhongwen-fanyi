import { createDecipheriv, createHmac, createVerify, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BillingStore } from "./billing.js";

export type PaymentProvider = "alipay" | "wechat";

export interface SubscriptionPaidEvent {
  provider: PaymentProvider;
  type: "subscription.paid";
  userId: string;
  subscriptionId: string;
  orderId?: string;
  paymentId: string;
  paidMinutes: number;
  amountCents?: number;
  currency?: string;
  occurredAt: number;
}

export interface SubscriptionRefundedEvent {
  provider: PaymentProvider;
  type: "subscription.refunded";
  userId: string;
  subscriptionId: string;
  orderId?: string;
  paymentId: string;
  refundId?: string;
  occurredAt: number;
}

export type PaymentEvent = SubscriptionPaidEvent | SubscriptionRefundedEvent;

export interface PaymentVerificationConfig {
  mode?: "development" | "production";
  alipayPublicKeyPem?: string;
  wechatPlatformCertificates?: Record<string, string>;
  wechatApiV3Key?: string;
}

export interface PaymentLedger {
  hasProcessed(provider: PaymentProvider, paymentId: string): boolean;
  markProcessed(provider: PaymentProvider, paymentId: string): void;
}

export type PaymentOrderStatus = "pending" | "paid" | "canceled" | "refunded";

export interface PaymentOrder {
  orderId: string;
  provider: PaymentProvider;
  userId: string;
  packageId?: PaymentPackageId;
  expectedAmountCents: number;
  currency: string;
  paidMinutes: number;
  status: PaymentOrderStatus;
  createdAt?: number;
  expiresAt?: number;
  paymentId?: string;
  paidAt?: number;
  refundedAt?: number;
  canceledAt?: number;
  cancelReason?: "user" | "expired";
}

export interface PaymentOrderStore {
  getOrder(orderId: string): PaymentOrder | undefined;
  createOrder(order: PaymentOrder): void;
  markPaid(orderId: string, paymentId: string, paidAt: number): void;
  markRefunded(orderId: string, refundedAt: number): boolean;
  cancelOrder(orderId: string, canceledAt: number, reason?: "user" | "expired"): boolean;
}

export type PaymentPackageId = "pro_20m_cny_39";

export interface PaymentPackage {
  packageId: PaymentPackageId;
  paidMinutes: number;
  amountCents: number;
  currency: "CNY";
}

export type PaymentWebhookSignatureResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "malformed_signature"
        | "invalid_signature"
        | "missing_platform_certificate"
        | "timestamp_out_of_range"
        | "unsupported_signature_type";
    };

export type PaymentApplyResult =
  | {
      ok: true;
      grantedSeconds: number;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason: "unsupported_event" | "invalid_minutes" | "missing_payment_id";
    };

export type PaymentOrderValidationResult =
  | {
      ok: true;
      orderId: string;
    }
  | {
      ok: false;
      reason:
        | "missing_order_id"
        | "payment_order_not_found"
        | "payment_order_already_paid"
        | "payment_order_not_payable"
        | "payment_order_provider_mismatch"
        | "payment_order_user_mismatch"
        | "payment_order_amount_mismatch"
        | "payment_order_currency_mismatch"
        | "payment_order_minutes_mismatch";
    };

export function createInMemoryPaymentLedger(): PaymentLedger {
  const processedPayments = new Set<string>();
  return createPaymentLedger(processedPayments);
}

export function createFilePaymentLedger(filePath: string): PaymentLedger {
  const processedPayments = loadProcessedPayments(filePath);
  const persist = () => writeJsonFile(filePath, [...processedPayments].sort());
  if (!existsSync(filePath)) {
    persist();
  }
  return createPaymentLedger(processedPayments, persist);
}

export function createInMemoryPaymentOrderStore(initialOrders: Record<string, PaymentOrder> = {}): PaymentOrderStore {
  return createPaymentOrderStore(new Map(Object.entries(initialOrders)));
}

export function getPaymentPackage(packageId: string): PaymentPackage | undefined {
  return paymentPackageCatalog[packageId as PaymentPackageId];
}

export function createPendingPaymentOrder(input: {
  orderId: string;
  provider: PaymentProvider;
  userId: string;
  packageId: PaymentPackageId;
  now: number;
}): PaymentOrder {
  const paymentPackage = paymentPackageCatalog[input.packageId];
  return {
    orderId: input.orderId,
    provider: input.provider,
    userId: input.userId,
    packageId: input.packageId,
    expectedAmountCents: paymentPackage.amountCents,
    currency: paymentPackage.currency,
    paidMinutes: paymentPackage.paidMinutes,
    status: "pending",
    createdAt: input.now,
    expiresAt: input.now + 30 * 60 * 1000
  };
}

export function createFilePaymentOrderStore(
  filePath: string,
  initialOrders: Record<string, PaymentOrder> = {}
): PaymentOrderStore {
  const orders = loadPaymentOrders(filePath, initialOrders);
  const persist = () => writeJsonFile(filePath, Object.fromEntries([...orders.entries()].sort(([left], [right]) => left.localeCompare(right))));
  if (!existsSync(filePath)) {
    persist();
  }
  return createPaymentOrderStore(orders, persist);
}

export function expirePaymentOrderIfNeeded(order: PaymentOrder, now: number): PaymentOrder {
  if (order.status !== "pending" || order.expiresAt === undefined || now < order.expiresAt) {
    return { ...order };
  }
  return {
    ...order,
    status: "canceled",
    canceledAt: order.expiresAt,
    cancelReason: "expired"
  };
}

function createPaymentLedger(processedPayments: Set<string>, persist?: () => void): PaymentLedger {
  return {
    hasProcessed(provider, paymentId) {
      return processedPayments.has(paymentLedgerKey(provider, paymentId));
    },
    markProcessed(provider, paymentId) {
      const key = paymentLedgerKey(provider, paymentId);
      const previousSize = processedPayments.size;
      processedPayments.add(key);
      if (processedPayments.size !== previousSize) {
        persist?.();
      }
    }
  };
}

function createPaymentOrderStore(orders: Map<string, PaymentOrder>, persist?: () => void): PaymentOrderStore {
  return {
    getOrder(orderId) {
      const order = orders.get(orderId);
      return order ? { ...order } : undefined;
    },
    createOrder(order) {
      orders.set(order.orderId, { ...order });
      persist?.();
    },
    markPaid(orderId, paymentId, paidAt) {
      const order = orders.get(orderId);
      if (!order || order.status !== "pending") {
        return;
      }
      orders.set(orderId, {
        ...order,
        status: "paid",
        paymentId,
        paidAt
      });
      persist?.();
    },
    markRefunded(orderId, refundedAt) {
      const order = orders.get(orderId);
      if (!order || order.status !== "paid") {
        return false;
      }
      orders.set(orderId, {
        ...order,
        status: "refunded",
        refundedAt
      });
      persist?.();
      return true;
    },
    cancelOrder(orderId, canceledAt, reason = "user") {
      const order = orders.get(orderId);
      if (!order || order.status !== "pending") {
        return false;
      }
      orders.set(orderId, {
        ...order,
        status: "canceled",
        canceledAt,
        cancelReason: reason
      });
      persist?.();
      return true;
    }
  };
}

const paymentPackageCatalog: Record<PaymentPackageId, PaymentPackage> = {
  pro_20m_cny_39: {
    packageId: "pro_20m_cny_39",
    paidMinutes: 20,
    amountCents: 3900,
    currency: "CNY"
  }
};

export function validatePaymentEventAgainstOrder(
  event: PaymentEvent,
  orderStore: PaymentOrderStore
): PaymentOrderValidationResult {
  if (event.type !== "subscription.paid") {
    return { ok: false, reason: "payment_order_not_payable" };
  }
  const orderId = event.orderId ?? event.subscriptionId;
  if (!orderId) {
    return { ok: false, reason: "missing_order_id" };
  }

  const order = orderStore.getOrder(orderId);
  if (!order) {
    return { ok: false, reason: "payment_order_not_found" };
  }
  if (order.status === "paid") {
    return order.paymentId === event.paymentId
      ? { ok: true, orderId }
      : { ok: false, reason: "payment_order_already_paid" };
  }
  if (order.status !== "pending") {
    return { ok: false, reason: "payment_order_not_payable" };
  }
  if (order.provider !== event.provider) {
    return { ok: false, reason: "payment_order_provider_mismatch" };
  }
  if (order.userId !== event.userId) {
    return { ok: false, reason: "payment_order_user_mismatch" };
  }
  if (event.amountCents !== order.expectedAmountCents) {
    return { ok: false, reason: "payment_order_amount_mismatch" };
  }
  if ((event.currency ?? "").toUpperCase() !== order.currency.toUpperCase()) {
    return { ok: false, reason: "payment_order_currency_mismatch" };
  }
  if (event.paidMinutes !== order.paidMinutes) {
    return { ok: false, reason: "payment_order_minutes_mismatch" };
  }

  return { ok: true, orderId };
}

export function applyPaymentEvent(
  event: PaymentEvent,
  billingStore: BillingStore,
  paymentLedger: PaymentLedger
): PaymentApplyResult {
  if (event.type !== "subscription.paid") {
    return { ok: false, reason: "unsupported_event" };
  }
  if (!event.paymentId.trim()) {
    return { ok: false, reason: "missing_payment_id" };
  }
  if (!Number.isFinite(event.paidMinutes) || event.paidMinutes <= 0) {
    return { ok: false, reason: "invalid_minutes" };
  }
  if (paymentLedger.hasProcessed(event.provider, event.paymentId)) {
    return { ok: true, grantedSeconds: 0, duplicate: true };
  }

  const grantedSeconds = Math.ceil(event.paidMinutes * 60);
  billingStore.grantSeconds(event.userId, grantedSeconds, "pro");
  paymentLedger.markProcessed(event.provider, event.paymentId);
  return { ok: true, grantedSeconds, duplicate: false };
}

export function paymentProviderFromPath(pathname: string): PaymentProvider | undefined {
  if (pathname.includes("/alipay/")) {
    return "alipay";
  }
  if (pathname.includes("/wechat/")) {
    return "wechat";
  }
  return undefined;
}

export function createPaymentWebhookSignature(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyPaymentWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string
): PaymentWebhookSignatureResult {
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) {
    return { ok: false, reason: "malformed_signature" };
  }

  const expected = createPaymentWebhookSignature(body, secret);
  return safeEqual(signature.toLowerCase(), expected) ? { ok: true } : { ok: false, reason: "invalid_signature" };
}

export function buildAlipaySignContent(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function verifyAlipayWebhookSignature(
  params: Record<string, string | undefined>,
  publicKeyPem: string
): PaymentWebhookSignatureResult {
  const signature = params.sign;
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const algorithm = alipaySignAlgorithm(params.sign_type);
  if (!algorithm) {
    return { ok: false, reason: "unsupported_signature_type" };
  }

  return verifyRsaSignature({
    algorithm,
    content: buildAlipaySignContent(params),
    signature,
    publicKeyPem
  });
}

export interface WechatPayV3SignatureInput {
  body: string;
  headers: Record<string, string | undefined>;
  platformCertificates: Record<string, string>;
  nowSeconds?: number;
  maxClockSkewSeconds?: number;
}

export interface WechatPayEncryptedResource {
  algorithm: "AEAD_AES_256_GCM";
  nonce: string;
  associated_data?: string;
  ciphertext: string;
}

export function buildWechatPayV3SignContent(input: { timestamp: string; nonce: string; body: string }): string {
  return `${input.timestamp}\n${input.nonce}\n${input.body}\n`;
}

export function verifyWechatPayV3Signature(input: WechatPayV3SignatureInput): PaymentWebhookSignatureResult {
  const serial = headerValue(input.headers, "wechatpay-serial");
  const signature = headerValue(input.headers, "wechatpay-signature");
  const timestamp = headerValue(input.headers, "wechatpay-timestamp");
  const nonce = headerValue(input.headers, "wechatpay-nonce");
  if (!serial || !signature || !timestamp || !nonce) {
    return { ok: false, reason: "missing_signature" };
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    return { ok: false, reason: "malformed_signature" };
  }
  const maxClockSkewSeconds = input.maxClockSkewSeconds ?? 300;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > maxClockSkewSeconds) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const publicKeyPem = input.platformCertificates[serial];
  if (!publicKeyPem) {
    return { ok: false, reason: "missing_platform_certificate" };
  }

  return verifyRsaSignature({
    algorithm: "RSA-SHA256",
    content: buildWechatPayV3SignContent({ timestamp, nonce, body: input.body }),
    signature,
    publicKeyPem
  });
}

export function decryptWechatPayResource(resource: WechatPayEncryptedResource, apiV3Key: string): string {
  if (apiV3Key.length !== 32) {
    throw new Error("WECHATPAY_API_V3_KEY must be 32 bytes.");
  }
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error(`Unsupported WeChat Pay resource algorithm: ${resource.algorithm}`);
  }

  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data ?? "", "utf8"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function paymentLedgerKey(provider: PaymentProvider, paymentId: string): string {
  return `${provider}:${paymentId}`;
}

function loadProcessedPayments(filePath: string): Set<string> {
  if (!existsSync(filePath)) {
    return new Set<string>();
  }
  const parsed = readJsonFile<unknown>(filePath, "File-backed payment ledger");
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`File-backed payment ledger must be an array of processed payment keys: ${filePath}`);
  }
  return new Set(parsed);
}

function loadPaymentOrders(filePath: string, initialOrders: Record<string, PaymentOrder>): Map<string, PaymentOrder> {
  if (!existsSync(filePath)) {
    return new Map(Object.entries(initialOrders));
  }

  const parsed = readJsonFile<Record<string, PaymentOrder>>(filePath, "File-backed payment order store");
  for (const [orderId, order] of Object.entries(parsed)) {
    if (!isPaymentOrder(order)) {
      throw new Error(`File-backed payment order store has invalid order ${orderId}: ${filePath}`);
    }
    if (order.orderId !== orderId) {
      throw new Error(`File-backed payment order store key ${orderId} does not match orderId ${order.orderId}: ${filePath}`);
    }
  }
  return new Map(Object.entries(parsed));
}

function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tempPath, filePath);
}

function readJsonFile<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} is not valid JSON: ${filePath}`);
    }
    throw error;
  }
}

function isPaymentOrder(value: unknown): value is PaymentOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const order = value as Partial<PaymentOrder>;
  return (
    typeof order.orderId === "string" &&
    order.orderId.trim().length > 0 &&
    (order.provider === "alipay" || order.provider === "wechat") &&
    typeof order.userId === "string" &&
    order.userId.trim().length > 0 &&
    typeof order.expectedAmountCents === "number" &&
    Number.isInteger(order.expectedAmountCents) &&
    order.expectedAmountCents >= 0 &&
    order.currency === "CNY" &&
    typeof order.paidMinutes === "number" &&
    Number.isInteger(order.paidMinutes) &&
    order.paidMinutes > 0 &&
    (order.status === "pending" || order.status === "paid" || order.status === "canceled" || order.status === "refunded")
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function alipaySignAlgorithm(signType: string | undefined): "RSA-SHA1" | "RSA-SHA256" | undefined {
  if (signType === "RSA") {
    return "RSA-SHA1";
  }
  if (!signType || signType === "RSA2") {
    return "RSA-SHA256";
  }
  return undefined;
}

function verifyRsaSignature(input: {
  algorithm: "RSA-SHA1" | "RSA-SHA256";
  content: string;
  signature: string;
  publicKeyPem: string;
}): PaymentWebhookSignatureResult {
  try {
    const verifier = createVerify(input.algorithm);
    verifier.update(input.content, "utf8");
    verifier.end();
    return verifier.verify(input.publicKeyPem, input.signature, "base64")
      ? { ok: true }
      : { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
}

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
}
