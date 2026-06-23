import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ChromeForTestingDownload {
  version: string;
  platform: string;
  url: string;
}

export function installChromeForTestingHelpText(): string {
  return [
    "Usage: npm run install:chrome-for-testing",
    "",
    "Downloads Chrome for Testing into .tmp/chrome-for-testing and prints:",
    "CHROME_FOR_TESTING=/absolute/path/to/Google Chrome for Testing",
    "",
    "Environment variables:",
    "- CHROME_FOR_TESTING_INSTALL_DIR: custom install directory",
    "- CHROME_FOR_TESTING_METADATA_URL: custom Chrome for Testing metadata URL"
  ].join("\n");
}

export function chromeForTestingPlatform(platform = process.platform, arch = process.arch): string {
  if (platform === "darwin") {
    return arch === "arm64" ? "mac-arm64" : "mac-x64";
  }
  if (platform === "linux") {
    return "linux64";
  }
  if (platform === "win32") {
    return arch === "arm64" ? "win64" : arch === "x64" ? "win64" : "win32";
  }
  throw new Error(`Unsupported Chrome for Testing platform: ${platform}/${arch}`);
}

export function selectChromeForTestingDownload(metadata: unknown, platform: string): ChromeForTestingDownload {
  const stable = asRecord(asRecord(metadata)?.channels)?.Stable;
  const version = asString(asRecord(stable)?.version);
  const chromeDownloads = asRecord(asRecord(stable)?.downloads)?.chrome;
  if (!version || !Array.isArray(chromeDownloads)) {
    throw new Error("Chrome for Testing metadata is missing Stable chrome downloads.");
  }
  const download = chromeDownloads.find((item) => asRecord(item)?.platform === platform);
  const url = asString(asRecord(download)?.url);
  if (!url) {
    throw new Error(`Chrome for Testing download not found for ${platform}.`);
  }
  return {
    version,
    platform,
    url
  };
}

export function validateChromeForTestingZip(zipPath: string, minBytes = 100 * 1024 * 1024): void {
  if (!existsSync(zipPath)) {
    throw new Error(`Chrome for Testing zip is missing: ${zipPath}`);
  }
  const size = statSync(zipPath).size;
  if (size < minBytes) {
    throw new Error(`Chrome for Testing zip looks incomplete: ${zipPath} (${size} bytes).`);
  }
}

export function resumeDownloadHeaders(existingBytes: number): Record<string, string> {
  return existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : {};
}

export function findInstalledChromeForTestingExecutable(installRoot: string, platform: string): string | undefined {
  if (platform === "mac-arm64" || platform === "mac-x64") {
    return findFirstExisting([
      join(
        installRoot,
        "chrome",
        platform,
        `chrome-${platform}`,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      join(
        installRoot,
        "chrome",
        `chrome-${platform}`,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    ]);
  }

  if (platform === "linux64") {
    return findFirstExisting([
      join(installRoot, "chrome", platform, "chrome-linux64", "chrome"),
      join(installRoot, "chrome", "chrome-linux64", "chrome")
    ]);
  }

  if (platform === "win32" || platform === "win64") {
    return findFirstExisting([
      join(installRoot, "chrome", platform, `chrome-${platform}`, "chrome.exe"),
      join(installRoot, "chrome", `chrome-${platform}`, "chrome.exe")
    ]);
  }

  return findExecutableByName(installRoot, platform === "win32" || platform === "win64" ? "chrome.exe" : "chrome");
}

function findFirstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

function findExecutableByName(root: string, executableName: string): string | undefined {
  if (!existsSync(root)) {
    return undefined;
  }
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === executableName) {
      return path;
    }
    if (entry.isDirectory()) {
      const found = findExecutableByName(path, executableName);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
