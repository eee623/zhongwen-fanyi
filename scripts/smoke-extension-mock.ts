import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { extname, resolve } from "node:path";
import {
  buildChromeLaunchArgs,
  buildManualMockApiEnv,
  chromeJsonListUrl,
  createMacExtensionActionShortcutCommand,
  createExtensionAutomationBrowserInstructions,
  deriveMacAutomationAppName,
  findExtensionAutomationChromeExecutable,
  mockApiHealthUrl,
  readChromeDebugTargets,
  resolveManualMockSessionPaths,
  stageExtensionForChrome,
  type ChromeDebugTarget
} from "../apps/extension/src/manualChromeLauncher";
import {
  createContentScriptReadyExpression,
  createExtensionStartExpression,
  createExtensionSmokeSettings,
  createInjectedExtensionStartExpression,
  createInjectedExtensionStopExpression,
  createManualPagePlaybackExpression,
  describeExtensionStartRejection,
  createSubtitleProbeExpression
} from "../apps/extension/src/extensionSmoke";

interface DevtoolsTarget extends ChromeDebugTarget {
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: {
    message: string;
  };
}

const repoRoot = resolve(process.cwd());
const apiPort = readPort("EXTENSION_SMOKE_API_PORT", 8797);
const pagePort = readPort("EXTENSION_SMOKE_PAGE_PORT", 8798);
const chromeDebugPort = readPort("CHROME_DEBUG_PORT", 9335);
const profileDir = resolve(
  process.env.CHROME_PROFILE_DIR ?? `${repoRoot}/.tmp/chrome-extension-smoke-profile-${process.pid}`
);
const paths = resolveManualMockSessionPaths(repoRoot, { profileDir });
const manualPageUrl = `http://127.0.0.1:${pagePort}/html5-player.html`;
const initialPageUrl = manualPageUrl;
const backendUrl = `ws://127.0.0.1:${apiPort}/v1/live`;
const clientToken = "dev-client-token";
const expectedSubtitle = "模拟中文同传";
const expectedExtensionName = "中文同传 Dubbing";

assertExists(paths.extensionDir, "Built extension directory is missing. Run npm run build first.");
assertExists(paths.manualPageFile, "Manual HTML5 test page is missing.");
assertExists(`${repoRoot}/apps/api/dist/server.js`, "Built API server is missing. Run npm run build first.");
mkdirSync(paths.profileDir, { recursive: true });
mkdirSync(paths.dataDir, { recursive: true });

const chrome = findExtensionAutomationChromeExecutable();
if (!chrome) {
  console.error(createExtensionAutomationBrowserInstructions());
  process.exit(1);
}
const chromeAutomationAppName = process.env.CHROME_APP_NAME ?? deriveMacAutomationAppName(chrome);

async function runSmoke(): Promise<void> {
  let api: ChildProcess | undefined;
  let chromeProcess: ChildProcess | undefined;
  let pageServer: Server | undefined;
  let pageClient: CdpClient | undefined;
  let extensionClient: CdpClient | undefined;
  let stagedExtension: ReturnType<typeof stageExtensionForChrome> | undefined;

  try {
    pageServer = await startManualPageServer(pagePort);
    api = startMockApi();
    await waitForHealth(apiPort);
    stagedExtension = stageExtensionForChrome(paths.extensionDir);
    const chromePaths = {
      ...paths,
      extensionDir: stagedExtension.extensionDir
    };

    chromeProcess = spawn(
      chrome,
      buildChromeLaunchArgs(chromePaths, {
        remoteDebuggingPort: chromeDebugPort,
        openUrl: initialPageUrl,
        extraArgs: ["--disable-features=ExtensionsMenuAccessControl"]
      }),
      { stdio: "ignore" }
    );

    const { pageTarget, extensionTarget } = await waitForSmokeTargets(chromeDebugPort);
    pageClient = await CdpClient.connect(requiredWebSocketUrl(pageTarget));
    extensionClient = await CdpClient.connect(requiredWebSocketUrl(extensionTarget));
    await pageClient.navigate(manualPageUrl);
    await waitForContentScript(pageClient);

    const playback = await pageClient.evaluate(createManualPagePlaybackExpression());
    assertRuntimeValue(playback, "manual playback did not return a CDP value");

    const settings = createExtensionSmokeSettings(backendUrl);
    const popupClient = await openActionPopupClient(pageClient, extensionClient, extensionTarget, chromeDebugPort);
    const startResult = popupClient
      ? await popupClient.evaluate(createExtensionStartExpression(settings, clientToken))
      : await extensionClient.evaluate(createInjectedExtensionStartExpression(manualPageUrl, settings, clientToken));
    popupClient?.close();
    const startObject = readObject(startResult);
    const startLastError = readRuntimeLastError(startObject);
    if (startLastError) {
      throw new Error(`Extension start failed: ${JSON.stringify(startObject)}`);
    }
    const response = readRuntimeResponse(startObject);
    if (response.ok !== true) {
      throw new Error(describeExtensionStartRejection(startObject));
    }

    const subtitleProbe = await waitForSubtitle(pageClient, expectedSubtitle);
    await extensionClient.evaluate(createInjectedExtensionStopExpression(manualPageUrl));

    const latencySummary = await fetchJson(`http://127.0.0.1:${apiPort}/v1/latency/summary`, clientToken);
    console.log(
      JSON.stringify(
        {
          page: manualPageUrl,
          extension: extensionTarget.url,
          started: true,
          subtitleProbe,
          latencySummary
        },
        null,
        2
      )
    );
  } finally {
    pageClient?.close();
    extensionClient?.close();
    chromeProcess?.kill("SIGTERM");
    api?.kill("SIGTERM");
    stagedExtension?.cleanup();
    await closeServer(pageServer);
  }
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (!message.id) {
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message);
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolveConnect, rejectConnect) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolveConnect(new CdpClient(socket)));
      socket.addEventListener("error", () => rejectConnect(new Error(`CDP WebSocket failed: ${url}`)));
    });
  }

  async evaluate(expression: string, contextId?: number): Promise<unknown> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId === undefined ? {} : { contextId })
    });
    const result = readObject(response.result);
    if (result.exceptionDetails) {
      throw new Error(`CDP evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return readObject(result.result).value;
  }

  async enableRuntime(): Promise<void> {
    await this.send("Runtime.enable");
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await delay(500);
  }

  async dispatchKeyEvent(params: Record<string, unknown>): Promise<void> {
    await this.send("Input.dispatchKeyEvent", params);
  }

  close(): void {
    this.socket.close();
  }

  private send(method: string, params?: Record<string, unknown>): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }
}

function startMockApi(): ChildProcess {
  const child = spawn(process.execPath, [`${repoRoot}/apps/api/dist/server.js`], {
    cwd: repoRoot,
    env: buildManualMockApiEnv(paths, process.env, apiPort),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
  return child;
}

async function startManualPageServer(port: number): Promise<Server> {
  const html = await readFile(paths.manualPageFile);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
    if (pathname !== "/" && pathname !== "/html5-player.html") {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": contentTypeForPath(paths.manualPageFile) });
    response.end(html);
  });
  await new Promise<void>((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server;
}

async function waitForSmokeTargets(debugPort: number): Promise<{ pageTarget: DevtoolsTarget; extensionTarget: DevtoolsTarget }> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const targets = await readChromeTargets(debugPort);
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    const extensionTarget = await findSmokeExtensionTarget(targets);
    if (pageTarget && extensionTarget?.webSocketDebuggerUrl) {
      return { pageTarget, extensionTarget };
    }
    await delay(150);
  }
  throw new Error("Chrome did not expose both the manual page and extension service worker targets.");
}

async function findSmokeExtensionTarget(targets: DevtoolsTarget[]): Promise<DevtoolsTarget | undefined> {
  const candidates = targets.filter(
    (target) =>
      target.type === "service_worker" &&
      target.url?.startsWith("chrome-extension://") &&
      target.webSocketDebuggerUrl
  );

  for (const target of candidates) {
    const name = await readExtensionManifestName(target);
    if (name === expectedExtensionName) {
      return target;
    }
  }

  return undefined;
}

async function readExtensionManifestName(target: DevtoolsTarget): Promise<string | undefined> {
  if (!target.webSocketDebuggerUrl) {
    return undefined;
  }
  let client: CdpClient | undefined;
  try {
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.enableRuntime();
    const value = await client.evaluate("chrome.runtime?.getManifest?.().name ?? null");
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  } finally {
    client?.close();
  }
}

async function openActionPopupClient(
  pageClient: CdpClient,
  extensionClient: CdpClient,
  extensionTarget: DevtoolsTarget,
  debugPort: number
): Promise<CdpClient | undefined> {
  const extensionId = extensionIdFromTargetUrl(extensionTarget.url);
  if (!extensionId) {
    return undefined;
  }

  if (pressMacExtensionActionShortcut()) {
    const systemShortcutPopupTarget = await waitForExtensionPopupTarget(debugPort, extensionId, 2_500);
    if (systemShortcutPopupTarget?.webSocketDebuggerUrl) {
      return CdpClient.connect(systemShortcutPopupTarget.webSocketDebuggerUrl);
    }
    console.warn("[smoke] macOS system shortcut completed, but the extension popup target did not appear.");
  }

  await pressExtensionActionShortcut(pageClient);
  const shortcutPopupTarget = await waitForExtensionPopupTarget(debugPort, extensionId);
  if (shortcutPopupTarget?.webSocketDebuggerUrl) {
    return CdpClient.connect(shortcutPopupTarget.webSocketDebuggerUrl);
  }

  const openResult = readObject(
    await extensionClient.evaluate(
      "chrome.action.openPopup().then(() => ({ ok: true })).catch((error) => ({ ok: false, error: String(error?.message ?? error) }))"
    )
  );
  if (openResult.ok !== true) {
    return undefined;
  }

  const popupTarget = await waitForExtensionPopupTarget(debugPort, extensionId);
  return popupTarget?.webSocketDebuggerUrl ? CdpClient.connect(popupTarget.webSocketDebuggerUrl) : undefined;
}

function pressMacExtensionActionShortcut(): boolean {
  if (process.platform !== "darwin") {
    return false;
  }
  const { command, args } = createMacExtensionActionShortcutCommand({ appName: chromeAutomationAppName });
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 4_000
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status ?? "unknown"}`;
    console.warn(`[smoke] macOS system shortcut failed: ${reason}`);
    return false;
  }
  return true;
}

async function pressExtensionActionShortcut(pageClient: CdpClient): Promise<void> {
  const baseEvent = {
    windowsVirtualKeyCode: 89,
    nativeVirtualKeyCode: 89,
    code: "KeyY",
    key: "Y",
    modifiers: process.platform === "darwin" ? 12 : 10
  };
  await pageClient.dispatchKeyEvent({
    ...baseEvent,
    type: "keyDown"
  });
  await pageClient.dispatchKeyEvent({
    ...baseEvent,
    type: "keyUp"
  });
}

async function waitForExtensionPopupTarget(
  debugPort: number,
  extensionId: string,
  timeoutMs = 4_000
): Promise<DevtoolsTarget | undefined> {
  const deadline = Date.now() + timeoutMs;
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  while (Date.now() < deadline) {
    const targets = await readChromeTargets(debugPort);
    const popupTarget = targets.find((target) => target.url?.startsWith(popupUrl) && target.webSocketDebuggerUrl);
    if (popupTarget) {
      return popupTarget;
    }
    await delay(100);
  }
  return undefined;
}

function extensionIdFromTargetUrl(targetUrl: string | undefined): string | undefined {
  if (!targetUrl) {
    return undefined;
  }
  try {
    const url = new URL(targetUrl);
    return url.protocol === "chrome-extension:" ? url.hostname : undefined;
  } catch {
    return undefined;
  }
}

async function waitForSubtitle(page: CdpClient, expectedText: string): Promise<unknown> {
  const deadline = Date.now() + 12_000;
  let lastProbe: unknown;
  while (Date.now() < deadline) {
    lastProbe = await page.evaluate(createSubtitleProbeExpression(expectedText));
    const probe = readObject(lastProbe);
    if (probe.matched === true && probe.display !== "none") {
      return lastProbe;
    }
    await delay(250);
  }
  throw new Error(`Subtitle probe did not match ${expectedText}: ${JSON.stringify(lastProbe)}`);
}

async function waitForContentScript(page: CdpClient): Promise<void> {
  const deadline = Date.now() + 12_000;
  let lastState: unknown;
  while (Date.now() < deadline) {
    lastState = await page.evaluate(`({
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      hasOverlay: Boolean(document.getElementById("realtime-dubbing-subtitle"))
    })`);
    if ((await page.evaluate(createContentScriptReadyExpression())) === true) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Content script overlay did not appear on the manual page: ${JSON.stringify(lastState)}`);
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  const url = mockApiHealthUrl(port);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await delay(150);
  }
  throw new Error(`Mock API did not become healthy: ${url}`);
}

async function readChromeTargets(debugPort: number): Promise<DevtoolsTarget[]> {
  return readChromeDebugTargets(chromeJsonListUrl(debugPort)) as Promise<DevtoolsTarget[]>;
}

async function fetchJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  return response.json();
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

function requiredWebSocketUrl(target: DevtoolsTarget): string {
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`Chrome target has no CDP URL: ${target.url ?? "unknown"}`);
  }
  return target.webSocketDebuggerUrl;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRuntimeLastError(startObject: Record<string, unknown>): string | undefined {
  if (typeof startObject.lastError === "string") {
    return startObject.lastError;
  }
  const response = readObject(startObject.response);
  return typeof response.lastError === "string" ? response.lastError : undefined;
}

function readRuntimeResponse(startObject: Record<string, unknown>): Record<string, unknown> {
  const response = readObject(startObject.response);
  const forwardedResponse = readObject(response.response);
  return Object.keys(forwardedResponse).length > 0 ? forwardedResponse : response;
}

function assertRuntimeValue(value: unknown, message: string): void {
  if (!value) {
    throw new Error(message);
  }
}

function readPort(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${process.env[name]}`);
  }
  return value;
}

function contentTypeForPath(path: string): string {
  return extname(path) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
}

function assertExists(path: string, message: string): void {
  if (!existsSync(path)) {
    console.error(message);
    console.error(path);
    process.exit(1);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

await runSmoke();
