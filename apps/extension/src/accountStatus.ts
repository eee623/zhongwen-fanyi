type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type AccountPlan = "trial" | "pro" | "business";

export interface AccountStatus {
  plan: AccountPlan;
  remainingSeconds: number;
  remainingMinutes: number;
  maxConcurrentSessions: number;
  activeSessions: number;
  canStartSession: boolean;
  blockReason?: "unknown_user" | "quota_exhausted" | "concurrency_limit";
}

export type AccountStatusResult =
  | {
      ok: true;
      status: AccountStatus;
    }
  | {
      ok: false;
      error: string;
    };

export type AccountStartGate =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export function accountStartGate(status: AccountStatus | undefined): AccountStartGate {
  if (!status || status.canStartSession) {
    return { ok: true };
  }
  return {
    ok: false,
    message: accountBlockMessage(status.blockReason)
  };
}

export function accountStatusEndpointForLiveUrl(liveUrl: string): string {
  const url = new URL(liveUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "/v1/account/status";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function fetchAccountStatus(
  liveUrl: string,
  credential: string,
  fetchImpl: FetchLike = fetch
): Promise<AccountStatusResult> {
  try {
    const response = await fetchImpl(accountStatusEndpointForLiveUrl(liveUrl), {
      method: "GET",
      headers: {
        authorization: `Bearer ${credential}`
      }
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      return { ok: false, error: typeof body.error === "string" ? body.error : "账号状态读取失败" };
    }
    return { ok: true, status: normalizeAccountStatus(body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "账号状态读取失败" };
  }
}

function normalizeAccountStatus(body: Record<string, unknown>): AccountStatus {
  return {
    plan: readPlan(body.plan),
    remainingSeconds: readNumber(body.remainingSeconds),
    remainingMinutes: readNumber(body.remainingMinutes),
    maxConcurrentSessions: readNumber(body.maxConcurrentSessions),
    activeSessions: readNumber(body.activeSessions),
    canStartSession: body.canStartSession === true,
    blockReason: readBlockReason(body.blockReason)
  };
}

function readPlan(value: unknown): AccountPlan {
  return value === "trial" || value === "pro" || value === "business" ? value : "trial";
}

function readBlockReason(value: unknown): AccountStatus["blockReason"] {
  return value === "unknown_user" || value === "quota_exhausted" || value === "concurrency_limit" ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function accountBlockMessage(reason: AccountStatus["blockReason"]): string {
  return (
    {
      unknown_user: "账号未开通",
      quota_exhausted: "额度已用完",
      concurrency_limit: "并发已满"
    }[reason ?? "unknown_user"] ?? "不可启动"
  );
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
