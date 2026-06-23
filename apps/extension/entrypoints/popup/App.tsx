import { useEffect, useMemo, useState } from "react";
import { Captions, Crown, ExternalLink, Play, RefreshCw, Save, Settings, Square, Volume2, Waves } from "lucide-react";
import {
  defaultSettings,
  normalizeSettings,
  type ExtensionSettings,
  type VoiceCloneFrequency
} from "@realtime-dubbing/shared";
import { accountStartGate, fetchAccountStatus, type AccountStatus } from "../../src/accountStatus";
import { captureConsentText } from "../../src/captureConsent";
import { resolveSessionCredential } from "../../src/clientAuth";
import {
  describeLatencyKpiStatus,
  fetchLatencySummary,
  type LatencySummary,
  type LatencyPercentiles
} from "../../src/diagnostics";
import type { FileAccessStatus } from "../../src/fileAccess";
import type { RuntimeResponse, RuntimeStatus } from "../../src/messages";
import { checkoutUrlFromPaymentOrder, createPaymentOrder, paymentOrderNotice } from "../../src/paymentOrders";
import { loadClientToken, loadSettings, saveClientToken, saveSettings } from "../../src/storage";

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [clientToken, setClientToken] = useState("dev-client-token");
  const [status, setStatus] = useState<RuntimeStatus>({ running: false });
  const [accountStatus, setAccountStatus] = useState<AccountStatus | undefined>();
  const [accountLoading, setAccountLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [latencySummary, setLatencySummary] = useState<LatencySummary>({ count: 0 });
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [fileAccessStatus, setFileAccessStatus] = useState<FileAccessStatus | undefined>();
  const [fileAccessLoading, setFileAccessLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.all([loadSettings(), loadClientToken(), getStatus()]).then(([loadedSettings, token, runtimeStatus]) => {
      setSettings(loadedSettings);
      setClientToken(token);
      setStatus(runtimeStatus);
      void refreshAccountStatus(loadedSettings, token, false);
      void refreshFileAccess(false);
    });
  }, []);

  const normalized = useMemo(() => normalizeSettings(settings), [settings]);
  const latencyKpiStatus = useMemo(() => describeLatencyKpiStatus(latencySummary), [latencySummary]);
  const startGate = accountStartGate(accountStatus);
  const fileAccessBlocked = fileAccessStatus?.ok === false;
  const startDisabled = !status.running && (accountLoading || fileAccessLoading || !startGate.ok || fileAccessBlocked);

  async function persistSettings() {
    await saveSettings(normalized);
    await saveClientToken(clientToken);
    if (status.running) {
      const response = await sendPopupMessage({
        type: "popup.update-settings",
        settings: normalized
      });
      if (!response.ok) {
        setNotice(response.error ?? "设置同步失败");
        return;
      }
    }
    setNotice("已保存");
    setTimeout(() => setNotice(""), 1200);
  }

  async function toggleSession() {
    await persistSettings();
    if (status.running) {
      const response = await sendPopupMessage({ type: "popup.stop" });
      setStatus(response.status ?? { running: false });
      return;
    }

    const preflightStatus = await refreshAccountStatus(normalized, clientToken, false);
    if (!preflightStatus) {
      setNotice("账号状态读取失败");
      return;
    }
    const preflightGate = accountStartGate(preflightStatus);
    if (!preflightGate.ok) {
      setNotice(preflightGate.message);
      return;
    }

    const fileAccessPreflight = await refreshFileAccess(false);
    if (fileAccessPreflight && !fileAccessPreflight.ok) {
      setNotice(`${fileAccessPreflight.message}: ${fileAccessPreflight.manageUrl}`);
      return;
    }

    const credential = await resolveSessionCredential(normalized.backendUrl, clientToken);
    if (!credential.ok) {
      setNotice(credential.error);
      return;
    }

    const response = await sendPopupMessage({
      type: "popup.start",
      settings: normalized,
      clientToken: credential.credential
    });
    if (!response.ok) {
      setNotice(response.error ?? "启动失败");
      return;
    }
    setStatus(response.status ?? { running: true });
  }

  async function refreshAccountStatus(
    sourceSettings: ExtensionSettings = normalized,
    sourceCredential: string = clientToken,
    showNotice = true
  ): Promise<AccountStatus | undefined> {
    setAccountLoading(true);
    try {
      const credential = await resolveSessionCredential(sourceSettings.backendUrl, sourceCredential);
      if (!credential.ok) {
        if (showNotice) {
          setNotice(credential.error);
        }
        return undefined;
      }

      const result = await fetchAccountStatus(sourceSettings.backendUrl, credential.credential);
      if (!result.ok) {
        if (showNotice) {
          setNotice(result.error);
        }
        return undefined;
      }

      setAccountStatus(result.status);
      if (showNotice) {
        setNotice("账号已刷新");
        setTimeout(() => setNotice(""), 1200);
      }
      return result.status;
    } finally {
      setAccountLoading(false);
    }
  }

  async function refreshDiagnostics() {
    setDiagnosticsLoading(true);
    try {
      const credential = await resolveSessionCredential(normalized.backendUrl, clientToken);
      if (!credential.ok) {
        setNotice(credential.error);
        return;
      }

      const result = await fetchLatencySummary(normalized.backendUrl, credential.credential);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }

      setLatencySummary(result.summary);
      setNotice("延迟已刷新");
      setTimeout(() => setNotice(""), 1200);
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function createSubscriptionOrder() {
    setPaymentLoading(true);
    try {
      await saveSettings(normalized);
      await saveClientToken(clientToken);
      const credential = await resolveSessionCredential(normalized.backendUrl, clientToken);
      if (!credential.ok) {
        setNotice(credential.error);
        return;
      }

      const result = await createPaymentOrder(normalized.backendUrl, credential.credential, {
        provider: "alipay",
        packageId: "pro_20m_cny_39"
      });
      if (!result.ok) {
        setNotice(result.error);
        return;
      }

      const orderNotice = paymentOrderNotice(result.order);
      const checkoutUrl = checkoutUrlFromPaymentOrder(result.order);
      if (checkoutUrl) {
        const openResponse = await sendPopupMessage({ type: "popup.open-url", url: checkoutUrl });
        setNotice(openResponse.ok ? `${orderNotice}，已打开收银台` : `${orderNotice}，收银台打开失败`);
      } else {
        setNotice(orderNotice);
      }
      void refreshAccountStatus(normalized, clientToken, false);
    } finally {
      setPaymentLoading(false);
    }
  }

  async function refreshFileAccess(showNotice = true): Promise<FileAccessStatus | undefined> {
    setFileAccessLoading(true);
    try {
      const response = await sendPopupMessage({ type: "popup.get-file-access-status" });
      if (!response.ok || !response.fileAccess) {
        if (showNotice) {
          setNotice(response.error ?? "本地文件权限读取失败");
        }
        return undefined;
      }

      setFileAccessStatus(response.fileAccess);
      if (showNotice) {
        setNotice("本地文件权限已刷新");
        setTimeout(() => setNotice(""), 1200);
      }
      return response.fileAccess;
    } finally {
      setFileAccessLoading(false);
    }
  }

  async function openExtensionDetails() {
    const url = fileAccessStatus?.manageUrl ?? "chrome://extensions/";
    const response = await sendPopupMessage({ type: "popup.open-extension-details", url });
    if (!response.ok) {
      setNotice(response.error ?? url);
    }
  }

  return (
    <main className="panel">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">
            <Play size={16} fill="currentColor" />
          </div>
          <div>
            <h1>中文同传</h1>
            <span>v0.1.0</span>
          </div>
        </div>
        <button
          className="membership"
          type="button"
          title="创建支付宝订单"
          onClick={() => void createSubscriptionOrder()}
          disabled={paymentLoading}
        >
          <Crown size={15} />
          {paymentLoading ? "创建中" : "订阅"}
        </button>
        <button className="icon-button" type="button" title="设置">
          <Settings size={18} />
        </button>
      </header>

      <section className="language-row" aria-label="语言">
        <select value={settings.sourceLanguage} onChange={(event) => update({ sourceLanguage: event.target.value as "en" })}>
          <option value="en">美国(英语)</option>
        </select>
        <span className="arrow">→</span>
        <select value={settings.targetLanguage} onChange={(event) => update({ targetLanguage: event.target.value as "zh" })}>
          <option value="zh">中国</option>
        </select>
      </section>

      <Section title="翻译服务">
        <select
          className="full-select"
          value={settings.provider}
          onChange={(event) => update({ provider: event.target.value as ExtensionSettings["provider"] })}
        >
          <option value="aliyun-live-translate">阿里百炼 LiveTranslate</option>
          <option value="mock-live-translate">开发模拟服务</option>
        </select>
      </Section>

      <Section title="声音与字幕">
        <div className="segmented">
          <TogglePill enabled={settings.dubbingEnabled} onClick={() => update({ dubbingEnabled: !settings.dubbingEnabled })}>
            <Waves size={15} />
            配音
          </TogglePill>
          <TogglePill
            enabled={settings.subtitlesEnabled}
            onClick={() => update({ subtitlesEnabled: !settings.subtitlesEnabled })}
          >
            <Captions size={15} />
            字幕
          </TogglePill>
        </div>
        <div className="mode-row">
          <span>声纹</span>
          <div className="segmented">
            <TogglePill
              enabled={settings.voiceCloneFrequency === "always"}
              onClick={() => update({ voiceCloneFrequency: "always" })}
            >
              多人跟随
            </TogglePill>
            <TogglePill
              enabled={settings.voiceCloneFrequency === "once"}
              onClick={() => update({ voiceCloneFrequency: "once" })}
            >
              单人低延迟
            </TogglePill>
          </div>
        </div>
        <Switch
          label="极速预听"
          checked={settings.lowLatencyPreviewEnabled}
          onChange={(checked) => update({ lowLatencyPreviewEnabled: checked })}
        />
        <Slider
          label="原声"
          value={settings.originalVolume}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update({ originalVolume: value })}
        />
        <Slider
          label="译声"
          value={settings.translatedVolume}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => update({ translatedVolume: value })}
        />
        <div className="toggle-grid">
          <Switch
            label="悬浮球"
            checked={settings.floatingSubtitles}
            onChange={(checked) => update({ floatingSubtitles: checked })}
          />
          <Switch
            label="全屏字幕"
            checked={settings.fullscreenSubtitles}
            onChange={(checked) => update({ fullscreenSubtitles: checked })}
          />
        </div>
        <Slider
          label="大小"
          value={settings.subtitleSize}
          min={14}
          max={40}
          step={1}
          onChange={(value) => update({ subtitleSize: value })}
        />
      </Section>

      <Section title="本地文件">
        <div className={fileAccessBlocked ? "local-file-banner blocked" : "local-file-banner"}>
          {fileAccessMessage(fileAccessStatus)}
        </div>
        {fileAccessBlocked ? <div className="local-file-url">{fileAccessStatus.manageUrl}</div> : null}
        <div className="local-file-actions">
          <button className="diagnostics-button" type="button" onClick={() => void refreshFileAccess()} disabled={fileAccessLoading}>
            <RefreshCw size={14} />
            检查
          </button>
          <button className="diagnostics-button" type="button" onClick={() => void openExtensionDetails()}>
            <ExternalLink size={14} />
            详情
          </button>
        </div>
      </Section>

      <Section title="账号">
        <input
          className="token-input"
          value={clientToken}
          onChange={(event) => setClientToken(event.target.value)}
          placeholder="账号/开发凭据"
        />
        <input
          className="token-input"
          value={settings.backendUrl}
          onChange={(event) => update({ backendUrl: event.target.value })}
          placeholder="ws://localhost:8787/v1/live"
        />
        <div className="account-head">
          <span>{accountStatus ? planLabel(accountStatus.plan) : "未读取"}</span>
          <button
            className="diagnostics-button"
            type="button"
            onClick={() => void refreshAccountStatus()}
            disabled={accountLoading}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
        <div className="account-grid">
          <StatusMetric label="剩余" value={accountStatus ? `${accountStatus.remainingMinutes} 分钟` : "--"} />
          <StatusMetric
            label="并发"
            value={accountStatus ? `${accountStatus.activeSessions}/${accountStatus.maxConcurrentSessions}` : "--"}
          />
        </div>
        <div className={accountStatus?.canStartSession === false ? "account-banner blocked" : "account-banner"}>
          {accountStatus ? accountMessage(accountStatus) : "待同步"}
        </div>
      </Section>

      <Section title="延迟诊断">
        <div className="diagnostics-head">
          <span>样本 {latencySummary.count}</span>
          <button className="diagnostics-button" type="button" onClick={refreshDiagnostics} disabled={diagnosticsLoading}>
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
        <div className={`latency-kpi ${latencyKpiStatus.tone}`}>
          <strong>{latencyKpiStatus.title}</strong>
          <span>{latencyKpiStatus.detail}</span>
        </div>
        <div className="metrics-grid">
          <LatencyMetric label="转发" value={latencySummary.inputToSentToAliMs} />
          <LatencyMetric label="首字" value={latencySummary.inputToFirstTextMs} />
          <LatencyMetric label="预听" value={latencySummary.inputToPreviewPlaybackMs} />
          <LatencyMetric label="首音" value={latencySummary.inputToFirstAudioMs} />
          <LatencyMetric label="模型音" value={latencySummary.sentToAliToFirstAudioMs} />
          <LatencyMetric label="播放" value={latencySummary.inputToPlaybackMs} />
          <LatencyMetric label="会话" value={latencySummary.sessionToFirstAudioMs} />
          <CountMetric label="丢块" value={latencySummary.translatedAudioDroppedChunks} />
        </div>
      </Section>

      <div className="capture-consent">{captureConsentText()}</div>

      <footer className="actions">
        <button className="save-button" type="button" onClick={persistSettings}>
          <Save size={16} />
          保存设置
        </button>
        <button
          className={status.running ? "stop-button" : "start-button"}
          type="button"
          onClick={toggleSession}
          disabled={startDisabled}
          title={fileAccessBlocked ? fileAccessStatus.message : !startGate.ok ? startGate.message : undefined}
        >
          {status.running ? <Square size={16} fill="currentColor" /> : <Volume2 size={16} />}
          {status.running ? "停止" : "启动"}
        </button>
      </footer>
      <div className="status-line">{notice || status.lastError || (status.running ? "运行中" : "待机")}</div>
    </main>
  );

  function update(patch: Partial<ExtensionSettings> & { voiceCloneFrequency?: VoiceCloneFrequency }) {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  }
}

function LatencyMetric({ label, value }: { label: string; value?: LatencyPercentiles }) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong>{formatPercentiles(value)}</strong>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CountMetric({ label, value }: { label: string; value?: LatencyPercentiles }) {
  return (
    <div className="metric-cell">
      <span>{label}</span>
      <strong>{formatPercentileCount(value)}</strong>
    </div>
  );
}

function formatPercentiles(value?: LatencyPercentiles): string {
  return value ? `${Math.round(value.p50)}/${Math.round(value.p95)}ms` : "--";
}

function formatPercentileCount(value?: LatencyPercentiles): string {
  return value ? `${Math.round(value.p50)}/${Math.round(value.p95)}` : "--";
}

function planLabel(plan: AccountStatus["plan"]): string {
  return {
    trial: "试用版",
    pro: "专业版",
    business: "商业版"
  }[plan];
}

function accountMessage(status: AccountStatus): string {
  if (status.canStartSession) {
    return "可启动";
  }
  return (
    {
      unknown_user: "账号未开通",
      quota_exhausted: "额度已用完",
      concurrency_limit: "并发已满"
    }[status.blockReason ?? "unknown_user"] ?? "不可启动"
  );
}

function fileAccessMessage(status: FileAccessStatus | undefined): string {
  if (!status) {
    return "未检查";
  }
  if (!status.isFilePage) {
    return "当前标签页不是本地文件";
  }
  return status.ok ? "本地文件访问已允许" : (status.message ?? "本地文件访问未开启");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="section-body">{children}</div>
    </section>
  );
}

function TogglePill({ enabled, onClick, children }: { enabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={enabled ? "pill active" : "pill"} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Switch({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

async function sendPopupMessage(message: unknown): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}

async function getStatus(): Promise<RuntimeStatus> {
  const response = await sendPopupMessage({ type: "popup.get-status" });
  return response.status ?? { running: false };
}
