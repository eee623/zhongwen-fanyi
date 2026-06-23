import { describe, expect, it } from "vitest";
import {
  buildChromeStoreSubmissionChecklist,
  checkChromeStoreCompliance,
  type ChromeExtensionManifest,
  type ChromeStoreReleaseArtifacts
} from "../src/chromeStoreCompliance";

const requiredIconPaths = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png"
};

const compliantManifest: ChromeExtensionManifest = {
  manifest_version: 3,
  name: "中文同传 Dubbing",
  permissions: ["activeTab", "offscreen", "scripting", "storage", "tabCapture"],
  host_permissions: ["<all_urls>"],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' ws://localhost:* http://localhost:* wss://* https://*"
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content-scripts/content.js"]
    }
  ],
  icons: requiredIconPaths,
  action: {
    default_title: "中文同传",
    default_icon: requiredIconPaths,
    default_popup: "popup.html"
  },
  commands: {
    _execute_action: {
      suggested_key: {
        default: "Ctrl+Shift+Y",
        mac: "Command+Shift+Y"
      },
      description: "打开中文同传控制面板"
    }
  }
} as ChromeExtensionManifest;

const completeReleaseArtifacts: ChromeStoreReleaseArtifacts = {
  storeListing: [
    "中文同传 Dubbing",
    "用户点击启动后捕获当前标签页音频，将英语实时翻译成中文字幕和中文配音。",
    "支持 YouTube、优酷、B站、普通 HTML5 video 和 Chrome 可播放本地视频。"
  ].join("\n"),
  permissionJustification: [
    "tabCapture: 用户点击启动后捕获当前标签页音频。",
    "offscreen: 在 MV3 后台外处理音频播放和混音。",
    "storage: 保存用户设置和开发凭据。",
    "activeTab: 只在用户当前标签页启动同传。",
    "scripting: 注入字幕覆盖层。",
    "<all_urls>: 覆盖 YouTube、优酷、B站、普通 HTML5 video 和 Chrome 可播放本地视频。"
  ].join("\n"),
  privacyDisclosure: [
    "音频只在用户主动点击启动后捕获。",
    "音频会发送到自有后端，再代理到阿里百炼实时翻译服务。",
    "默认不保存原始音频，不保存声纹。",
    "仅保留计费、额度、并发限制和延迟诊断所需的最小日志。",
    "Limited Use: 数据只用于实时翻译、配音、计费和故障诊断。"
  ].join("\n"),
  privacyPolicyText: [
    "中文同传隐私政策",
    "用户主动点击启动后才会处理当前标签页音频。",
    "音频会发送到自有后端，再代理到阿里百炼实时翻译服务。",
    "账号、订阅、支付、翻译分钟数、并发限制和延迟日志只用于实时翻译、配音、计费和故障诊断。",
    "默认不保存原始音频，不保存声纹。",
    "Limited Use: 不会将用户数据出售、转让给广告平台或用于与产品核心功能无关的用途。"
  ].join("\n"),
  packagedFiles: Object.values(requiredIconPaths),
  storeAssets: [
    {
      role: "storeIcon",
      path: "store-assets/chrome-web-store/icon-128.png",
      width: 128,
      height: 128,
      format: "png"
    },
    {
      role: "screenshot",
      path: "store-assets/chrome-web-store/screenshots/popup-and-subtitles-1280x800.png",
      width: 1280,
      height: 800,
      format: "png"
    },
    {
      role: "smallPromoTile",
      path: "store-assets/chrome-web-store/promo-small-440x280.png",
      width: 440,
      height: 280,
      format: "png"
    }
  ],
  submissionMetadata: {
    privacyPolicyUrl: "https://realtime-dubbing.app/privacy",
    inAppPurchasesDisclosed: true,
    singlePurpose: "把英语视频实时翻译成中文字幕和中文配音。"
  },
  sourceFiles: [
    {
      path: "apps/extension/entrypoints/background.ts",
      text: [
        'chrome.runtime.onMessage.addListener((message) => {',
        '  switch (message.type) {',
        '    case "popup.start": {',
        "      const streamId = await getTabStreamId(tab.id);",
        '      await chrome.runtime.sendMessage({ type: "offscreen.start", streamId });',
        "    }",
        "  }",
        "});",
        "async function getTabStreamId(tabId: number) {",
        "  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, () => {});",
        "}"
      ].join("\n")
    },
    {
      path: "apps/extension/entrypoints/popup/App.tsx",
      text: [
        "async function toggleSession() {",
        '  await sendPopupMessage({ type: "popup.start", settings: normalized, clientToken });',
        "}"
      ].join("\n")
    },
    {
      path: "apps/extension/entrypoints/offscreen/main.ts",
      text: "chrome.runtime.onMessage.addListener((message) => message.type === \"offscreen.start\");"
    },
    {
      path: "apps/extension/entrypoints/content.ts",
      text: "export {};"
    }
  ]
} as ChromeStoreReleaseArtifacts;

describe("Chrome Web Store compliance gate", () => {
  it("accepts the MVP manifest when every sensitive permission is justified", () => {
    expect(checkChromeStoreCompliance(compliantManifest, completeReleaseArtifacts).errors).toEqual([]);
  });

  it("rejects broad host access without Chrome Web Store disclosure artifacts", () => {
    const result = checkChromeStoreCompliance(compliantManifest);

    expect(result.errors).toContain("Chrome Web Store permission justification must explain <all_urls>.");
    expect(result.errors).toContain("Chrome Web Store privacy disclosure must explain tab audio handling.");
    expect(result.errors).toContain("Chrome Web Store listing must disclose user-triggered tab audio capture.");
  });

  it("rejects non-MV3 manifests and remote executable code", () => {
    const result = checkChromeStoreCompliance(
      {
        ...compliantManifest,
        manifest_version: 2,
        content_security_policy: {
          extension_pages: "script-src 'self' https://cdn.example.com 'unsafe-eval'; object-src 'self'"
        }
      },
      completeReleaseArtifacts
    );

    expect(result.errors).toContain("Manifest must use version 3.");
    expect(result.errors).toContain("Extension page scripts must not allow remote code or unsafe evaluation.");
  });

  it("rejects broad or sensitive permissions that are not in the reviewed allowlist", () => {
    const permissions = compliantManifest.permissions ?? [];
    const result = checkChromeStoreCompliance(
      {
        ...compliantManifest,
        permissions: [...permissions, "cookies"]
      },
      completeReleaseArtifacts
    );

    expect(result.errors).toContain("Permission cookies is not part of the reviewed MVP allowlist.");
  });

  it("requires every content script file to be bundled with the extension", () => {
    const result = checkChromeStoreCompliance(
      {
        ...compliantManifest,
        content_scripts: [
          {
            matches: ["<all_urls>"],
            js: ["https://cdn.example.com/content.js"]
          }
        ]
      },
      completeReleaseArtifacts
    );

    expect(result.errors).toContain("Content script https://cdn.example.com/content.js must be bundled locally.");
  });

  it("requires store-ready PNG icons in the manifest and toolbar action", () => {
    const result = checkChromeStoreCompliance(
      {
        ...compliantManifest,
        icons: {
          "16": "icons/icon-16.png",
          "48": "icons/icon-48.png",
          "128": "icons/icon.svg"
        },
        action: {
          default_title: "中文同传",
          default_icon: {
            "16": "icons/icon-16.png"
          }
        }
      } as ChromeExtensionManifest,
      completeReleaseArtifacts
    );

    expect(result.errors).toContain("Manifest must declare PNG icons for sizes 16, 32, 48, and 128.");
    expect(result.errors).toContain("Toolbar action must declare PNG default icons for sizes 16, 32, 48, and 128.");
  });

  it("requires a toolbar popup and execute-action shortcut for user-triggered startup", () => {
    const result = checkChromeStoreCompliance(
      {
        ...compliantManifest,
        action: {
          default_title: "中文同传",
          default_icon: requiredIconPaths
        },
        commands: {}
      } as ChromeExtensionManifest,
      completeReleaseArtifacts
    );

    expect(result.errors).toContain("Toolbar action must open the bundled popup.html control panel.");
    expect(result.errors).toContain("Manifest must keep _execute_action with a suggested keyboard shortcut.");
  });

  it("requires declared icon files to be included in the packaged extension", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      packagedFiles: ["icons/icon-16.png", "icons/icon-32.png", "icons/icon-128.png"]
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Packaged extension is missing declared icon file icons/icon-48.png.");
  });

  it("requires Chrome Web Store dashboard graphic assets", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      storeAssets: [
        {
          role: "screenshot",
          path: "store-assets/chrome-web-store/screenshots/popup-and-subtitles-1280x800.png",
          width: 1280,
          height: 800,
          format: "png"
        }
      ]
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Chrome Web Store assets must include a 128x128 PNG store icon.");
    expect(result.errors).toContain("Chrome Web Store assets must include a 440x280 PNG or JPEG small promo tile.");
  });

  it("requires screenshots to use Chrome Web Store dimensions", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      storeAssets: [
        {
          role: "storeIcon",
          path: "store-assets/chrome-web-store/icon-128.png",
          width: 128,
          height: 128,
          format: "png"
        },
        {
          role: "screenshot",
          path: "store-assets/chrome-web-store/screenshots/popup-and-subtitles.png",
          width: 1024,
          height: 768,
          format: "png"
        },
        {
          role: "smallPromoTile",
          path: "store-assets/chrome-web-store/promo-small-440x280.png",
          width: 440,
          height: 280,
          format: "png"
        }
      ]
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Chrome Web Store assets must include at least one 1280x800 PNG or JPEG screenshot.");
  });

  it("requires a public privacy policy URL in submission metadata", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      submissionMetadata: {
        ...completeReleaseArtifacts.submissionMetadata,
        privacyPolicyUrl: "https://example.com/privacy"
      }
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Chrome Web Store submission must include a public HTTPS privacy policy URL.");
  });

  it("requires in-app purchases and single purpose to be disclosed for paid subscriptions", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      submissionMetadata: {
        privacyPolicyUrl: "https://realtime-dubbing.app/privacy",
        inAppPurchasesDisclosed: false,
        singlePurpose: "AI helper."
      }
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Chrome Web Store submission must disclose subscriptions or in-app purchases.");
    expect(result.errors).toContain("Chrome Web Store single purpose must match realtime subtitles and Chinese dubbing.");
  });

  it("requires a complete public privacy policy for audio, account, payment, and Limited Use disclosures", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      privacyPolicyText: "我们尊重隐私。"
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Public privacy policy must disclose audio, account, payment, third-party processing, retention, and Limited Use practices.");
  });

  it("requires source evidence that tab audio capture only starts from popup.start", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      sourceFiles: [
        {
          path: "apps/extension/entrypoints/background.ts",
          text: [
            "chrome.runtime.onInstalled.addListener(async () => {",
            "  await getTabStreamId(1);",
            "});",
            "async function getTabStreamId(tabId: number) {",
            "  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, () => {});",
            "}"
          ].join("\n")
        },
        {
          path: "apps/extension/entrypoints/popup/App.tsx",
          text: "export {};"
        }
      ]
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Tab audio capture must only start from the user-triggered popup.start handler.");
  });

  it("requires source files for the user-triggered capture audit", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      sourceFiles: undefined
    } as ChromeStoreReleaseArtifacts);

    expect(result.errors).toContain("Chrome Web Store source audit must include background and popup source files.");
  });

  it("turns a missing public privacy URL into an actionable Chrome Store checklist blocker", () => {
    const result = checkChromeStoreCompliance(compliantManifest, {
      ...completeReleaseArtifacts,
      submissionMetadata: {
        ...completeReleaseArtifacts.submissionMetadata,
        privacyPolicyUrl: "PENDING_PUBLIC_PRIVACY_POLICY_URL"
      }
    } as ChromeStoreReleaseArtifacts);

    const checklist = buildChromeStoreSubmissionChecklist(result);

    expect(checklist.ready).toBe(false);
    expect(checklist.blockedCount).toBe(1);
    expect(checklist.items).toContainEqual({
      id: "privacy-policy-url",
      label: "Public HTTPS privacy policy URL",
      status: "blocked",
      detail: "Deploy apps/public-site and set CHROME_STORE_PRIVACY_POLICY_URL to the public /privacy URL.",
      command: "CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run check:chrome-store"
    });
    expect(checklist.items.find((item) => item.id === "manifest-policy")?.status).toBe("passed");
  });

  it("marks the Chrome Store checklist ready when every compliance gate passes", () => {
    const checklist = buildChromeStoreSubmissionChecklist(checkChromeStoreCompliance(compliantManifest, completeReleaseArtifacts));

    expect(checklist.ready).toBe(true);
    expect(checklist.blockedCount).toBe(0);
    expect(checklist.items.every((item) => item.status === "passed")).toBe(true);
  });
});
