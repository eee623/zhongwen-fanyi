import { once } from "node:events";
import { createCipheriv, createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@realtime-dubbing/shared";
import { issueClientToken } from "../src/auth";
import { createInMemoryBillingStore } from "../src/billing";
import { loadConfig } from "../src/config";
import { createInMemoryLatencyStore } from "../src/latencyStats";
import { buildAlipaySignContent, buildWechatPayV3SignContent, createInMemoryPaymentOrderStore } from "../src/payments";
import { createLiveTranslationServer, enqueuePendingAudio, MAX_PENDING_AUDIO_CHUNKS } from "../src/sessionServer";

describe("live translation websocket proxy", () => {
  it("caps queued pre-ready audio while preserving the latest realtime chunks", () => {
    const pendingAudio: Parameters<typeof enqueuePendingAudio>[0] = [];

    for (let index = 0; index < MAX_PENDING_AUDIO_CHUNKS + 2; index += 1) {
      enqueuePendingAudio(pendingAudio, {
        type: "audio.append",
        audioBase64: `chunk_${index}`,
        capturedAt: 1000 + index
      });
    }

    expect(MAX_PENDING_AUDIO_CHUNKS).toBe(500);
    expect(pendingAudio).toHaveLength(MAX_PENDING_AUDIO_CHUNKS);
    expect(pendingAudio[0]?.audioBase64).toBe("chunk_2");
    expect(pendingAudio.at(-1)?.audioBase64).toBe(`chunk_${MAX_PENDING_AUDIO_CHUNKS + 1}`);
  });

  it("issues a signed client token that can start a live translation session", async () => {
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "issuer-token",
        devUserId: "user_1",
        tokenSecret: "client-token-secret"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const tokenResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/auth/client-token`, {
      method: "POST",
      headers: {
        authorization: "Bearer issuer-token"
      }
    });
    const tokenBody = (await tokenResponse.json()) as Record<string, unknown>;

    expect(tokenResponse.status).toBe(200);
    expect(tokenBody).toMatchObject({
      tokenType: "Bearer",
      expiresInSeconds: 60
    });
    expect(typeof tokenBody.clientToken).toBe("string");

    const client = new WebSocket(
      `ws://127.0.0.1:${apiPort}/v1/live?token=${encodeURIComponent(tokenBody.clientToken as string)}`
    );
    const messages: unknown[] = [];
    client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(client, "open");

    client.send(JSON.stringify({ type: "session.start", settings: defaultSettings, startedAt: 1000 }));

    await waitFor(() => messages.some((message) => isRecord(message) && message.type === "session.ready"));

    client.close();
    await api.close();
  });

  it("does not allow issued short-lived client tokens to mint more tokens", async () => {
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "issuer-token",
        devUserId: "user_1",
        tokenSecret: "client-token-secret"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });
    const clientToken = issueClientToken({
      userId: "user_1",
      secret: "client-token-secret",
      expiresInSeconds: 60
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const tokenResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/auth/client-token`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${clientToken}`
      }
    });

    expect(tokenResponse.status).toBe(401);

    await api.close();
  });

  it("does not expose the development token issuer when development tokens are disabled", async () => {
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "issuer-token",
        devUserId: "user_1",
        tokenSecret: "client-token-secret",
        allowDevClientToken: false
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/auth/client-token`, {
      method: "POST",
      headers: {
        authorization: "Bearer issuer-token"
      }
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "development_token_issuer_disabled"
    });

    await api.close();
  });

  it("returns authenticated account entitlement status", async () => {
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "pro",
        remainingSeconds: 185,
        maxConcurrentSessions: 2
      }
    });
    billingStore.reserveSession("user_1", "session_a");
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const statusResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/account/status`, {
      headers: {
        authorization: "Bearer client-token"
      }
    });

    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      plan: "pro",
      remainingSeconds: 185,
      remainingMinutes: 4,
      maxConcurrentSessions: 2,
      activeSessions: 1,
      canStartSession: true
    });

    await api.close();
  });

  it("creates authenticated payment orders from server-side package catalog", async () => {
    const paymentOrderStore = createInMemoryPaymentOrderStore();
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      now: () => 1_780_000_000_000,
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "trial",
          remainingSeconds: 0,
          maxConcurrentSessions: 1
        }
      }),
      paymentOrderStore,
      paymentCheckoutBaseUrl: "https://checkout.example.com/pay"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const unauthorizedResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "alipay",
        packageId: "pro_20m_cny_39"
      })
    });
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "alipay",
        packageId: "pro_20m_cny_39",
        amountCents: 1,
        paidMinutes: 999
      })
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(unauthorizedResponse.status).toBe(401);
    expect(response.status).toBe(201);
    expect(body).toMatchObject({
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
    });
    expect(String(body.orderId)).toMatch(/^ord_/);
    const checkoutUrl = new URL(String((body.checkout as Record<string, unknown>).checkoutUrl));
    expect(checkoutUrl.origin + checkoutUrl.pathname).toBe("https://checkout.example.com/pay");
    expect(checkoutUrl.searchParams.get("orderId")).toBe(String(body.orderId));
    expect(checkoutUrl.searchParams.get("provider")).toBe("alipay");
    expect(checkoutUrl.searchParams.get("packageId")).toBe("pro_20m_cny_39");
    expect(paymentOrderStore.getOrder(String(body.orderId))).toMatchObject({
      orderId: body.orderId,
      provider: "alipay",
      userId: "user_1",
      paidMinutes: 20,
      expectedAmountCents: 3900,
      currency: "CNY",
      status: "pending"
    });

    await api.close();
  });

  it("creates signed public payment order status URLs for the checkout page", async () => {
    const paymentOrderStore = createInMemoryPaymentOrderStore();
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      now: () => 1_780_000_000_000,
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "trial",
          remainingSeconds: 0,
          maxConcurrentSessions: 1
        }
      }),
      paymentOrderStore,
      paymentCheckoutBaseUrl: "https://checkout.example.com/pay",
      paymentStatusBaseUrl: "https://api.example.com",
      paymentCheckoutTokenSecret: "checkout-token-secret"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "wechat",
        packageId: "pro_20m_cny_39"
      })
    });
    const body = (await response.json()) as Record<string, unknown>;
    const checkout = body.checkout as Record<string, unknown>;
    const statusUrl = new URL(String(checkout.statusUrl));
    const checkoutUrl = new URL(String(checkout.checkoutUrl));

    expect(response.status).toBe(201);
    expect(statusUrl.origin).toBe("https://api.example.com");
    expect(statusUrl.pathname).toBe(`/v1/payment-orders/${body.orderId}/status`);
    expect(statusUrl.searchParams.get("token")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(checkoutUrl.searchParams.get("statusUrl")).toBe(statusUrl.toString());

    const localStatusUrl = new URL(statusUrl.toString());
    localStatusUrl.protocol = "http:";
    localStatusUrl.hostname = "127.0.0.1";
    localStatusUrl.port = String(apiPort);
    const statusResponse = await fetch(localStatusUrl);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      orderId: body.orderId,
      provider: "wechat",
      packageId: "pro_20m_cny_39",
      status: "pending",
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY"
    });

    const tamperedStatusUrl = new URL(localStatusUrl.toString());
    tamperedStatusUrl.searchParams.set("token", "tampered");
    const tamperedResponse = await fetch(tamperedStatusUrl);
    expect(tamperedResponse.status).toBe(401);
    expect(await tamperedResponse.json()).toEqual({
      ok: false,
      error: "invalid_payment_order_status_token"
    });

    paymentOrderStore.markPaid(String(body.orderId), "wx_pay_1", 1_780_000_001_000);
    const paidStatusResponse = await fetch(localStatusUrl);
    expect(paidStatusResponse.status).toBe(200);
    expect(await paidStatusResponse.json()).toMatchObject({
      orderId: body.orderId,
      status: "paid",
      paymentId: "wx_pay_1",
      paidAt: 1_780_000_001_000
    });

    await api.close();
  });

  it("expires and cancels pending payment orders before paid webhooks can grant minutes", async () => {
    let now = 1_780_000_000_000;
    const paymentOrderStore = createInMemoryPaymentOrderStore();
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      now: () => now,
      clientTokenTtlSeconds: 60,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentOrderStore,
      paymentCheckoutBaseUrl: "https://checkout.example.com/pay",
      paymentStatusBaseUrl: "https://api.example.com",
      paymentCheckoutTokenSecret: "checkout-token-secret",
      paymentWebhookSecret: "webhook-secret"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const orderResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "alipay",
        packageId: "pro_20m_cny_39"
      })
    });
    const orderBody = (await orderResponse.json()) as Record<string, unknown>;
    const statusUrl = new URL(String((orderBody.checkout as Record<string, unknown>).statusUrl));
    statusUrl.protocol = "http:";
    statusUrl.hostname = "127.0.0.1";
    statusUrl.port = String(apiPort);
    now = Number(orderBody.expiresAt);

    const expiredStatusResponse = await fetch(statusUrl);
    expect(expiredStatusResponse.status).toBe(200);
    expect(await expiredStatusResponse.json()).toMatchObject({
      orderId: orderBody.orderId,
      status: "canceled",
      cancelReason: "expired",
      canceledAt: orderBody.expiresAt
    });

    const webhookBody = JSON.stringify({
      userId: "user_1",
      subscriptionId: orderBody.orderId,
      orderId: orderBody.orderId,
      paymentId: "ali_pay_after_expiry",
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY",
      occurredAt: now + 1000
    });
    const webhookResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-dubbing-signature": signWebhookBody(webhookBody, "webhook-secret")
      },
      body: webhookBody
    });
    expect(webhookResponse.status).toBe(400);
    expect(await webhookResponse.json()).toEqual({
      ok: false,
      error: "payment_order_not_payable"
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 0
    });

    const cancelOrderResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "wechat",
        packageId: "pro_20m_cny_39"
      })
    });
    const cancelOrderBody = (await cancelOrderResponse.json()) as Record<string, unknown>;
    const cancelResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payment-orders/${cancelOrderBody.orderId}/cancel`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token"
      }
    });
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toMatchObject({
      orderId: cancelOrderBody.orderId,
      status: "canceled",
      cancelReason: "user"
    });

    await api.close();
  });

  it("rejects payment order creation when the order store or package is invalid", async () => {
    const apiWithoutOrderStore = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore()
    });
    const apiWithOrderStore = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore(),
      paymentOrderStore: createInMemoryPaymentOrderStore()
    });

    await apiWithoutOrderStore.listen();
    await apiWithOrderStore.listen();
    const missingStorePort = (apiWithoutOrderStore.server.address() as AddressInfo).port;
    const invalidPackagePort = (apiWithOrderStore.server.address() as AddressInfo).port;
    const missingStoreResponse = await fetch(`http://127.0.0.1:${missingStorePort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "wechat",
        packageId: "pro_20m_cny_39"
      })
    });
    const invalidPackageResponse = await fetch(`http://127.0.0.1:${invalidPackagePort}/v1/payment-orders`, {
      method: "POST",
      headers: {
        authorization: "Bearer client-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: "wechat",
        packageId: "free_forever"
      })
    });

    expect(missingStoreResponse.status).toBe(503);
    expect(await missingStoreResponse.json()).toEqual({
      ok: false,
      error: "payment_order_store_not_configured"
    });
    expect(invalidPackageResponse.status).toBe(400);
    expect(await invalidPackageResponse.json()).toEqual({
      ok: false,
      error: "unknown_payment_package"
    });

    await apiWithoutOrderStore.close();
    await apiWithOrderStore.close();
  });

  it("proxies browser audio to Ali and maps text/audio events back to the client", async () => {
    const fakeAli = new WebSocketServer({ port: 0 });
    const fakeAliPort = (fakeAli.address() as AddressInfo).port;
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "test-key",
      aliEndpoint: `ws://127.0.0.1:${fakeAliPort}/api-ws/v1/realtime`,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const client = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/live?token=client-token`);
    const upstreamMessages = collectFirstConnectionMessages(fakeAli);
    const messages: unknown[] = [];
    client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(client, "open");

    client.send(
      JSON.stringify({
        type: "session.start",
        settings: defaultSettings,
        startedAt: 1000
      })
    );
    const upstream = await upstreamMessages.socket;

    const sessionUpdate = await upstreamMessages.nextJson();
    expect(sessionUpdate).toMatchObject({
      type: "session.update",
      session: {
        translation: { language: "zh" },
        voice_clone_options: { frequency: "always" }
      }
    });
    upstream.send(JSON.stringify({ type: "session.updated" }));

    client.send(
      JSON.stringify({
        type: "audio.append",
        audioBase64: "AAAA",
        capturedAt: 1200
      })
    );
    expect(await upstreamMessages.nextJson()).toMatchObject({
      type: "input_audio_buffer.append",
      audio: "AAAA"
    });

    upstream.send(
      JSON.stringify({
        type: "response.audio_transcript.text",
        response_id: "resp_1",
        text: "你好",
        stash: "世界"
      })
    );
    upstream.send(
      JSON.stringify({
        type: "response.audio.delta",
        response_id: "resp_1",
        delta: "UklG"
      })
    );

    await waitFor(() =>
      messages.some((message) => isRecord(message) && message.type === "audio.delta")
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "translation.partial", text: "你好", stash: "世界" })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "audio.delta", audioBase64: "UklG" })
    );

    client.close();
    await api.close();
    fakeAli.close();
  });

  it("records latency percentiles for completed sessions", async () => {
    const fakeAli = new WebSocketServer({ port: 0 });
    const fakeAliPort = (fakeAli.address() as AddressInfo).port;
    const latencyStore = createInMemoryLatencyStore();
    let now = 1000;
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "test-key",
      aliEndpoint: `ws://127.0.0.1:${fakeAliPort}/api-ws/v1/realtime`,
      liveTranslateMode: "aliyun",
      clientTokenTtlSeconds: 60,
      now: () => now,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      latencyStore,
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const client = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/live?token=client-token`);
    const upstreamMessages = collectFirstConnectionMessages(fakeAli);
    const messages: unknown[] = [];
    client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(client, "open");

    client.send(JSON.stringify({ type: "session.start", settings: defaultSettings, startedAt: 1000 }));
    const upstream = await upstreamMessages.socket;
    await upstreamMessages.nextJson();
    upstream.send(JSON.stringify({ type: "session.updated" }));

    now = 1120;
    client.send(JSON.stringify({ type: "audio.append", audioBase64: "AAAA", capturedAt: 1100 }));
    await upstreamMessages.nextJson();

    now = 1300;
    upstream.send(JSON.stringify({ type: "response.audio_transcript.text", response_id: "resp_1", text: "你好" }));
    await waitFor(() => messages.some((message) => isRecord(message) && message.type === "translation.partial"));
    now = 1500;
    upstream.send(JSON.stringify({ type: "response.audio.delta", response_id: "resp_1", delta: "UklG" }));

    await waitFor(() => messages.some((message) => isRecord(message) && message.type === "audio.delta"));
    client.send(JSON.stringify({ type: "latency.mark", mark: "playbackStarted", at: 1550 }));
    client.send(
      JSON.stringify({
        type: "audio.drop",
        reason: "translated_audio_queue_overflow",
        droppedAt: 1560,
        queuedSeconds: 1.25
      })
    );
    client.close();
    await once(client, "close");

    const summaryResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/latency/summary`, {
      headers: {
        authorization: "Bearer client-token"
      }
    });

    expect(summaryResponse.status).toBe(200);
    expect(await summaryResponse.json()).toEqual({
      count: 1,
      inputToSentToAliMs: { p50: 20, p95: 20 },
      inputToFirstTextMs: { p50: 200, p95: 200 },
      inputToFirstAudioMs: { p50: 400, p95: 400 },
      inputToPlaybackMs: { p50: 450, p95: 450 },
      sentToAliToFirstTextMs: { p50: 180, p95: 180 },
      sentToAliToFirstAudioMs: { p50: 380, p95: 380 },
      sessionToFirstAudioMs: { p50: 500, p95: 500 },
      translatedAudioDroppedChunks: { p50: 1, p95: 1 }
    });

    await api.close();
    fakeAli.close();
  });

  it("queues early audio chunks until the Ali upstream websocket is ready", async () => {
    const fakeAli = new WebSocketServer({ port: 0 });
    const fakeAliPort = (fakeAli.address() as AddressInfo).port;
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "test-key",
      aliEndpoint: `ws://127.0.0.1:${fakeAliPort}/api-ws/v1/realtime`,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const client = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/live?token=client-token`);
    const upstreamMessages = collectFirstConnectionMessages(fakeAli);
    await once(client, "open");

    client.send(JSON.stringify({ type: "session.start", settings: defaultSettings, startedAt: 1000 }));
    client.send(JSON.stringify({ type: "audio.append", audioBase64: "EARLY", capturedAt: 1001 }));

    const upstream = await upstreamMessages.socket;
    expect(await upstreamMessages.nextJson()).toMatchObject({ type: "session.update" });
    await sleep(30);
    expect(upstreamMessages.queuedCount()).toBe(0);
    upstream.send(JSON.stringify({ type: "session.updated" }));
    expect(await upstreamMessages.nextJson()).toMatchObject({
      type: "input_audio_buffer.append",
      audio: "EARLY"
    });

    client.close();
    await api.close();
    fakeAli.close();
  });

  it("returns local mock translation events without a DashScope key when mock mode is enabled", async () => {
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore: createInMemoryBillingStore({
        user_1: {
          plan: "pro",
          remainingSeconds: 60,
          maxConcurrentSessions: 1
        }
      })
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const client = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/live?token=client-token`);
    const messages: unknown[] = [];
    client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(client, "open");

    client.send(
      JSON.stringify({
        type: "session.start",
        settings: { ...defaultSettings, provider: "mock-live-translate" },
        startedAt: 1000
      })
    );
    client.send(JSON.stringify({ type: "audio.append", audioBase64: "AAAA", capturedAt: 1001 }));

    await waitFor(() => messages.some((message) => isRecord(message) && message.type === "audio.delta"));
    expect(messages).toContainEqual(expect.objectContaining({ type: "session.ready" }));
    expect(messages).toContainEqual(expect.objectContaining({ type: "translation.partial", text: "模拟中文同传" }));
    expect(messages).toContainEqual(expect.objectContaining({ type: "audio.delta", sampleRate: 16000, format: "pcm" }));

    client.close();
    await api.close();
  });

  it("uses server time instead of client supplied timestamps for quota deduction", async () => {
    let now = 1_000;
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "pro",
        remainingSeconds: 60,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      now: () => now,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const client = new WebSocket(`ws://127.0.0.1:${apiPort}/v1/live?token=client-token`);
    const messages: unknown[] = [];
    client.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(client, "open");

    client.send(
      JSON.stringify({
        type: "session.start",
        settings: { ...defaultSettings, provider: "mock-live-translate" },
        startedAt: 9_999_999_999_999
      })
    );
    await waitFor(() => messages.some((message) => isRecord(message) && message.type === "session.ready"));
    now = 31_000;
    client.close();
    await once(client, "close");
    await waitFor(() => billingStore.getEntitlement("user_1")?.remainingSeconds === 30);

    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 30
    });

    await api.close();
  });

  it("requires a valid payment webhook signature when a webhook secret is configured", async () => {
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentWebhookSecret: "webhook-secret"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const body = JSON.stringify({
      userId: "user_1",
      subscriptionId: "sub_1",
      paymentId: "pay_1",
      paidMinutes: 10,
      occurredAt: 1000
    });
    const unsignedResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body
    });

    expect(unsignedResponse.status).toBe(401);
    expect(await unsignedResponse.json()).toEqual({
      ok: false,
      error: "missing_signature"
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 0
    });

    const signedResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-dubbing-signature": signWebhookBody(body, "webhook-secret")
      },
      body
    });

    expect(signedResponse.status).toBe(200);
    expect(await signedResponse.json()).toMatchObject({
      ok: true,
      duplicate: false,
      grantedSeconds: 600
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 600
    });

    await api.close();
  });

  it("treats a replayed paid order as duplicate even if the payment ledger is empty", async () => {
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentOrderStore: createInMemoryPaymentOrderStore({
        ord_paid_1: {
          orderId: "ord_paid_1",
          provider: "alipay",
          userId: "user_1",
          expectedAmountCents: 3900,
          currency: "CNY",
          paidMinutes: 20,
          status: "paid",
          paymentId: "ali_pay_paid_1",
          paidAt: 1_780_000_000_000
        }
      }),
      paymentWebhookSecret: "webhook-secret"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const body = JSON.stringify({
      userId: "user_1",
      subscriptionId: "ord_paid_1",
      orderId: "ord_paid_1",
      paymentId: "ali_pay_paid_1",
      paidMinutes: 20,
      amountCents: 3900,
      currency: "CNY",
      occurredAt: 1_780_000_010_000
    });
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-dubbing-signature": signWebhookBody(body, "webhook-secret")
      },
      body
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      duplicate: true,
      grantedSeconds: 0
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 0
    });

    await api.close();
  });

  it("marks a paid order as refunded without granting subscription minutes", async () => {
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "pro",
        remainingSeconds: 300,
        maxConcurrentSessions: 1
      }
    });
    const paymentOrderStore = createInMemoryPaymentOrderStore({
      ord_refund_1: {
        orderId: "ord_refund_1",
        provider: "wechat",
        userId: "user_1",
        expectedAmountCents: 3900,
        currency: "CNY",
        paidMinutes: 20,
        status: "paid",
        paymentId: "wx_pay_refund_1",
        paidAt: 1_780_000_000_000
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentOrderStore,
      paymentWebhookSecret: "webhook-secret"
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const body = JSON.stringify({
      type: "subscription.refunded",
      userId: "user_1",
      subscriptionId: "ord_refund_1",
      orderId: "ord_refund_1",
      paymentId: "wx_pay_refund_1",
      refundId: "wx_refund_1",
      occurredAt: 1_780_000_010_000
    });
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/wechat/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-dubbing-signature": signWebhookBody(body, "webhook-secret")
      },
      body
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "refunded",
      orderId: "ord_refund_1"
    });
    expect(paymentOrderStore.getOrder("ord_refund_1")).toMatchObject({
      status: "refunded",
      refundedAt: 1_780_000_010_000
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 300
    });

    await api.close();
  });

  it("verifies Alipay production webhook signatures before granting minutes", async () => {
    const keyPair = generateRsaKeyPair();
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentOrderStore: createInMemoryPaymentOrderStore({
        sub_1: {
          orderId: "sub_1",
          provider: "alipay",
          userId: "user_1",
          expectedAmountCents: 3900,
          currency: "CNY",
          paidMinutes: 20,
          status: "pending"
        }
      }),
      paymentVerification: {
        mode: "production",
        alipayPublicKeyPem: keyPair.publicKeyPem
      }
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const params = {
      app_id: "2026000000000000",
      userId: "user_1",
      subscriptionId: "sub_1",
      paymentId: "ali_pay_1",
      paidMinutes: "20",
      occurredAt: "1000",
      trade_no: "2026062222001412340500000001",
      trade_status: "TRADE_SUCCESS",
      total_amount: "39.00",
      sign_type: "RSA2"
    };
    const mismatchParams = {
      ...params,
      subscriptionId: "sub_1",
      paymentId: "ali_pay_mismatch",
      trade_no: "2026062222001412340500000002",
      total_amount: "0.01"
    };
    const pendingParams = {
      ...params,
      paymentId: "ali_pay_pending",
      trade_no: "2026062222001412340500000003",
      trade_status: "WAIT_BUYER_PAY"
    };
    const sign = createSign("RSA-SHA256").update(buildAlipaySignContent(params)).sign(keyPair.privateKeyPem, "base64");
    const mismatchSign = createSign("RSA-SHA256")
      .update(buildAlipaySignContent(mismatchParams))
      .sign(keyPair.privateKeyPem, "base64");
    const pendingSign = createSign("RSA-SHA256")
      .update(buildAlipaySignContent(pendingParams))
      .sign(keyPair.privateKeyPem, "base64");
    const mismatchResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ ...mismatchParams, sign: mismatchSign })
    });
    const pendingResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ ...pendingParams, sign: pendingSign })
    });
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ ...params, sign })
    });
    const tamperedResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/alipay/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ ...params, paidMinutes: "999", sign })
    });

    expect(mismatchResponse.status).toBe(400);
    expect(await mismatchResponse.json()).toEqual({
      ok: false,
      error: "payment_order_amount_mismatch"
    });
    expect(pendingResponse.status).toBe(400);
    expect(await pendingResponse.json()).toEqual({
      ok: false,
      error: "payment_not_successful"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      duplicate: false,
      grantedSeconds: 1200
    });
    expect(tamperedResponse.status).toBe(401);
    expect(await tamperedResponse.json()).toEqual({
      ok: false,
      error: "invalid_signature"
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 1200
    });

    await api.close();
  });

  it("verifies and decrypts WeChat Pay v3 production webhooks before granting minutes", async () => {
    const keyPair = generateRsaKeyPair();
    const apiV3Key = "12345678901234567890123456789012";
    const billingStore = createInMemoryBillingStore({
      user_1: {
        plan: "trial",
        remainingSeconds: 0,
        maxConcurrentSessions: 1
      }
    });
    const api = createLiveTranslationServer({
      port: 0,
      aliApiKey: "",
      aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      liveTranslateMode: "mock",
      now: () => 1_780_000_001_000,
      auth: {
        devClientToken: "client-token",
        devUserId: "user_1"
      },
      billingStore,
      paymentOrderStore: createInMemoryPaymentOrderStore({
        sub_1: {
          orderId: "sub_1",
          provider: "wechat",
          userId: "user_1",
          expectedAmountCents: 3900,
          currency: "CNY",
          paidMinutes: 25,
          status: "pending"
        }
      }),
      paymentVerification: {
        mode: "production",
        wechatPlatformCertificates: {
          wechat_serial_1: keyPair.publicKeyPem
        },
        wechatApiV3Key: apiV3Key
      }
    });

    await api.listen();
    const apiPort = (api.server.address() as AddressInfo).port;
    const decryptedResource = JSON.stringify({
      out_trade_no: "sub_1",
      transaction_id: "wx_pay_1",
      trade_state: "SUCCESS",
      amount: {
        payer_total: 3900,
        currency: "CNY"
      },
      attach: JSON.stringify({ userId: "user_1", paidMinutes: 25 })
    });
    const rawBody = JSON.stringify({
      id: "notify_1",
      event_type: "TRANSACTION.SUCCESS",
      resource: {
        algorithm: "AEAD_AES_256_GCM",
        associated_data: "transaction",
        nonce: "0123456789ab",
        ciphertext: encryptWechatResource(decryptedResource, apiV3Key, "0123456789ab", "transaction")
      }
    });
    const pendingRawBody = JSON.stringify({
      id: "notify_pending",
      event_type: "TRANSACTION.SUCCESS",
      resource: {
        algorithm: "AEAD_AES_256_GCM",
        associated_data: "transaction",
        nonce: "0123456789ac",
        ciphertext: encryptWechatResource(
          JSON.stringify({
            out_trade_no: "sub_1",
            transaction_id: "wx_pay_pending",
            trade_state: "NOTPAY",
            amount: {
              payer_total: 3900,
              currency: "CNY"
            },
            attach: JSON.stringify({ userId: "user_1", paidMinutes: 25 })
          }),
          apiV3Key,
          "0123456789ac",
          "transaction"
        )
      }
    });
    const timestamp = "1780000000";
    const nonce = "header-nonce";
    const signature = createSign("RSA-SHA256")
      .update(buildWechatPayV3SignContent({ timestamp, nonce, body: rawBody }))
      .sign(keyPair.privateKeyPem, "base64");
    const pendingSignature = createSign("RSA-SHA256")
      .update(buildWechatPayV3SignContent({ timestamp, nonce, body: pendingRawBody }))
      .sign(keyPair.privateKeyPem, "base64");

    const pendingResponse = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/wechat/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "wechatpay-serial": "wechat_serial_1",
        "wechatpay-signature": pendingSignature,
        "wechatpay-timestamp": timestamp,
        "wechatpay-nonce": nonce
      },
      body: pendingRawBody
    });
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/payments/wechat/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "wechatpay-serial": "wechat_serial_1",
        "wechatpay-signature": signature,
        "wechatpay-timestamp": timestamp,
        "wechatpay-nonce": nonce
      },
      body: rawBody
    });

    expect(pendingResponse.status).toBe(400);
    expect(await pendingResponse.json()).toEqual({
      ok: false,
      error: "payment_not_successful"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      duplicate: false,
      grantedSeconds: 1500
    });
    expect(billingStore.getEntitlement("user_1")).toMatchObject({
      remainingSeconds: 1500
    });

    await api.close();
  });

  it("loads mock mode from the environment explicitly", () => {
    const config = loadConfig({
      LIVE_TRANSLATE_MODE: "mock",
      DEV_CLIENT_TOKEN: "token",
      DEV_USER_ID: "user_1"
    });

    expect(config.liveTranslateMode).toBe("mock");
    expect(config.aliApiKey).toBe("");
  });
});

function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

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

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function collectFirstConnectionMessages(server: WebSocketServer) {
  const queue: Record<string, unknown>[] = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];

  const socket = new Promise<WebSocket>((resolve) => {
    server.once("connection", (upstream) => {
      upstream.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        const waiter = waiters.shift();
        if (waiter) {
          waiter(parsed);
          return;
        }
        queue.push(parsed);
      });
      resolve(upstream);
    });
  });

  return {
    socket,
    queuedCount(): number {
      return queue.length;
    },
    async nextJson(): Promise<Record<string, unknown>> {
      const queued = queue.shift();
      if (queued) {
        return queued;
      }
      return new Promise((resolve) => waiters.push(resolve));
    }
  };
}
