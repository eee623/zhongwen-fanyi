import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { runAliConnectivityCheck } from "../src/aliConnectivityCheck";

describe("Ali realtime connectivity check", () => {
  it("fails locally when the DashScope key is missing", async () => {
    await expect(
      runAliConnectivityCheck({
        apiKey: "",
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
        timeoutMs: 50
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "missing_api_key"
    });
  });

  it("opens the realtime websocket with auth, sends voice-clone session config, and resolves on session.updated", async () => {
    const fakeAli = new WebSocketServer({ port: 0 });
    const port = (fakeAli.address() as AddressInfo).port;
    const received = once(fakeAli, "connection").then(([socket, request]) => {
      socket.on("message", (raw) => {
        socket.send(JSON.stringify({ type: "session.updated" }));
      });
      return {
        authorization: request.headers.authorization,
        url: request.url,
        nextJson: once(socket, "message").then(([raw]) => JSON.parse(raw.toString()) as Record<string, unknown>)
      };
    });

    const resultPromise = runAliConnectivityCheck({
      apiKey: "sk-test",
      endpoint: `ws://127.0.0.1:${port}/api-ws/v1/realtime`,
      timeoutMs: 500
    });

    const connection = await received;
    expect(connection.authorization).toBe("Bearer sk-test");
    expect(connection.url).toBe("/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime");
    await expect(connection.nextJson).resolves.toMatchObject({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        enable_voice_clone: true,
        voice_clone_options: { frequency: "always" },
        translation: { language: "zh" }
      }
    });
    await expect(resultPromise).resolves.toMatchObject({
      ok: true,
      readyEventType: "session.updated"
    });

    fakeAli.close();
  });

  it("returns Ali error events as structured preflight failures", async () => {
    const fakeAli = new WebSocketServer({ port: 0 });
    const port = (fakeAli.address() as AddressInfo).port;
    fakeAli.on("connection", (socket) => {
      socket.on("message", () => {
        socket.send(
          JSON.stringify({
            type: "error",
            error: {
              code: "InvalidApiKey",
              message: "api key invalid"
            }
          })
        );
      });
    });

    await expect(
      runAliConnectivityCheck({
        apiKey: "sk-invalid",
        endpoint: `ws://127.0.0.1:${port}/api-ws/v1/realtime`,
        timeoutMs: 500
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "ali_error",
      code: "InvalidApiKey",
      message: "api key invalid"
    });

    fakeAli.close();
  });
});
