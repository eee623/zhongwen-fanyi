export interface ChromeExtensionManifest {
  manifest_version?: number;
  name?: string;
  permissions?: string[];
  host_permissions?: string[];
  icons?: Record<string, string>;
  action?: {
    default_title?: string;
    default_popup?: string;
    default_icon?: string | Record<string, string>;
  };
  commands?: Record<
    string,
    {
      suggested_key?: Record<string, string>;
      description?: string;
    }
  >;
  content_security_policy?: {
    extension_pages?: string;
  };
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
  }>;
}

export interface ChromeStoreComplianceResult {
  errors: string[];
  warnings: string[];
}

export type ChromeStoreChecklistStatus = "passed" | "blocked";

export interface ChromeStoreChecklistItem {
  id: string;
  label: string;
  status: ChromeStoreChecklistStatus;
  detail: string;
  command?: string;
}

export interface ChromeStoreSubmissionChecklist {
  ready: boolean;
  blockedCount: number;
  items: ChromeStoreChecklistItem[];
}

export type ChromeStoreAssetRole = "storeIcon" | "screenshot" | "smallPromoTile" | "marqueePromoTile";
export type ChromeStoreAssetFormat = "png" | "jpeg";

export interface ChromeStoreAsset {
  role: ChromeStoreAssetRole;
  path: string;
  width: number;
  height: number;
  format: ChromeStoreAssetFormat;
}

export interface ChromeStoreSubmissionMetadata {
  privacyPolicyUrl?: string;
  inAppPurchasesDisclosed?: boolean;
  singlePurpose?: string;
}

export interface ChromeStoreSourceFile {
  path: string;
  text: string;
}

export interface ChromeStoreReleaseArtifacts {
  storeListing?: string;
  permissionJustification?: string;
  privacyDisclosure?: string;
  privacyPolicyText?: string;
  packagedFiles?: string[];
  storeAssets?: ChromeStoreAsset[];
  submissionMetadata?: ChromeStoreSubmissionMetadata;
  sourceFiles?: ChromeStoreSourceFile[];
}

const REVIEWED_PERMISSION_ALLOWLIST = new Set(["activeTab", "offscreen", "scripting", "storage", "tabCapture"]);
const REQUIRED_PERMISSIONS = ["activeTab", "offscreen", "scripting", "storage", "tabCapture"];
const REQUIRED_ICON_SIZES = ["16", "32", "48", "128"];
const REMOTE_SCRIPT_PATTERN = /\b(?:https?:|wss?:|data:|blob:|filesystem:)/i;

export function checkChromeStoreCompliance(
  manifest: ChromeExtensionManifest,
  artifacts: ChromeStoreReleaseArtifacts = {}
): ChromeStoreComplianceResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.manifest_version !== 3) {
    errors.push("Manifest must use version 3.");
  }

  const permissions = manifest.permissions ?? [];
  for (const permission of permissions) {
    if (!REVIEWED_PERMISSION_ALLOWLIST.has(permission)) {
      errors.push(`Permission ${permission} is not part of the reviewed MVP allowlist.`);
    }
  }
  for (const permission of REQUIRED_PERMISSIONS) {
    if (!permissions.includes(permission)) {
      errors.push(`Required MVP permission ${permission} is missing.`);
    }
  }

  const hostPermissions = manifest.host_permissions ?? [];
  if (!hostPermissions.includes("<all_urls>")) {
    errors.push("Host permissions must include <all_urls> until per-site optional permissions are implemented.");
  }

  const extensionPageCsp = manifest.content_security_policy?.extension_pages ?? "";
  if (!extensionPageCsp.includes("script-src 'self'") || allowsRemoteExecutableCode(extensionPageCsp)) {
    errors.push("Extension page scripts must not allow remote code or unsafe evaluation.");
  }

  for (const contentScript of manifest.content_scripts ?? []) {
    for (const jsFile of contentScript.js ?? []) {
      if (REMOTE_SCRIPT_PATTERN.test(jsFile) || jsFile.startsWith("//")) {
        errors.push(`Content script ${jsFile} must be bundled locally.`);
      }
    }
  }

  const declaredIconFiles = [
    ...validateIconMap(manifest.icons, "Manifest must declare PNG icons for sizes 16, 32, 48, and 128.", errors),
    ...validateIconMap(
      objectIconMap(manifest.action?.default_icon),
      "Toolbar action must declare PNG default icons for sizes 16, 32, 48, and 128.",
      errors
    )
  ];
  checkUserInvocationManifest(manifest, errors);
  checkPackagedIconFiles(declaredIconFiles, artifacts.packagedFiles, errors);
  checkStoreListingAssets(artifacts.storeAssets, errors);
  checkSubmissionMetadata(artifacts.submissionMetadata, errors);

  checkReleaseArtifacts(manifest, artifacts, errors);
  checkUserTriggeredCaptureSource(manifest, artifacts.sourceFiles, errors);

  return { errors, warnings };
}

export function buildChromeStoreSubmissionChecklist(result: ChromeStoreComplianceResult): ChromeStoreSubmissionChecklist {
  const items: ChromeStoreChecklistItem[] = [
    checklistItem(
      "manifest-policy",
      "Manifest V3, reviewed permissions, CSP, and bundled content scripts",
      result,
      [
        "Manifest must use version 3.",
        "is not part of the reviewed MVP allowlist.",
        "Required MVP permission",
        "Host permissions must include <all_urls>",
        "Extension page scripts must not allow remote code or unsafe evaluation.",
        "must be bundled locally.",
        "Toolbar action must open",
        "Manifest must keep _execute_action"
      ],
      "Keep WXT MV3 output, permission allowlist, local scripts, and extension CSP aligned with docs/chrome-web-store-release-gate.md."
    ),
    checklistItem(
      "packaged-icons",
      "Packaged manifest and toolbar icons",
      result,
      [
        "Manifest must declare PNG icons",
        "Toolbar action must declare PNG default icons",
        "Packaged extension is missing declared icon file"
      ],
      "Provide 16/32/48/128 PNG icons under apps/extension/public/icons before packaging."
    ),
    checklistItem(
      "store-assets",
      "Chrome Web Store dashboard graphics",
      result,
      [
        "Chrome Web Store assets must include a 128x128 PNG store icon.",
        "Chrome Web Store assets must include at least one 1280x800 PNG or JPEG screenshot.",
        "Chrome Web Store assets must include a 440x280 PNG or JPEG small promo tile."
      ],
      "Add store icon, 1280x800 screenshot, and 440x280 promo tile under store-assets/chrome-web-store."
    ),
    checklistItem(
      "privacy-policy-url",
      "Public HTTPS privacy policy URL",
      result,
      [
        "Chrome Web Store submission must include a public HTTPS privacy policy URL.",
        "Chrome Web Store privacy policy URL must be reachable and point to the privacy policy."
      ],
      "Deploy apps/public-site and set CHROME_STORE_PRIVACY_POLICY_URL to the public /privacy URL.",
      "CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run check:chrome-store"
    ),
    checklistItem(
      "user-data-disclosures",
      "User data, audio handling, retention, and Limited Use disclosures",
      result,
      [
        "Chrome Web Store privacy disclosure must explain tab audio handling.",
        "Public privacy policy must disclose audio, account, payment, third-party processing, retention, and Limited Use practices."
      ],
      "Keep docs/privacy-disclosure.md and docs/privacy-policy-public.md aligned with actual audio, account, payment, retention, and Limited Use behavior."
    ),
    checklistItem(
      "user-triggered-capture-code",
      "User-triggered tab audio capture implementation",
      result,
      [
        "Chrome Web Store source audit must include background and popup source files.",
        "Tab audio capture must only start from the user-triggered popup.start handler."
      ],
      "Keep chrome.tabCapture.getMediaStreamId reachable only through the popup Start button -> popup.start background handler."
    ),
    checklistItem(
      "permission-justification",
      "Sensitive permission and <all_urls> justifications",
      result,
      [
        "Chrome Web Store permission justification must explain <all_urls>.",
        "Chrome Web Store permission justification must cover every requested sensitive permission."
      ],
      "Update docs/chrome-web-store-permissions.md with tabCapture, offscreen, storage, activeTab, scripting, and <all_urls> justifications."
    ),
    checklistItem(
      "store-listing",
      "Single purpose and user-triggered audio capture listing copy",
      result,
      [
        "Chrome Web Store listing must disclose user-triggered tab audio capture.",
        "Chrome Web Store single purpose must match realtime subtitles and Chinese dubbing."
      ],
      "Update docs/chrome-web-store-listing.md and submission metadata so the extension purpose is realtime Chinese subtitles and dubbing."
    ),
    checklistItem(
      "paid-subscriptions",
      "Subscriptions and in-app purchases disclosure",
      result,
      ["Chrome Web Store submission must disclose subscriptions or in-app purchases."],
      "Set inAppPurchasesDisclosed=true in store-assets/chrome-web-store/submission.json and match the dashboard disclosure."
    )
  ];
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return {
    ready: blockedCount === 0,
    blockedCount,
    items
  };
}

export function formatChromeStoreSubmissionChecklist(checklist: ChromeStoreSubmissionChecklist): string {
  return checklist.items
    .map((item) => {
      const marker = item.status === "passed" ? "PASS" : "BLOCKED";
      return item.command
        ? `[${marker}] ${item.label}: ${item.detail} Command: ${item.command}`
        : `[${marker}] ${item.label}: ${item.detail}`;
    })
    .join("\n");
}

function validateIconMap(iconMap: Record<string, string> | undefined, error: string, errors: string[]): string[] {
  const hasAllRequiredPngIcons =
    iconMap &&
    REQUIRED_ICON_SIZES.every((size) => {
      const iconPath = iconMap[size];
      return typeof iconPath === "string" && iconPath.toLowerCase().endsWith(".png");
    });

  if (!hasAllRequiredPngIcons && !errors.includes(error)) {
    errors.push(error);
  }

  return iconMap ? Object.values(iconMap) : [];
}

function checklistItem(
  id: string,
  label: string,
  result: ChromeStoreComplianceResult,
  errorNeedles: string[],
  detail: string,
  command?: string
): ChromeStoreChecklistItem {
  const blocked = result.errors.some((error) => errorNeedles.some((needle) => error.includes(needle)));
  return {
    id,
    label,
    status: blocked ? "blocked" : "passed",
    detail,
    command
  };
}

function objectIconMap(iconMap: string | Record<string, string> | undefined): Record<string, string> | undefined {
  return typeof iconMap === "object" ? iconMap : undefined;
}

function checkUserInvocationManifest(manifest: ChromeExtensionManifest, errors: string[]): void {
  const popup = manifest.action?.default_popup;
  if (popup !== "popup.html") {
    errors.push("Toolbar action must open the bundled popup.html control panel.");
  }

  const executeAction = manifest.commands?._execute_action;
  const suggestedKey = executeAction?.suggested_key ?? {};
  if (!suggestedKey.default && !suggestedKey.mac) {
    errors.push("Manifest must keep _execute_action with a suggested keyboard shortcut.");
  }
}

function checkPackagedIconFiles(
  declaredIconFiles: string[],
  packagedFiles: string[] | undefined,
  errors: string[]
): void {
  if (!packagedFiles) {
    errors.push("Packaged extension file list is required to verify Chrome Web Store icon assets.");
    return;
  }

  const packagedFileSet = new Set(packagedFiles.map(normalizePackagePath));
  for (const iconFile of new Set(declaredIconFiles.map(normalizePackagePath))) {
    if (iconFile && !packagedFileSet.has(iconFile)) {
      errors.push(`Packaged extension is missing declared icon file ${iconFile}.`);
    }
  }
}

function checkStoreListingAssets(storeAssets: ChromeStoreAsset[] | undefined, errors: string[]): void {
  const assets = storeAssets ?? [];
  const hasStoreIcon = assets.some(
    (asset) => asset.role === "storeIcon" && asset.width === 128 && asset.height === 128 && asset.format === "png"
  );
  const hasScreenshot = assets.some(
    (asset) =>
      asset.role === "screenshot" &&
      asset.width === 1280 &&
      asset.height === 800 &&
      isChromeStoreRasterFormat(asset.format)
  );
  const hasSmallPromoTile = assets.some(
    (asset) =>
      asset.role === "smallPromoTile" &&
      asset.width === 440 &&
      asset.height === 280 &&
      isChromeStoreRasterFormat(asset.format)
  );

  if (!hasStoreIcon) {
    errors.push("Chrome Web Store assets must include a 128x128 PNG store icon.");
  }
  if (!hasScreenshot) {
    errors.push("Chrome Web Store assets must include at least one 1280x800 PNG or JPEG screenshot.");
  }
  if (!hasSmallPromoTile) {
    errors.push("Chrome Web Store assets must include a 440x280 PNG or JPEG small promo tile.");
  }
}

function isChromeStoreRasterFormat(format: ChromeStoreAssetFormat): boolean {
  return format === "png" || format === "jpeg";
}

function checkSubmissionMetadata(metadata: ChromeStoreSubmissionMetadata | undefined, errors: string[]): void {
  if (!isPublicHttpsPrivacyPolicyUrl(metadata?.privacyPolicyUrl)) {
    errors.push("Chrome Web Store submission must include a public HTTPS privacy policy URL.");
  }

  if (metadata?.inAppPurchasesDisclosed !== true) {
    errors.push("Chrome Web Store submission must disclose subscriptions or in-app purchases.");
  }

  requireAllTerms(
    normalize(metadata?.singlePurpose),
    ["实时", "中文字幕", "中文配音"],
    "Chrome Web Store single purpose must match realtime subtitles and Chinese dubbing.",
    errors
  );
}

function checkReleaseArtifacts(
  manifest: ChromeExtensionManifest,
  artifacts: ChromeStoreReleaseArtifacts,
  errors: string[]
): void {
  const permissionJustification = normalize(artifacts.permissionJustification);
  const privacyDisclosure = normalize(artifacts.privacyDisclosure);
  const privacyPolicyText = normalize(artifacts.privacyPolicyText);
  const storeListing = normalize(artifacts.storeListing);

  if ((manifest.host_permissions ?? []).includes("<all_urls>")) {
    requireAllTerms(
      permissionJustification,
      ["<all_urls>", "youtube", "优酷", "b站", "html5", "本地视频"],
      "Chrome Web Store permission justification must explain <all_urls>.",
      errors
    );
  }

  requireAllTerms(
    permissionJustification,
    ["tabcapture", "offscreen", "storage", "activetab", "scripting"],
    "Chrome Web Store permission justification must cover every requested sensitive permission.",
    errors
  );

  requireAllTerms(
    privacyDisclosure,
    ["用户主动点击", "音频", "自有后端", "阿里", "不保存原始音频", "不保存声纹", "limited use"],
    "Chrome Web Store privacy disclosure must explain tab audio handling.",
    errors
  );

  requireAllTerms(
    storeListing,
    ["用户点击启动", "当前标签页音频", "中文字幕", "中文配音"],
    "Chrome Web Store listing must disclose user-triggered tab audio capture.",
    errors
  );

  requireAllTerms(
    privacyPolicyText,
    ["用户主动点击", "音频", "自有后端", "阿里", "账号", "订阅", "支付", "不保存原始音频", "不保存声纹", "limited use"],
    "Public privacy policy must disclose audio, account, payment, third-party processing, retention, and Limited Use practices.",
    errors
  );
}

function checkUserTriggeredCaptureSource(
  manifest: ChromeExtensionManifest,
  sourceFiles: ChromeStoreSourceFile[] | undefined,
  errors: string[]
): void {
  if (!(manifest.permissions ?? []).includes("tabCapture")) {
    return;
  }

  const background = sourceFiles?.find((file) => file.path.endsWith("entrypoints/background.ts"));
  const popup = sourceFiles?.find((file) => file.path.includes("entrypoints/popup/"));
  if (!background || !popup) {
    errors.push("Chrome Web Store source audit must include background and popup source files.");
    return;
  }

  const tabCaptureOutsideBackground = (sourceFiles ?? []).some(
    (file) => file.path !== background.path && /\bchrome\.tabCapture\b|\bgetMediaStreamId\s*\(/.test(file.text)
  );
  if (
    tabCaptureOutsideBackground ||
    !background.text.includes("chrome.tabCapture.getMediaStreamId") ||
    !popup.text.includes("popup.start") ||
    !popup.text.includes("toggleSession") ||
    !backgroundTabCaptureCallsStayInsidePopupStart(background.text)
  ) {
    errors.push("Tab audio capture must only start from the user-triggered popup.start handler.");
  }
}

function backgroundTabCaptureCallsStayInsidePopupStart(source: string): boolean {
  const lines = source.split(/\r?\n/);
  const popupStartLine = lines.findIndex((line) => /case\s+["']popup\.start["']/.test(line));
  if (popupStartLine === -1) {
    return false;
  }

  const nextCaseLine = lines.findIndex((line, index) => index > popupStartLine && /^\s*case\s+["']/.test(line));
  const popupStartEndLine = nextCaseLine === -1 ? lines.length : nextCaseLine;
  const callLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /\bgetTabStreamId\s*\(/.test(line) && !/function\s+getTabStreamId\s*\(/.test(line));

  return (
    callLines.length > 0 &&
    callLines.every(({ index }) => index > popupStartLine && index < popupStartEndLine)
  );
}

function requireAllTerms(haystack: string, terms: string[], error: string, errors: string[]): void {
  const missing = terms.some((term) => !haystack.includes(term));
  if (missing && !errors.includes(error)) {
    errors.push(error);
  }
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

function normalizePackagePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function isPublicHttpsPrivacyPolicyUrl(value: string | undefined): boolean {
  if (!value || /pending|todo|replace|your-domain/i.test(value)) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const disallowedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "example.com", "example.org", "example.net"]);
  if (url.protocol !== "https:" || disallowedHosts.has(hostname)) {
    return false;
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".invalid") || hostname.endsWith(".test")) {
    return false;
  }

  return url.pathname.toLowerCase().includes("privacy");
}

function allowsRemoteExecutableCode(csp: string): boolean {
  const scriptSrc = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  if (!scriptSrc) {
    return true;
  }
  return /'unsafe-eval'|'unsafe-inline'|https?:|wss?:|data:|blob:/i.test(scriptSrc);
}
