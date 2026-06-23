import { WebSocket } from "ws";
import { buildAliSessionUpdate, defaultSettings } from "@realtime-dubbing/shared";
import { buildAliRealtimeUrl } from "./aliProxy.js";

export type AliConnectivityCheckResult =
  | {
      ok: true;
      readyEventType: string;
      elapsedMs: number;
    }
  | {
      ok: false;
      reason: "missing_api_key" | "ali_error" | "connection_failed" | "timeout";
      code?: string;
      message?: string;
      elapsedMs?: number;
    };

export interface AliConnectivityCheckOptions {
  apiKey: string | undefined;
  endpoint: string;
  timeoutMs?: number;
}

export async function runAliConnectivityCheck(
  options: AliConnectivityCheckOptions
): Promise<AliConnectivityCheckResult> {
  if (!options.apiKey?.startsWith("sk-")) {
    return { ok: false, reason: "missing_api_key" };
  }

  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 12_000;

  return new Promise((resolve) => {
    let settled = false;
    const socket = new WebSocket(buildAliRealtimeUrl({ endpoint: options.endpoint }), {
      headers: {
        Authorization: `Bearer ${options.apiKey}`
      }
    });
    const timeout = setTimeout(() => {
      settle({
        ok: false,
        reason: "timeout",
        message: `Ali LiveTranslate preflight timed out after ${timeoutMs}ms.`,
        elapsedMs: elapsed()
      });
      socket.close(1000, "preflight_timeout");
    }, timeoutMs);

    socket.on("open", () => {
      socket.send(JSON.stringify(buildAliSessionUpdate(defaultSettings, "event_connectivity_check")));
    });

    socket.on("message", (raw) => {
      const event = parseAliEvent(raw);
      if (!event?.type) {
        return;
      }
      if (event.type === "error") {
        const error = asRecord(event.error);
        settle({
          ok: false,
          reason: "ali_error",
          code: asString(error?.code),
          message: asString(error?.message) || "Ali LiveTranslate returned an error.",
          elapsedMs: elapsed()
        });
        socket.close(1000, "preflight_ali_error");
        return;
      }
      if (event.type === "session.updated") {
        settle({
          ok: true,
          readyEventType: event.type,
          elapsedMs: elapsed()
        });
        socket.close(1000, "preflight_complete");
      }
    });

    socket.on("error", (error) => {
      settle({
        ok: false,
        reason: "connection_failed",
        message: error.message,
        elapsedMs: elapsed()
      });
    });

    socket.on("close", (code, reason) => {
      if (!settled) {
        settle({
          ok: false,
          reason: "connection_failed",
          message: `Ali LiveTranslate socket closed before session.updated (${code} ${reason.toString()}).`,
          elapsedMs: elapsed()
        });
      }
    });

    function settle(result: AliConnectivityCheckResult) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }

    function elapsed() {
      return Math.max(0, Date.now() - startedAt);
    }
  });
}

function parseAliEvent(raw: WebSocket.RawData): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
