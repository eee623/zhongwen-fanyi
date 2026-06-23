import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { nanoid } from "nanoid";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildAliSessionUpdate,
  type ApiToClientMessage,
  type ClientToApiMessage,
  type LatencyMarkName
} from "@realtime-dubbing/shared";
import { authenticateToken, extractTokenFromUrl, issueClientToken } from "./auth.js";
import {
  buildAliRealtimeUrl,
  createClientEventFromAliEvent,
  createInputAudioAppendEvent,
  createSessionFinishEvent,
  type AliServerEvent
} from "./aliProxy.js";
import type { ApiConfig } from "./config.js";
import { createInMemoryLatencyStore } from "./latencyStats.js";
import { createSessionMetrics } from "./metrics.js";
import { createMockTranslateEvents } from "./mockTranslate.js";
import {
  applyPaymentEvent,
  createPendingPaymentOrder,
  createInMemoryPaymentLedger,
  decryptWechatPayResource,
  expirePaymentOrderIfNeeded,
  getPaymentPackage,
  paymentProviderFromPath,
  verifyAlipayWebhookSignature,
  verifyPaymentWebhookSignature,
  verifyWechatPayV3Signature,
  validatePaymentEventAgainstOrder,
  type PaymentEvent,
  type PaymentLedger,
  type PaymentOrderStore,
  type PaymentProvider,
  type WechatPayEncryptedResource
} from "./payments.js";

export interface LiveTranslationServer {
  server: Server;
  wss: WebSocketServer;
  listen(): Promise<void>;
  close(): Promise<void>;
}

type AudioAppendMessage = Extract<ClientToApiMessage, { type: "audio.append" }>;
type RuntimeApiConfig = ApiConfig & { paymentLedger: PaymentLedger; paymentOrderStore?: PaymentOrderStore };
export const MAX_PENDING_AUDIO_CHUNKS = 500;

export function createLiveTranslationServer(config: ApiConfig): LiveTranslationServer {
  const runtimeConfig: RuntimeApiConfig = {
    ...config,
    now: config.now ?? Date.now,
    latencyStore: config.latencyStore ?? createInMemoryLatencyStore(),
    paymentLedger: config.paymentLedger ?? createInMemoryPaymentLedger()
  };
  const server = createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    const { pathname, searchParams } = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && pathname === "/v1/auth/client-token") {
      handleClientTokenRequest(request, response, runtimeConfig);
      return;
    }

    if (request.method === "GET" && pathname === "/v1/latency/summary") {
      handleLatencySummaryRequest(request, response, runtimeConfig);
      return;
    }

    if (request.method === "GET" && pathname === "/v1/account/status") {
      handleAccountStatusRequest(request, response, runtimeConfig);
      return;
    }

    if (request.method === "POST" && pathname === "/v1/payment-orders") {
      void handlePaymentOrderRequest(request, response, runtimeConfig);
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/v1/payment-orders/") && pathname.endsWith("/status")) {
      handlePaymentOrderStatusRequest(response, runtimeConfig, pathname, searchParams);
      return;
    }

    if (request.method === "POST" && pathname.startsWith("/v1/payment-orders/") && pathname.endsWith("/cancel")) {
      handlePaymentOrderCancelRequest(request, response, runtimeConfig, pathname);
      return;
    }

    if (request.method === "POST" && pathname.startsWith("/v1/payments/")) {
      void handlePaymentWebhook(request, response, runtimeConfig, pathname);
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== "/v1/live") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request);
    });
  });

  wss.on("connection", (client, request) => {
    handleClientConnection(client, request, runtimeConfig);
  });

  return {
    server,
    wss,
    listen() {
      return new Promise((resolve) => {
        server.listen(runtimeConfig.port, resolve);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        wss.close((wssError) => {
          if (wssError) {
            reject(wssError);
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      });
    }
  };
}

function handleClientTokenRequest(request: IncomingMessage, response: ServerResponse, config: RuntimeApiConfig) {
  if (config.auth.allowDevClientToken === false) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "development_token_issuer_disabled" }));
    return;
  }

  if (!config.auth.tokenSecret) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "client_token_secret_not_configured" }));
    return;
  }

  const issuerToken = extractBearerToken(request.headers.authorization);
  if (!issuerToken || issuerToken !== config.auth.devClientToken) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: issuerToken ? "invalid_token" : "missing_token" }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      clientToken: issueClientToken({
        userId: config.auth.devUserId,
        secret: config.auth.tokenSecret,
        expiresInSeconds: config.clientTokenTtlSeconds
      }),
      tokenType: "Bearer",
      expiresInSeconds: config.clientTokenTtlSeconds
    })
  );
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  const [scheme, token] = authorization?.split(" ") ?? [];
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function handleLatencySummaryRequest(request: IncomingMessage, response: ServerResponse, config: RuntimeApiConfig) {
  const auth = authenticateToken(extractBearerToken(request.headers.authorization), config.auth);
  if (!auth.ok) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: auth.reason }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(config.latencyStore.summary(auth.userId)));
}

function handleAccountStatusRequest(request: IncomingMessage, response: ServerResponse, config: RuntimeApiConfig) {
  const auth = authenticateToken(extractBearerToken(request.headers.authorization), config.auth);
  if (!auth.ok) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: auth.reason }));
    return;
  }

  const status = config.billingStore.getAccountStatus(auth.userId);
  if (!status) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "account_not_found" }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(status));
}

async function handlePaymentOrderRequest(request: IncomingMessage, response: ServerResponse, config: RuntimeApiConfig) {
  const auth = authenticateToken(extractBearerToken(request.headers.authorization), config.auth);
  if (!auth.ok) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: auth.reason }));
    return;
  }

  if (!config.paymentOrderStore) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_store_not_configured" }));
    return;
  }

  try {
    const body = parseJsonBody(await readBodyText(request));
    const provider = asString(body.provider);
    const paymentPackage = getPaymentPackage(asString(body.packageId));
    if (provider !== "alipay" && provider !== "wechat") {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "unsupported_payment_provider" }));
      return;
    }
    if (!paymentPackage) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "unknown_payment_package" }));
      return;
    }

    const order = createPendingPaymentOrder({
      orderId: `ord_${nanoid()}`,
      provider,
      userId: auth.userId,
      packageId: paymentPackage.packageId,
      now: config.now()
    });
    config.paymentOrderStore.createOrder(order);

    response.writeHead(201, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        orderId: order.orderId,
        provider: order.provider,
        userId: order.userId,
        packageId: paymentPackage.packageId,
        paidMinutes: order.paidMinutes,
        amountCents: order.expectedAmountCents,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        checkout: paymentOrderCheckout(order, config)
      })
    );
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "invalid_json" }));
  }
}

function paymentOrderCheckout(
  order: {
    orderId: string;
    provider: PaymentProvider;
    packageId?: string;
  },
  config: RuntimeApiConfig
): { mode: "provider_redirect_pending"; checkoutUrl?: string; statusUrl?: string } {
  const statusUrl = paymentOrderStatusUrl(order.orderId, config);
  const checkoutUrl = config.paymentCheckoutBaseUrl
    ? buildCheckoutUrl(config.paymentCheckoutBaseUrl, {
        orderId: order.orderId,
        provider: order.provider,
        packageId: order.packageId ?? "",
        statusUrl
      })
    : undefined;
  return {
    mode: "provider_redirect_pending",
    checkoutUrl,
    statusUrl
  };
}

function buildCheckoutUrl(
  baseUrl: string,
  params: { orderId: string; provider: PaymentProvider; packageId: string; statusUrl?: string }
): string | undefined {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") {
      return undefined;
    }
    url.searchParams.set("orderId", params.orderId);
    url.searchParams.set("provider", params.provider);
    url.searchParams.set("packageId", params.packageId);
    if (params.statusUrl) {
      url.searchParams.set("statusUrl", params.statusUrl);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function paymentOrderStatusUrl(orderId: string, config: RuntimeApiConfig): string | undefined {
  if (!config.paymentStatusBaseUrl || !config.paymentCheckoutTokenSecret) {
    return undefined;
  }

  try {
    const url = new URL(config.paymentStatusBaseUrl);
    if (url.protocol !== "https:") {
      return undefined;
    }
    url.pathname = `/v1/payment-orders/${encodeURIComponent(orderId)}/status`;
    url.search = "";
    url.hash = "";
    url.searchParams.set("token", createPaymentOrderStatusToken(orderId, config.paymentCheckoutTokenSecret));
    return url.toString();
  } catch {
    return undefined;
  }
}

function handlePaymentOrderStatusRequest(
  response: ServerResponse,
  config: RuntimeApiConfig,
  pathname: string,
  searchParams: URLSearchParams
): void {
  if (!config.paymentOrderStore || !config.paymentCheckoutTokenSecret) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_status_not_configured" }));
    return;
  }

  const orderId = decodeURIComponent(pathname.replace(/^\/v1\/payment-orders\//, "").replace(/\/status$/, ""));
  const token = searchParams.get("token") ?? "";
  if (!verifyPaymentOrderStatusToken(orderId, token, config.paymentCheckoutTokenSecret)) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "invalid_payment_order_status_token" }));
    return;
  }

  const order = readCurrentPaymentOrder(config, orderId);
  if (!order) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_not_found" }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      orderId: order.orderId,
      provider: order.provider,
      packageId: order.packageId,
      paidMinutes: order.paidMinutes,
      amountCents: order.expectedAmountCents,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      paymentId: order.paymentId,
      paidAt: order.paidAt,
      canceledAt: order.canceledAt,
      cancelReason: order.cancelReason
    })
  );
}

function handlePaymentOrderCancelRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeApiConfig,
  pathname: string
): void {
  const auth = authenticateToken(extractBearerToken(request.headers.authorization), config.auth);
  if (!auth.ok) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: auth.reason }));
    return;
  }
  if (!config.paymentOrderStore) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_store_not_configured" }));
    return;
  }

  const orderId = decodeURIComponent(pathname.replace(/^\/v1\/payment-orders\//, "").replace(/\/cancel$/, ""));
  const order = readCurrentPaymentOrder(config, orderId);
  if (!order) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_not_found" }));
    return;
  }
  if (order.userId !== auth.userId) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_user_mismatch" }));
    return;
  }
  if (order.status !== "pending") {
    response.writeHead(409, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "payment_order_not_payable" }));
    return;
  }

  config.paymentOrderStore.cancelOrder(orderId, config.now(), "user");
  const canceled = config.paymentOrderStore.getOrder(orderId);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      orderId,
      status: canceled?.status,
      canceledAt: canceled?.canceledAt,
      cancelReason: canceled?.cancelReason
    })
  );
}

function readCurrentPaymentOrder(config: RuntimeApiConfig, orderId: string) {
  const order = config.paymentOrderStore?.getOrder(orderId);
  if (!order) {
    return undefined;
  }
  const current = expirePaymentOrderIfNeeded(order, config.now());
  if (current.status !== order.status && current.status === "canceled") {
    config.paymentOrderStore?.cancelOrder(orderId, current.canceledAt ?? config.now(), current.cancelReason);
  }
  return current;
}

function createPaymentOrderStatusToken(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(orderId).digest("base64url");
}

function verifyPaymentOrderStatusToken(orderId: string, token: string, secret: string): boolean {
  const expected = createPaymentOrderStatusToken(orderId, secret);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function handlePaymentWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  config: RuntimeApiConfig,
  pathname: string
) {
  const provider = paymentProviderFromPath(pathname);
  if (!provider) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "payment_provider_not_found" }));
    return;
  }

  try {
    const rawBody = await readBodyText(request);
    const webhook = parseVerifiedPaymentWebhook(provider, rawBody, request.headers, config);
    if (!webhook.ok) {
      response.writeHead(webhook.status, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: webhook.error }));
      return;
    }

    if (webhook.event.type === "subscription.refunded") {
      const refundResult = applyPaymentRefundEvent(webhook.event, config);
      response.writeHead(refundResult.ok ? 200 : 400, { "content-type": "application/json" });
      response.end(JSON.stringify(refundResult));
      return;
    }

    if (isPaidOrderReplay(webhook, config)) {
      config.paymentLedger.markProcessed(webhook.event.provider, webhook.event.paymentId);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, grantedSeconds: 0, duplicate: true }));
      return;
    }

    const result = applyPaymentEvent(webhook.event, config.billingStore, config.paymentLedger);
    if (result.ok && !result.duplicate && webhook.orderId && config.paymentOrderStore) {
      config.paymentOrderStore.markPaid(webhook.orderId, webhook.event.paymentId, webhook.event.occurredAt);
    }
    response.writeHead(result.ok ? 200 : 400, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "invalid_json" }));
  }
}

type ParsedPaymentWebhook =
  | { ok: true; event: PaymentEvent; orderId?: string }
  | { ok: false; status: 400 | 401 | 503; error: string };

function isPaidOrderReplay(
  webhook: Extract<ParsedPaymentWebhook, { ok: true }>,
  config: RuntimeApiConfig
): boolean {
  if (!webhook.orderId || !webhook.event.paymentId.trim()) {
    return false;
  }
  const order = config.paymentOrderStore?.getOrder(webhook.orderId);
  return order?.status === "paid" && order.paymentId === webhook.event.paymentId;
}

function parseVerifiedPaymentWebhook(
  provider: PaymentProvider,
  rawBody: string,
  headers: IncomingHttpHeaders,
  config: RuntimeApiConfig
): ParsedPaymentWebhook {
  if (config.paymentVerification?.mode === "production") {
    return parseProductionPaymentWebhook(provider, rawBody, headers, config);
  }

  if (config.paymentWebhookSecret) {
    const signature = firstHeaderValue(headers["x-realtime-dubbing-signature"]);
    const signatureResult = verifyPaymentWebhookSignature(rawBody, signature, config.paymentWebhookSecret);
    if (!signatureResult.ok) {
      return { ok: false, status: 401, error: signatureResult.reason };
    }
  }

  const body = parseJsonBody(rawBody);
  const event: PaymentEvent = {
    provider,
    type: body.type === "subscription.refunded" ? "subscription.refunded" : "subscription.paid",
    userId: asString(body.userId),
    subscriptionId: asString(body.subscriptionId),
    orderId: asString(body.orderId),
    paymentId: asString(body.paymentId),
    ...(body.type === "subscription.refunded" ? { refundId: asString(body.refundId) } : { paidMinutes: Number(body.paidMinutes) }),
    amountCents: typeof body.amountCents === "number" ? body.amountCents : undefined,
    currency: typeof body.currency === "string" ? body.currency : undefined,
    occurredAt: Number(body.occurredAt ?? Date.now())
  } as PaymentEvent;

  if (event.type === "subscription.paid" && config.paymentOrderStore && event.orderId) {
    return validateProductionPaymentEvent(event, config);
  }

  return {
    ok: true,
    event
  };
}

function applyPaymentRefundEvent(event: Extract<PaymentEvent, { type: "subscription.refunded" }>, config: RuntimeApiConfig) {
  if (!config.paymentOrderStore) {
    return { ok: false, error: "payment_order_store_not_configured" };
  }

  const orderId = event.orderId ?? event.subscriptionId;
  const order = orderId ? config.paymentOrderStore.getOrder(orderId) : undefined;
  if (!order) {
    return { ok: false, error: "payment_order_not_found" };
  }
  if (order.provider !== event.provider) {
    return { ok: false, error: "payment_order_provider_mismatch" };
  }
  if (order.userId !== event.userId) {
    return { ok: false, error: "payment_order_user_mismatch" };
  }
  if (order.paymentId !== event.paymentId) {
    return { ok: false, error: "payment_order_payment_id_mismatch" };
  }
  if (order.status === "refunded") {
    return { ok: true, status: "refunded", orderId, duplicate: true };
  }
  if (!config.paymentOrderStore.markRefunded(orderId, event.occurredAt)) {
    return { ok: false, error: "payment_order_not_refundable" };
  }
  return { ok: true, status: "refunded", orderId };
}

function parseProductionPaymentWebhook(
  provider: PaymentProvider,
  rawBody: string,
  headers: IncomingHttpHeaders,
  config: RuntimeApiConfig
): ParsedPaymentWebhook {
  if (provider === "alipay") {
    const params = parseFormBody(rawBody);
    if (!config.paymentVerification?.alipayPublicKeyPem) {
      return { ok: false, status: 503, error: "alipay_public_key_not_configured" };
    }
    const signatureResult = verifyAlipayWebhookSignature(params, config.paymentVerification.alipayPublicKeyPem);
    if (!signatureResult.ok) {
      return { ok: false, status: 401, error: signatureResult.reason };
    }
    if (!isSuccessfulAlipayTradeStatus(params.trade_status)) {
      return { ok: false, status: 400, error: "payment_not_successful" };
    }
    return validateProductionPaymentEvent(paymentEventFromAlipayParams(params), config);
  }

  const wechatCertificates = config.paymentVerification?.wechatPlatformCertificates ?? {};
  const wechatApiV3Key = config.paymentVerification?.wechatApiV3Key;
  if (!wechatApiV3Key) {
    return { ok: false, status: 503, error: "wechatpay_api_v3_key_not_configured" };
  }
  const signatureResult = verifyWechatPayV3Signature({
    body: rawBody,
    headers: headersToStringRecord(headers),
    platformCertificates: wechatCertificates,
    nowSeconds: Math.floor(config.now() / 1000)
  });
  if (!signatureResult.ok) {
    return { ok: false, status: 401, error: signatureResult.reason };
  }

  const body = parseJsonBody(rawBody);
  const resource = asWechatResource(body.resource);
  const decrypted = parseJsonBody(decryptWechatPayResource(resource, wechatApiV3Key));
  if (asString(decrypted.trade_state) !== "SUCCESS") {
    return { ok: false, status: 400, error: "payment_not_successful" };
  }
  return validateProductionPaymentEvent(paymentEventFromWechatResource(decrypted), config);
}

function isSuccessfulAlipayTradeStatus(status: string | undefined): boolean {
  return status === "TRADE_SUCCESS" || status === "TRADE_FINISHED";
}

function validateProductionPaymentEvent(event: PaymentEvent, config: RuntimeApiConfig): ParsedPaymentWebhook {
  if (!config.paymentOrderStore) {
    return { ok: false, status: 503, error: "payment_order_store_not_configured" };
  }

  const orderId = event.orderId ?? event.subscriptionId;
  if (orderId) {
    readCurrentPaymentOrder(config, orderId);
  }

  const validation = validatePaymentEventAgainstOrder(event, config.paymentOrderStore);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.reason };
  }

  return { ok: true, event, orderId: validation.orderId };
}

function parseFormBody(rawBody: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

function paymentEventFromAlipayParams(params: Record<string, string | undefined>): PaymentEvent {
  const passback = parseOptionalJsonObject(params.passback_params);
  return {
    provider: "alipay",
    type: "subscription.paid",
    userId: asString(params.userId ?? passback.userId),
    subscriptionId: asString(params.subscriptionId ?? params.out_trade_no ?? passback.subscriptionId),
    orderId: asString(params.out_trade_no ?? params.subscriptionId ?? passback.subscriptionId),
    paymentId: asString(params.paymentId ?? params.trade_no),
    paidMinutes: Number(params.paidMinutes ?? passback.paidMinutes),
    amountCents: amountTextToCents(params.total_amount),
    currency: asString(params.currency ?? "CNY"),
    occurredAt: Number(params.occurredAt ?? Date.now())
  };
}

function paymentEventFromWechatResource(resource: Record<string, unknown>): PaymentEvent {
  const attach = parseOptionalJsonObject(asString(resource.attach));
  return {
    provider: "wechat",
    type: "subscription.paid",
    userId: asString(attach.userId),
    subscriptionId: asString(attach.subscriptionId ?? resource.out_trade_no),
    orderId: asString(resource.out_trade_no),
    paymentId: asString(resource.transaction_id),
    paidMinutes: Number(attach.paidMinutes),
    amountCents: Number(asRecord(resource.amount).payer_total),
    currency: asString(asRecord(resource.amount).currency ?? "CNY"),
    occurredAt: Date.parse(asString(resource.success_time)) || Date.now()
  };
}

function amountTextToCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  return Math.round(Number(value) * 100);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asWechatResource(value: unknown): WechatPayEncryptedResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Missing WeChat Pay encrypted resource.");
  }
  return value as WechatPayEncryptedResource;
}

function parseOptionalJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function headersToStringRecord(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, firstHeaderValue(value)])
  ) as Record<string, string | undefined>;
}

async function readBodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonBody(rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }
  const parsed = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function handleClientConnection(client: WebSocket, request: IncomingMessage, config: RuntimeApiConfig) {
  const auth = authenticateToken(extractTokenFromUrl(request.url), config.auth);
  if (!auth.ok) {
    sendClient(client, {
      type: "error",
      code: auth.reason,
      message: auth.reason === "missing_token" ? "Missing client token." : "Invalid client token.",
      retryable: false
    });
    client.close(4401, auth.reason);
    return;
  }

  const sessionId = `sess_${nanoid()}`;
  const metrics = createSessionMetrics(config.now);
  let aliSocket: WebSocket | undefined;
  let billingStartedAt = config.now();
  let reserved = false;
  let mockSessionActive = false;
  let aliSessionConfigured = false;
  const pendingAudio: AudioAppendMessage[] = [];

  client.on("message", (raw) => {
    const message = parseClientMessage(raw);
    if (!message) {
      sendClient(client, {
        type: "error",
        code: "invalid_message",
        message: "Client message was not valid JSON.",
        retryable: false
      });
      return;
    }

    if (message.type === "session.start") {
      const decision = config.billingStore.canStartSession(auth.userId);
      if (!decision.ok) {
        sendClient(client, {
          type: "error",
          code: decision.reason,
          message: `Cannot start translation session: ${decision.reason}.`,
          retryable: false
        });
        return;
      }

      billingStartedAt = config.now();
      reserved = true;
      config.billingStore.reserveSession(auth.userId, sessionId);
      mockSessionActive = shouldUseMockTranslation(config);
      if (mockSessionActive) {
        sendClient(client, { type: "session.ready", sessionId });
        return;
      }
      aliSocket = connectAliSocket(
        client,
        config,
        (mark) => metrics.mark(mark),
        () => {
          aliSocket?.send(JSON.stringify(buildAliSessionUpdate(message.settings, `event_${nanoid()}`)));
        },
        () => {
          aliSessionConfigured = true;
          flushPendingAudio();
          sendClient(client, { type: "session.ready", sessionId });
        }
      );
      if (!aliSocket) {
        reserved = false;
        config.billingStore.releaseSession(auth.userId, sessionId, 0);
      }
      return;
    }

    if (message.type === "audio.append") {
      sendClient(client, metrics.mark("audioInput", message.capturedAt));
      if (mockSessionActive) {
        for (const event of createMockTranslateEvents(config.now())) {
          if (event.type === "latency.mark") {
            sendClient(client, metrics.mark(event.mark, event.at));
          } else {
            sendClient(client, event);
          }
        }
        return;
      }
      if (aliSocket && (!aliSessionConfigured || aliSocket.readyState !== WebSocket.OPEN)) {
        enqueuePendingAudio(pendingAudio, message);
        return;
      }
      if (!aliSocket) {
        sendClient(client, {
          type: "error",
          code: "upstream_not_ready",
          message: "Ali LiveTranslate connection is not ready yet.",
          retryable: true
        });
        return;
      }
      forwardAudio(message);
      return;
    }

    if (message.type === "latency.mark") {
      metrics.mark(message.mark, message.at);
      return;
    }

    if (message.type === "audio.drop") {
      metrics.recordTranslatedAudioDrop();
      return;
    }

    if (message.type === "session.finish") {
      aliSocket?.send(JSON.stringify(createSessionFinishEvent()));
      client.close(1000, "session.finish");
    }
  });

  client.on("close", () => {
    aliSocket?.close();
    if (reserved) {
      const usedSeconds = Math.max(0, (config.now() - billingStartedAt) / 1000);
      config.latencyStore.record(auth.userId, metrics.snapshot());
      config.billingStore.releaseSession(auth.userId, sessionId, usedSeconds);
    }
  });

  function flushPendingAudio() {
    while (pendingAudio.length > 0) {
      const message = pendingAudio.shift();
      if (message) {
        forwardAudio(message);
      }
    }
  }

  function forwardAudio(message: AudioAppendMessage) {
    if (!aliSocket || !aliSessionConfigured || aliSocket.readyState !== WebSocket.OPEN) {
      pendingAudio.unshift(message);
      return;
    }
    sendClient(client, metrics.mark("sentToAli"));
    aliSocket.send(JSON.stringify(createInputAudioAppendEvent(message.audioBase64)));
  }
}

export function enqueuePendingAudio(
  pendingAudio: AudioAppendMessage[],
  message: AudioAppendMessage,
  limit = MAX_PENDING_AUDIO_CHUNKS
): void {
  pendingAudio.push(message);
  while (pendingAudio.length > limit) {
    pendingAudio.shift();
  }
}

function shouldUseMockTranslation(config: RuntimeApiConfig): boolean {
  return config.liveTranslateMode === "mock";
}

function connectAliSocket(
  client: WebSocket,
  config: RuntimeApiConfig,
  markLatency: (mark: LatencyMarkName) => ApiToClientMessage,
  onOpen: () => void,
  onSessionConfigured: () => void
): WebSocket | undefined {
  if (!config.aliApiKey) {
    sendClient(client, {
      type: "error",
      code: "missing_dashscope_key",
      message: "DASHSCOPE_API_KEY is required on the API server.",
      retryable: false
    });
    return undefined;
  }

  const upstream = new WebSocket(buildAliRealtimeUrl({ endpoint: config.aliEndpoint }), {
    headers: {
      Authorization: `Bearer ${config.aliApiKey}`
    }
  });

  let sessionConfigured = false;
  upstream.on("open", onOpen);
  upstream.on("message", (raw) => {
    const aliEvent = parseAliEvent(raw);
    if (!aliEvent) {
      return;
    }

    if (aliEvent.type === "session.updated" && !sessionConfigured) {
      sessionConfigured = true;
      onSessionConfigured();
    }

    const clientEvent = createClientEventFromAliEvent(aliEvent);
    if (clientEvent?.type === "translation.partial") {
      sendClient(client, markLatency("firstText"));
    }
    if (clientEvent?.type === "audio.delta") {
      sendClient(client, markLatency("firstTranslatedAudio"));
    }
    if (clientEvent) {
      sendClient(client, clientEvent);
    }
  });
  upstream.on("error", (error) => {
    sendClient(client, {
      type: "error",
      code: "upstream_error",
      message: error.message,
      retryable: true
    });
  });
  upstream.on("close", () => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "upstream_closed");
    }
  });

  return upstream;
}

function parseClientMessage(raw: WebSocket.RawData): ClientToApiMessage | undefined {
  try {
    return JSON.parse(raw.toString()) as ClientToApiMessage;
  } catch {
    return undefined;
  }
}

function parseAliEvent(raw: WebSocket.RawData): AliServerEvent | undefined {
  try {
    return JSON.parse(raw.toString()) as AliServerEvent;
  } catch {
    return undefined;
  }
}

function sendClient(client: WebSocket, message: ApiToClientMessage) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}
