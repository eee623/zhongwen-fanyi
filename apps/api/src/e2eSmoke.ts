import { once } from "node:events";
import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { defaultSettings } from "@realtime-dubbing/shared";
import { createInMemoryBillingStore, type AccountStatus } from "./billing.js";
import { createInMemoryLatencyStore, type LatencySummary } from "./latencyStats.js";
import { createLiveTranslationServer } from "./sessionServer.js";

export interface MockE2eSmokeResult {
  account: AccountStatus;
  receivedTranslation: boolean;
  receivedAudio: boolean;
  latencySummary: LatencySummary;
}

export async function runMockE2eSmoke(): Promise<MockE2eSmokeResult> {
  const api = createLiveTranslationServer({
    port: 0,
    aliApiKey: "",
    aliEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    liveTranslateMode: "mock",
    clientTokenTtlSeconds: 60,
    now: Date.now,
    auth: {
      devClientToken: "dev-client-token",
      devUserId: "user_1",
      tokenSecret: "local-smoke-secret"
    },
    latencyStore: createInMemoryLatencyStore(),
    billingStore: createInMemoryBillingStore({
      user_1: {
        plan: "pro",
        remainingSeconds: 3600,
        maxConcurrentSessions: 1
      }
    })
  });

  await api.listen();
  try {
    const port = (api.server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const clientToken = await issueSmokeCredential(baseUrl);
    const account = await getJson<AccountStatus>(`${baseUrl}/v1/account/status`, clientToken);
    const websocketUrl = `ws://127.0.0.1:${port}/v1/live?token=${encodeURIComponent(clientToken)}`;
    const websocketResult = await runMockWebSocketSession(websocketUrl);
    const latencySummary = await getJson<LatencySummary>(`${baseUrl}/v1/latency/summary`, clientToken);

    return {
      account,
      receivedTranslation: websocketResult.receivedTranslation,
      receivedAudio: websocketResult.receivedAudio,
      latencySummary
    };
  } finally {
    await api.close();
  }
}

async function issueSmokeCredential(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/client-token`, {
    method: "POST",
    headers: {
      authorization: "Bearer dev-client-token"
    }
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.clientToken !== "string") {
    throw new Error(`Smoke credential request failed with ${response.status}.`);
  }
  return body.clientToken;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function runMockWebSocketSession(websocketUrl: string): Promise<{
  receivedTranslation: boolean;
  receivedAudio: boolean;
}> {
  const socket = new WebSocket(websocketUrl);
  let receivedTranslation = false;
  let receivedAudio = false;

  socket.on("message", (raw) => {
    const event = JSON.parse(raw.toString()) as { type?: string };
    if (event.type === "translation.partial") {
      receivedTranslation = true;
    }
    if (event.type === "audio.delta") {
      receivedAudio = true;
      socket.send(
        JSON.stringify({
          type: "latency.mark",
          mark: "playbackStarted",
          at: Date.now()
        })
      );
      socket.send(
        JSON.stringify({
          type: "session.finish",
          finishedAt: Date.now()
        })
      );
    }
  });

  await once(socket, "open");
  socket.send(
    JSON.stringify({
      type: "session.start",
      settings: { ...defaultSettings, provider: "mock-live-translate" },
      startedAt: Date.now()
    })
  );
  socket.send(
    JSON.stringify({
      type: "audio.append",
      audioBase64: "AAAA",
      capturedAt: Date.now()
    })
  );
  await once(socket, "close");

  return {
    receivedTranslation,
    receivedAudio
  };
}
