type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface LatencyPercentiles {
  p50: number;
  p95: number;
}

export interface LatencySummary {
  count: number;
  inputToSentToAliMs?: LatencyPercentiles;
  inputToFirstTextMs?: LatencyPercentiles;
  inputToPreviewPlaybackMs?: LatencyPercentiles;
  inputToFirstAudioMs?: LatencyPercentiles;
  inputToPlaybackMs?: LatencyPercentiles;
  sentToAliToFirstTextMs?: LatencyPercentiles;
  sentToAliToFirstAudioMs?: LatencyPercentiles;
  sessionToFirstAudioMs?: LatencyPercentiles;
  translatedAudioDroppedChunks?: LatencyPercentiles;
}

export type LatencyKpiTone = "empty" | "ok" | "blocked" | "pending";

export interface LatencyKpiStatus {
  tone: LatencyKpiTone;
  title: string;
  detail: string;
}

export type LatencySummaryResult =
  | {
      ok: true;
      summary: LatencySummary;
    }
  | {
      ok: false;
      error: string;
    };

export function latencySummaryEndpointForLiveUrl(liveUrl: string): string {
  const url = new URL(liveUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "/v1/latency/summary";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function describeLatencyKpiStatus(summary: LatencySummary): LatencyKpiStatus {
  if (summary.count < 1) {
    return {
      tone: "empty",
      title: "暂无延迟样本",
      detail: "启动同传并播放一段英语音频后刷新。"
    };
  }

  const firstAudioP95 = summary.inputToFirstAudioMs?.p95;
  if (firstAudioP95 === undefined) {
    return {
      tone: "pending",
      title: "缺少原声音色译声样本",
      detail: "已记录会话，但还没有首段阿里原声音色中文音频。"
    };
  }

  const previewText = summary.inputToPreviewPlaybackMs
    ? `；预听 P95 ${Math.round(summary.inputToPreviewPlaybackMs.p95)}ms 只代表本地桥接，不代表原声音色配音。`
    : "；预听只作为本地桥接，不代表原声音色配音。";

  if (firstAudioP95 <= 1000) {
    return {
      tone: "ok",
      title: "原声音色译声达标",
      detail: `首音 P95 ${Math.round(firstAudioP95)}ms，低于 1000ms；预听仍只作为本地桥接。`
    };
  }

  return {
    tone: "blocked",
    title: "原声音色译声未达标",
    detail: `首音 P95 ${Math.round(firstAudioP95)}ms，高于 1000ms${previewText}`
  };
}

export async function fetchLatencySummary(
  liveUrl: string,
  credential: string,
  fetchImpl: FetchLike = fetch
): Promise<LatencySummaryResult> {
  try {
    const response = await fetchImpl(latencySummaryEndpointForLiveUrl(liveUrl), {
      method: "GET",
      headers: {
        authorization: `Bearer ${credential}`
      }
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      return { ok: false, error: typeof body.error === "string" ? body.error : "延迟数据读取失败" };
    }

    return { ok: true, summary: normalizeLatencySummary(body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "延迟数据读取失败" };
  }
}

function normalizeLatencySummary(body: Record<string, unknown>): LatencySummary {
  const summary: LatencySummary = {
    count: typeof body.count === "number" ? body.count : 0
  };

  assignPercentiles(summary, "inputToSentToAliMs", readPercentiles(body.inputToSentToAliMs));
  assignPercentiles(summary, "inputToFirstTextMs", readPercentiles(body.inputToFirstTextMs));
  assignPercentiles(summary, "inputToPreviewPlaybackMs", readPercentiles(body.inputToPreviewPlaybackMs));
  assignPercentiles(summary, "inputToFirstAudioMs", readPercentiles(body.inputToFirstAudioMs));
  assignPercentiles(summary, "inputToPlaybackMs", readPercentiles(body.inputToPlaybackMs));
  assignPercentiles(summary, "sentToAliToFirstTextMs", readPercentiles(body.sentToAliToFirstTextMs));
  assignPercentiles(summary, "sentToAliToFirstAudioMs", readPercentiles(body.sentToAliToFirstAudioMs));
  assignPercentiles(summary, "sessionToFirstAudioMs", readPercentiles(body.sessionToFirstAudioMs));
  assignPercentiles(summary, "translatedAudioDroppedChunks", readPercentiles(body.translatedAudioDroppedChunks));

  return summary;
}

function assignPercentiles(
  summary: LatencySummary,
  key: Exclude<keyof LatencySummary, "count">,
  value: LatencyPercentiles | undefined
) {
  if (value) {
    summary[key] = value;
  }
}

function readPercentiles(value: unknown): LatencyPercentiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.p50 !== "number" || typeof record.p95 !== "number") {
    return undefined;
  }
  return {
    p50: record.p50,
    p95: record.p95
  };
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
