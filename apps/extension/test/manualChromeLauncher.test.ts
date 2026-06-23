import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildChromeLaunchArgs,
  buildManualAliyunApiEnv,
  buildManualMockApiEnv,
  chromeJsonListUrl,
  createMacExtensionActionShortcutCommand,
  createManualAliyunInstructions,
  createManualAliyunHelpText,
  createManualChromeInstructions,
  createManualMockInstructions,
  createExtensionAutomationBrowserInstructions,
  extensionAutomationChromeCandidates,
  manualExtensionChromeCandidates,
  deriveMacAutomationAppName,
  createManualSessionTargetEvidence,
  createManualTargetEvidence,
  createExtensionTargetEvidence,
  findExtensionAutomationChromeExecutable,
  findManualExtensionChromeExecutable,
  findExtensionTarget,
  findManualPageTarget,
  mockApiHealthUrl,
  readChromeDebugTargets,
  resolveManualMockSessionPaths,
  resolveManualAliyunSessionPaths,
  resolveManualChromePaths,
  stageExtensionForChrome
} from "../src/manualChromeLauncher";

describe("manual Chrome launcher", () => {
  it("resolves the built extension, isolated Chrome profile, and local HTML5 test page paths", () => {
    expect(resolveManualChromePaths("/repo")).toEqual({
      extensionDir: "/repo/apps/extension/.output/chrome-mv3",
      manualPageFile: "/repo/manual-test/html5-player.html",
      profileDir: "/repo/.tmp/chrome-manual-profile"
    });
  });

  it("builds Chrome arguments that load only this extension and open the local video page", () => {
    const paths = resolveManualChromePaths("/repo");

    expect(buildChromeLaunchArgs(paths)).toEqual([
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      "--user-data-dir=/repo/.tmp/chrome-manual-profile",
      "--disable-extensions-except=/repo/apps/extension/.output/chrome-mv3",
      "--load-extension=/repo/apps/extension/.output/chrome-mv3",
      "file:///repo/manual-test/html5-player.html"
    ]);
  });

  it("builds a macOS system shortcut command for the extension action popup", () => {
    expect(createMacExtensionActionShortcutCommand()).toEqual({
      command: "osascript",
      args: [
        "-e",
        [
          'tell application "System Events"',
          'tell process "Google Chrome for Testing"',
          "set frontmost to true",
          "delay 0.2",
          "key code 16 using {command down, shift down}",
          "end tell",
          "end tell"
        ].join("\n")
      ]
    });
  });

  it("escapes macOS shortcut AppleScript strings", () => {
    expect(createMacExtensionActionShortcutCommand({ appName: 'Chrome "Canary"', keyCode: 42 })).toMatchObject({
      args: expect.arrayContaining([
        expect.stringContaining('tell process "Chrome \\"Canary\\""'),
        expect.stringContaining("key code 42 using {command down, shift down}")
      ])
    });
  });

  it("derives the macOS app name from Chrome for Testing and Chromium executable paths", () => {
    expect(
      deriveMacAutomationAppName(
        "/tmp/chrome/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      )
    ).toBe("Google Chrome for Testing");
    expect(deriveMacAutomationAppName("/Applications/Chromium.app/Contents/MacOS/Chromium")).toBe("Chromium");
    expect(deriveMacAutomationAppName("/usr/bin/chromium-browser")).toBe("Google Chrome for Testing");
  });

  it("can enable a local Chrome DevTools probe for manual session evidence", () => {
    const paths = resolveManualChromePaths("/repo");

    expect(buildChromeLaunchArgs(paths, { remoteDebuggingPort: 9222 })).toContain("--remote-debugging-port=9222");
    expect(chromeJsonListUrl(9222)).toBe("http://127.0.0.1:9222/json/list");
  });

  it("reads Chrome debug targets defensively while DevTools is still starting", async () => {
    await expect(
      readChromeDebugTargets("http://127.0.0.1:9335/json/list", async () => {
        throw new Error("ECONNREFUSED");
      })
    ).resolves.toEqual([]);
  });

  it("normalizes Chrome debug target records", async () => {
    const targets = await readChromeDebugTargets("http://127.0.0.1:9335/json/list", async () => {
      return new Response(
        JSON.stringify([
          {
            type: "service_worker",
            title: "中文同传 Dubbing",
            url: "chrome-extension://abc/service_worker.js",
            webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/1"
          }
        ]),
        { status: 200 }
      );
    });

    expect(targets).toEqual([
      {
        type: "service_worker",
        title: "中文同传 Dubbing",
        url: "chrome-extension://abc/service_worker.js",
        webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/1"
      }
    ]);
  });

  it("can open an HTTP manual page for automated extension smoke checks", () => {
    const paths = resolveManualChromePaths("/repo");

    expect(buildChromeLaunchArgs(paths, { openUrl: "http://127.0.0.1:8798/html5-player.html" }).at(-1)).toBe(
      "http://127.0.0.1:8798/html5-player.html"
    );
  });

  it("can append extra Chrome flags before the opened URL", () => {
    const paths = resolveManualChromePaths("/repo");

    expect(buildChromeLaunchArgs(paths, { extraArgs: ["--disable-features=ExtensionsMenuAccessControl"] })).toContain(
      "--disable-features=ExtensionsMenuAccessControl"
    );
    expect(buildChromeLaunchArgs(paths, { extraArgs: ["--flag"] }).at(-1)).toBe(
      "file:///repo/manual-test/html5-player.html"
    );
  });

  it("prints the checks needed to complete a real tabCapture smoke run", () => {
    const instructions = createManualChromeInstructions(resolveManualChromePaths("/repo"));

    expect(instructions).toContain("npm run dev:api:aliyun");
    expect(instructions).toContain("Allow access to file URLs");
    expect(instructions).toContain("manual-test/html5-player.html");
    expect(instructions).toContain("阿里百炼 LiveTranslate");
    expect(instructions).toContain("字幕");
    expect(instructions).toContain("译声");
  });

  it("resolves isolated paths and API storage for a one-command mock manual session", () => {
    expect(resolveManualMockSessionPaths("/repo")).toEqual({
      extensionDir: "/repo/apps/extension/.output/chrome-mv3",
      manualPageFile: "/repo/manual-test/html5-player.html",
      profileDir: "/repo/.tmp/chrome-mock-debug-profile",
      dataDir: "/repo/.tmp/manual-mock-api"
    });
  });

  it("resolves isolated paths and API storage for a one-command Aliyun manual session", () => {
    expect(resolveManualAliyunSessionPaths("/repo")).toEqual({
      extensionDir: "/repo/apps/extension/.output/chrome-mv3",
      manualPageFile: "/repo/manual-test/html5-player.html",
      profileDir: "/repo/.tmp/chrome-aliyun-debug-profile",
      dataDir: "/repo/.tmp/manual-aliyun-api"
    });
  });

  it("allows manual sessions to use an explicit Chrome profile directory", () => {
    expect(resolveManualMockSessionPaths("/repo", { profileDir: "/repo/.tmp/fresh-profile" })).toMatchObject({
      profileDir: "/repo/.tmp/fresh-profile",
      dataDir: "/repo/.tmp/manual-mock-api"
    });
  });

  it("stages the built extension into a temporary Chrome-loadable directory", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "realtime-dubbing-stage-test-"));
    try {
      const sourceDir = join(tempRoot, "source");
      mkdirSync(join(sourceDir, "icons"), { recursive: true });
      writeFileSync(join(sourceDir, "manifest.json"), "{\"manifest_version\":3}");
      writeFileSync(join(sourceDir, "icons", "icon-16.png"), "icon");

      const staged = stageExtensionForChrome(sourceDir, tempRoot);

      expect(staged.extensionDir).toContain(tempRoot);
      expect(staged.extensionDir).not.toBe(sourceDir);
      expect(readFileSync(join(staged.extensionDir, "manifest.json"), "utf8")).toBe("{\"manifest_version\":3}");
      expect(readFileSync(join(staged.extensionDir, "icons", "icon-16.png"), "utf8")).toBe("icon");
      staged.cleanup();
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("builds a mock API environment with persistent local billing files", () => {
    const paths = resolveManualMockSessionPaths("/repo");

    expect(buildManualMockApiEnv(paths, { PATH: "/bin", HOME: "/Users/test" }, 9797)).toMatchObject({
      PATH: "/bin",
      HOME: "/Users/test",
      PORT: "9797",
      LIVE_TRANSLATE_MODE: "mock",
      DEV_CLIENT_TOKEN: "dev-client-token",
      DEV_USER_ID: "user_1",
      CLIENT_TOKEN_SECRET: "local-manual-client-token-secret",
      BILLING_STORE_FILE: "/repo/.tmp/manual-mock-api/billing.json",
      PAYMENT_LEDGER_FILE: "/repo/.tmp/manual-mock-api/payment-ledger.json"
    });
  });

  it("builds a real Aliyun API environment for manual extension verification", () => {
    const paths = resolveManualAliyunSessionPaths("/repo");

    expect(
      buildManualAliyunApiEnv(
        paths,
        {
          PATH: "/bin",
          HOME: "/Users/test",
          DASHSCOPE_API_KEY: "sk-test",
          ALI_LIVE_TRANSLATE_ENDPOINT: "wss://dashscope.example/realtime"
        },
        9798
      )
    ).toMatchObject({
      PATH: "/bin",
      HOME: "/Users/test",
      PORT: "9798",
      LIVE_TRANSLATE_MODE: "aliyun",
      DASHSCOPE_API_KEY: "sk-test",
      ALI_LIVE_TRANSLATE_ENDPOINT: "wss://dashscope.example/realtime",
      DEV_CLIENT_TOKEN: "dev-client-token",
      DEV_USER_ID: "user_1",
      CLIENT_TOKEN_SECRET: "local-manual-client-token-secret",
      BILLING_STORE_FILE: "/repo/.tmp/manual-aliyun-api/billing.json",
      PAYMENT_LEDGER_FILE: "/repo/.tmp/manual-aliyun-api/payment-ledger.json"
    });
  });

  it("prints one-command mock manual session instructions", () => {
    const paths = resolveManualMockSessionPaths("/repo");
    const instructions = createManualMockInstructions(paths, 8787);

    expect(mockApiHealthUrl(8787)).toBe("http://127.0.0.1:8787/healthz");
    expect(instructions).toContain("Mock API");
    expect(instructions).toContain("ws://localhost:8787/v1/live");
    expect(instructions).toContain("dev-client-token");
    expect(instructions).toContain("Allow access to file URLs");
    expect(instructions).toContain("Ctrl+C");
  });

  it("prints one-command Aliyun manual session instructions", () => {
    const paths = resolveManualAliyunSessionPaths("/repo");
    const instructions = createManualAliyunInstructions(paths, 8788);

    expect(instructions).toContain("真实阿里");
    expect(instructions).toContain("ws://localhost:8788/v1/live");
    expect(instructions).toContain("dev-client-token");
    expect(instructions).toContain("阿里百炼 LiveTranslate");
    expect(instructions).toContain("延迟诊断");
  });

  it("prints side-effect-free Aliyun manual launcher help", () => {
    expect(createManualAliyunHelpText()).toContain("manual:aliyun");
    expect(createManualAliyunHelpText()).toContain("DASHSCOPE_API_KEY");
    expect(createManualAliyunHelpText()).toContain("CHROME_DEBUG_PORT");
  });

  it("finds the manual HTML5 player tab from Chrome DevTools targets", () => {
    const paths = resolveManualMockSessionPaths("/repo");
    const target = findManualPageTarget(
      [
        { type: "page", title: "Other", url: "https://example.com/" },
        { type: "page", title: "中文同传 HTML5 播放器测试页", url: "file:///repo/manual-test/html5-player.html" }
      ],
      paths
    );

    expect(target).toEqual({
      type: "page",
      title: "中文同传 HTML5 播放器测试页",
      url: "file:///repo/manual-test/html5-player.html"
    });
    expect(createManualTargetEvidence(target)).toContain("中文同传 HTML5 播放器测试页");
  });

  it("finds the loaded MV3 extension target from Chrome DevTools targets", () => {
    const target = findExtensionTarget([
      { type: "page", title: "中文同传 HTML5 播放器测试页", url: "file:///repo/manual-test/html5-player.html" },
      { type: "service_worker", title: "中文同传 Dubbing", url: "chrome-extension://abc123/background.js" },
      { type: "other", title: "Ignored", url: "chrome-extension://abc123/offscreen.html" }
    ]);

    expect(target).toEqual({
      type: "service_worker",
      title: "中文同传 Dubbing",
      url: "chrome-extension://abc123/background.js"
    });
    expect(createExtensionTargetEvidence(target)).toContain("中文同传 Dubbing");
  });

  it("prefers Chrome for Testing or Chromium for automated extension smoke checks", () => {
    expect(
      extensionAutomationChromeCandidates("darwin", {
        CHROME_FOR_TESTING: "/custom/chrome-for-testing",
        CHROMIUM_PATH: "/custom/chromium"
      } as NodeJS.ProcessEnv)
    ).toEqual([
      "/custom/chrome-for-testing",
      "/custom/chromium",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ]);
    expect(extensionAutomationChromeCandidates("darwin")).not.toContain(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    );
  });

  it("prefers repo-installed Chrome for Testing for manual extension sessions", () => {
    expect(
      manualExtensionChromeCandidates("/repo", "darwin", "arm64", {
        CHROME_FOR_TESTING: "/custom/chrome-for-testing",
        CHROMIUM_PATH: "/custom/chromium"
      } as NodeJS.ProcessEnv)
    ).toEqual([
      "/custom/chrome-for-testing",
      "/custom/chromium",
      "/repo/.tmp/chrome-for-testing/chrome/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/repo/.tmp/chrome-for-testing/chrome/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ]);
  });

  it("falls back to branded Chrome only after manual extension-capable browsers are missing", () => {
    expect(
      findManualExtensionChromeExecutable("/repo", "darwin", "arm64", {
        CHROME_PATH: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      } as NodeJS.ProcessEnv)
    ).toBeUndefined();
  });

  it("does not use branded Google Chrome for automated extension loading", () => {
    expect(
      findExtensionAutomationChromeExecutable("darwin", {
        CHROME_PATH: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      } as NodeJS.ProcessEnv)
    ).toBeUndefined();
    expect(createExtensionAutomationBrowserInstructions()).toContain("Chrome for Testing");
    expect(createExtensionAutomationBrowserInstructions()).toContain("Chrome 137");
  });

  it("does not mistake Chrome built-in extension service workers for this extension", () => {
    const target = findExtensionTarget([
      {
        type: "service_worker",
        title: "Google Network Speech",
        url: "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js"
      },
      {
        type: "service_worker",
        title: "中文同传 Dubbing",
        url: "chrome-extension://our-extension/background.js"
      }
    ]);

    expect(target).toEqual({
      type: "service_worker",
      title: "中文同传 Dubbing",
      url: "chrome-extension://our-extension/background.js"
    });
  });

  it("returns undefined when only Chrome built-in extension workers are present", () => {
    expect(
      findExtensionTarget([
        {
          type: "service_worker",
          title: "Google Network Speech",
          url: "chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js"
        },
        {
          type: "service_worker",
          title: "Chrome PDF Viewer",
          url: "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html"
        }
      ])
    ).toBeUndefined();
  });

  it("creates combined manual session target evidence", () => {
    const paths = resolveManualMockSessionPaths("/repo");

    expect(
      createManualSessionTargetEvidence(
        [
          { type: "page", title: "中文同传 HTML5 播放器测试页", url: "file:///repo/manual-test/html5-player.html" },
          { type: "service_worker", title: "中文同传 Dubbing", url: "chrome-extension://abc123/background.js" }
        ],
        paths
      )
    ).toContain("Chrome extension check: found \"中文同传 Dubbing\"");
  });

  it("explains how to recover when the manual page opens but the extension is not loaded", () => {
    const paths = resolveManualMockSessionPaths("/repo");

    expect(
      createManualSessionTargetEvidence(
        [{ type: "page", title: "中文同传 HTML5 播放器测试页", url: "file:///repo/manual-test/html5-player.html" }],
        paths
      )
    ).toContain("CHROME_PROFILE_DIR");
  });
});
