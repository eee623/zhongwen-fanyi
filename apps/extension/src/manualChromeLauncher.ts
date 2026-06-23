import { pathToFileURL } from "node:url";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeForTestingPlatform } from "./chromeForTestingInstaller";

export interface ManualChromePaths {
  extensionDir: string;
  manualPageFile: string;
  profileDir: string;
}

export interface ManualMockSessionPaths extends ManualChromePaths {
  dataDir: string;
}

export type ManualAliyunSessionPaths = ManualMockSessionPaths;

export interface ChromeLaunchOptions {
  remoteDebuggingPort?: number;
  openUrl?: string;
  extraArgs?: string[];
}

export interface ManualChromePathOptions {
  profileDir?: string;
}

export interface ChromeDebugTarget {
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface StagedExtensionDirectory {
  extensionDir: string;
  cleanup(): void;
}

export interface MacExtensionActionShortcutOptions {
  appName?: string;
  keyCode?: number;
  delaySeconds?: number;
}

export interface ShellCommand {
  command: string;
  args: string[];
}

type FetchLike = (url: string) => Promise<Response>;

export function resolveManualChromePaths(repoRoot: string, options: ManualChromePathOptions = {}): ManualChromePaths {
  return {
    extensionDir: `${repoRoot}/apps/extension/.output/chrome-mv3`,
    manualPageFile: `${repoRoot}/manual-test/html5-player.html`,
    profileDir: options.profileDir ?? `${repoRoot}/.tmp/chrome-manual-profile`
  };
}

export function resolveManualMockSessionPaths(
  repoRoot: string,
  options: ManualChromePathOptions = {}
): ManualMockSessionPaths {
  return {
    extensionDir: `${repoRoot}/apps/extension/.output/chrome-mv3`,
    manualPageFile: `${repoRoot}/manual-test/html5-player.html`,
    profileDir: options.profileDir ?? `${repoRoot}/.tmp/chrome-mock-debug-profile`,
    dataDir: `${repoRoot}/.tmp/manual-mock-api`
  };
}

export function resolveManualAliyunSessionPaths(
  repoRoot: string,
  options: ManualChromePathOptions = {}
): ManualAliyunSessionPaths {
  return {
    extensionDir: `${repoRoot}/apps/extension/.output/chrome-mv3`,
    manualPageFile: `${repoRoot}/manual-test/html5-player.html`,
    profileDir: options.profileDir ?? `${repoRoot}/.tmp/chrome-aliyun-debug-profile`,
    dataDir: `${repoRoot}/.tmp/manual-aliyun-api`
  };
}

export function buildChromeLaunchArgs(paths: ManualChromePaths, options: ChromeLaunchOptions = {}): string[] {
  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${paths.profileDir}`,
    `--disable-extensions-except=${paths.extensionDir}`,
    `--load-extension=${paths.extensionDir}`,
    ...(options.extraArgs ?? []),
    options.openUrl ?? pathToFileURL(paths.manualPageFile).toString()
  ];
  if (options.remoteDebuggingPort !== undefined) {
    args.splice(3, 0, `--remote-debugging-port=${options.remoteDebuggingPort}`);
  }
  return args;
}

export function createMacExtensionActionShortcutCommand(
  options: MacExtensionActionShortcutOptions = {}
): ShellCommand {
  const appName = options.appName ?? "Google Chrome for Testing";
  const keyCode = options.keyCode ?? 16;
  const delaySeconds = options.delaySeconds ?? 0.2;
  return {
    command: "osascript",
    args: [
      "-e",
      [
        'tell application "System Events"',
        `tell process ${appleScriptString(appName)}`,
        "set frontmost to true",
        `delay ${delaySeconds}`,
        `key code ${keyCode} using {command down, shift down}`,
        "end tell",
        "end tell"
      ].join("\n")
    ]
  };
}

export function deriveMacAutomationAppName(executablePath: string | undefined): string {
  const fallback = "Google Chrome for Testing";
  if (!executablePath) {
    return fallback;
  }
  const segments = executablePath.split(/[\\/]/);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.endsWith(".app") && segment.length > ".app".length) {
      return segment.slice(0, -".app".length);
    }
  }
  return fallback;
}

export function stageExtensionForChrome(sourceDir: string, tempRoot = tmpdir()): StagedExtensionDirectory {
  const parentDir = mkdtempSync(join(tempRoot, "realtime-dubbing-extension-"));
  const extensionDir = join(parentDir, "chrome-mv3");
  cpSync(sourceDir, extensionDir, { recursive: true });
  return {
    extensionDir,
    cleanup() {
      rmSync(parentDir, { recursive: true, force: true });
    }
  };
}

export function createManualChromeInstructions(paths: ManualChromePaths): string {
  return [
    "Chrome 手测启动器已打开独立 profile。",
    "",
    "检查清单：",
    "1. 启动真实阿里后端：npm run dev:api:aliyun",
    "2. 打开 chrome://extensions，给“中文同传”开启 Allow access to file URLs。",
    `3. 回到 ${pathToFileURL(paths.manualPageFile).toString()}（manual-test/html5-player.html），点击“准备媒体 / 播放”。`,
    "4. 打开扩展 popup，选择“阿里百炼 LiveTranslate”，确认账号可启动，点击“启动”。",
    "5. 确认字幕出现、译声可听，原声音量/译声音量滑块能改变混音。",
    "6. 切换全屏、刷新页面、停止会话，确认不会残留字幕或继续播放译声。"
  ].join("\n");
}

export function createExtensionAutomationBrowserInstructions(): string {
  return [
    "Automated extension smoke needs Chrome for Testing or Chromium.",
    "Branded Google Chrome 137+ no longer supports loading unpacked extensions with --load-extension.",
    "Install Chrome for Testing or Chromium, then set CHROME_FOR_TESTING=/path/to/browser or CHROMIUM_PATH=/path/to/browser.",
    "For ordinary manual verification, npm run manual:mock can still open regular Chrome and you can load the extension from chrome://extensions."
  ].join(" ");
}

export function buildManualMockApiEnv(
  paths: ManualMockSessionPaths,
  baseEnv: NodeJS.ProcessEnv,
  port = 8787
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PORT: String(port),
    LIVE_TRANSLATE_MODE: "mock",
    DEV_CLIENT_TOKEN: "dev-client-token",
    DEV_USER_ID: "user_1",
    CLIENT_TOKEN_SECRET: "local-manual-client-token-secret",
    BILLING_STORE_FILE: `${paths.dataDir}/billing.json`,
    PAYMENT_LEDGER_FILE: `${paths.dataDir}/payment-ledger.json`
  };
}

export function buildManualAliyunApiEnv(
  paths: ManualAliyunSessionPaths,
  baseEnv: NodeJS.ProcessEnv,
  port = 8787
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PORT: String(port),
    LIVE_TRANSLATE_MODE: "aliyun",
    DEV_CLIENT_TOKEN: "dev-client-token",
    DEV_USER_ID: "user_1",
    CLIENT_TOKEN_SECRET: "local-manual-client-token-secret",
    BILLING_STORE_FILE: `${paths.dataDir}/billing.json`,
    PAYMENT_LEDGER_FILE: `${paths.dataDir}/payment-ledger.json`
  };
}

export function mockApiHealthUrl(port = 8787): string {
  return `http://127.0.0.1:${port}/healthz`;
}

export function chromeJsonListUrl(port = 9222): string {
  return `http://127.0.0.1:${port}/json/list`;
}

export async function readChromeDebugTargets(
  url: string,
  fetchImpl: FetchLike = fetch
): Promise<ChromeDebugTarget[]> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return [];
    }
    const targets = (await response.json()) as Array<Record<string, unknown>>;
    return targets.map((item) => ({
      type: typeof item.type === "string" ? item.type : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      url: typeof item.url === "string" ? item.url : undefined,
      webSocketDebuggerUrl: typeof item.webSocketDebuggerUrl === "string" ? item.webSocketDebuggerUrl : undefined
    }));
  } catch {
    return [];
  }
}

export function findManualPageTarget(
  targets: ChromeDebugTarget[],
  paths: Pick<ManualChromePaths, "manualPageFile">
): ChromeDebugTarget | undefined {
  const manualPageUrl = pathToFileURL(paths.manualPageFile).toString();
  return targets.find((target) => target.type === "page" && target.url === manualPageUrl);
}

export function findExtensionTarget(targets: ChromeDebugTarget[]): ChromeDebugTarget | undefined {
  const extensionWorkers = targets.filter(
    (target) => target.type === "service_worker" && target.url?.startsWith("chrome-extension://")
  );
  return (
    extensionWorkers.find((target) => target.title === "中文同传 Dubbing") ??
    extensionWorkers.find((target) => target.url?.endsWith("/background.js"))
  );
}

export function createManualTargetEvidence(target: ChromeDebugTarget | undefined): string {
  if (!target) {
    return "Chrome target check: manual HTML5 player tab was not found.";
  }
  return `Chrome target check: found "${target.title ?? "untitled"}" at ${target.url ?? "unknown URL"}.`;
}

export function createExtensionTargetEvidence(target: ChromeDebugTarget | undefined): string {
  if (!target) {
    return [
      "Chrome extension check: extension service worker was not found.",
      "Close any old manual Chrome window, or rerun with a fresh CHROME_DEBUG_PORT and CHROME_PROFILE_DIR."
    ].join(" ");
  }
  return `Chrome extension check: found "${target.title ?? "untitled"}" at ${target.url ?? "unknown URL"}.`;
}

export function createManualSessionTargetEvidence(
  targets: ChromeDebugTarget[],
  paths: Pick<ManualChromePaths, "manualPageFile">
): string {
  return [
    createManualTargetEvidence(findManualPageTarget(targets, paths)),
    createExtensionTargetEvidence(findExtensionTarget(targets))
  ].join("\n");
}

export function createManualMockInstructions(paths: ManualMockSessionPaths, port = 8787): string {
  return [
    "Mock API 已启动，Chrome 手测 profile 已打开。",
    "",
    "会话信息：",
    `- Mock API: ${mockApiHealthUrl(port)}`,
    `- Backend URL: ws://localhost:${port}/v1/live`,
    "- 开发凭据: dev-client-token",
    `- 测试页: ${pathToFileURL(paths.manualPageFile).toString()}`,
    "",
    "检查清单：",
    "1. 打开 chrome://extensions，给“中文同传”开启 Allow access to file URLs。",
    "2. 回到 manual-test/html5-player.html，点击“准备媒体 / 播放”。",
    "3. 打开扩展 popup，选择“开发模拟服务”，确认账号可启动，点击“启动”。",
    "4. 确认字幕出现、译声可听，原声音量/译声音量滑块能改变混音。",
    "5. 切换全屏、刷新页面、停止会话，确认不会残留字幕或继续播放译声。",
    "",
    "按 Ctrl+C 会关闭 Mock API；Chrome 窗口可手动关闭。"
  ].join("\n");
}

export function createManualAliyunInstructions(paths: ManualAliyunSessionPaths, port = 8787): string {
  return [
    "真实阿里 API 已预检并启动，Chrome 手测 profile 已打开。",
    "",
    "会话信息：",
    `- API: ${mockApiHealthUrl(port)}`,
    `- Backend URL: ws://localhost:${port}/v1/live`,
    "- 开发凭据: dev-client-token",
    `- 测试页: ${pathToFileURL(paths.manualPageFile).toString()}`,
    "",
    "检查清单：",
    "1. 如果 Chrome extension check 没找到“中文同传 Dubbing”，打开 chrome://extensions 手动加载 apps/extension/.output/chrome-mv3。",
    "2. 给“中文同传”开启 Allow access to file URLs。",
    "3. 回到 manual-test/html5-player.html，点击“准备媒体 / 播放”。",
    "4. 打开扩展 popup，选择“阿里百炼 LiveTranslate”，确认账号可启动，点击“启动”。",
    "5. 确认中文字幕出现、中文译声可听，并注意原声/译声混音。",
    "6. 点击“延迟诊断 / 刷新”，记录首文本、首译声和实际播放延迟。",
    "",
    "按 Ctrl+C 会关闭真实阿里 API；Chrome 窗口可手动关闭。"
  ].join("\n");
}

export function createManualAliyunHelpText(): string {
  return [
    "Usage: npm run manual:aliyun",
    "",
    "Starts a real Aliyun LiveTranslate manual Chrome verification session.",
    "Required: DASHSCOPE_API_KEY in .env.",
    "Optional: ALI_LIVE_TRANSLATE_ENDPOINT, PORT, CHROME_DEBUG_PORT, CHROME_PROFILE_DIR.",
    "",
    "The launcher runs Aliyun session preflight before starting the local API and Chrome."
  ].join("\n");
}

export function findChromeExecutable(platform = process.platform, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium"
        ]
      : platform === "win32"
        ? [
            `${env.PROGRAMFILES ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
            `${env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`
          ]
        : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    const result = spawnSync("command", ["-v", candidate], {
      shell: true,
      encoding: "utf8"
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  return undefined;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function extensionAutomationChromeCandidates(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const explicit = [env.CHROME_FOR_TESTING, env.CHROMIUM_PATH].filter((candidate): candidate is string =>
    Boolean(candidate?.trim())
  );
  if (platform === "darwin") {
    return [
      ...explicit,
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
  }
  if (platform === "win32") {
    return [
      ...explicit,
      `${env.LOCALAPPDATA ?? "C:\\Users\\Default\\AppData\\Local"}\\Google\\Chrome for Testing\\Application\\chrome.exe`,
      `${env.PROGRAMFILES ?? "C:\\Program Files"}\\Chromium\\Application\\chrome.exe`
    ];
  }
  return [...explicit, "chrome-for-testing", "chromium", "chromium-browser"];
}

export function manualExtensionChromeCandidates(
  repoRoot: string,
  platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return uniqueStrings([
    ...extensionAutomationChromeCandidates(platform, env).slice(0, 2),
    ...repoChromeForTestingCandidates(repoRoot, platform, arch),
    ...extensionAutomationChromeCandidates(platform, env).slice(2)
  ]);
}

export function findExtensionAutomationChromeExecutable(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const candidate of extensionAutomationChromeCandidates(platform, env)) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    const result = spawnSync("command", ["-v", candidate], {
      shell: true,
      encoding: "utf8"
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  return undefined;
}

export function findManualExtensionChromeExecutable(
  repoRoot: string,
  platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const candidate of manualExtensionChromeCandidates(repoRoot, platform, arch, env)) {
    const executable = resolveExecutableCandidate(candidate);
    if (executable) {
      return executable;
    }
  }
  return undefined;
}

function repoChromeForTestingCandidates(repoRoot: string, platform: NodeJS.Platform, arch: NodeJS.Architecture): string[] {
  let cftPlatform: string;
  try {
    cftPlatform = chromeForTestingPlatform(platform, arch);
  } catch {
    return [];
  }
  const installRoot = join(repoRoot, ".tmp", "chrome-for-testing");
  if (cftPlatform === "mac-arm64" || cftPlatform === "mac-x64") {
    return [
      join(
        installRoot,
        "chrome",
        cftPlatform,
        `chrome-${cftPlatform}`,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      join(
        installRoot,
        "chrome",
        `chrome-${cftPlatform}`,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    ];
  }
  if (cftPlatform === "linux64") {
    return [
      join(installRoot, "chrome", cftPlatform, "chrome-linux64", "chrome"),
      join(installRoot, "chrome", "chrome-linux64", "chrome")
    ];
  }
  if (cftPlatform === "win32" || cftPlatform === "win64") {
    return [
      join(installRoot, "chrome", cftPlatform, `chrome-${cftPlatform}`, "chrome.exe"),
      join(installRoot, "chrome", `chrome-${cftPlatform}`, "chrome.exe")
    ];
  }
  return [];
}

function resolveExecutableCandidate(candidate: string): string | undefined {
  if (candidate.includes("/") || candidate.includes("\\")) {
    return existsSync(candidate) ? candidate : undefined;
  }
  const result = spawnSync("command", ["-v", candidate], {
    shell: true,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
