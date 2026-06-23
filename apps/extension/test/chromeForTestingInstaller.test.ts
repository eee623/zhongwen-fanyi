import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chromeForTestingPlatform,
  findInstalledChromeForTestingExecutable,
  installChromeForTestingHelpText,
  resumeDownloadHeaders,
  selectChromeForTestingDownload,
  validateChromeForTestingZip
} from "../src/chromeForTestingInstaller";

describe("Chrome for Testing installer helpers", () => {
  it("maps the current OS and architecture to Chrome for Testing platform ids", () => {
    expect(chromeForTestingPlatform("darwin", "arm64")).toBe("mac-arm64");
    expect(chromeForTestingPlatform("darwin", "x64")).toBe("mac-x64");
    expect(chromeForTestingPlatform("linux", "x64")).toBe("linux64");
    expect(chromeForTestingPlatform("win32", "x64")).toBe("win64");
  });

  it("prints side-effect-free install guidance", () => {
    expect(installChromeForTestingHelpText()).toContain("install:chrome-for-testing");
    expect(installChromeForTestingHelpText()).toContain("CHROME_FOR_TESTING_INSTALL_DIR");
    expect(installChromeForTestingHelpText()).toContain("CHROME_FOR_TESTING=");
  });

  it("selects the stable chrome download URL for the requested platform", () => {
    const metadata = {
      channels: {
        Stable: {
          version: "150.0.7871.24",
          downloads: {
            chrome: [
              {
                platform: "mac-arm64",
                url: "https://storage.googleapis.com/chrome-for-testing-public/150.0.7871.24/mac-arm64/chrome-mac-arm64.zip"
              }
            ]
          }
        }
      }
    };

    expect(selectChromeForTestingDownload(metadata, "mac-arm64")).toEqual({
      version: "150.0.7871.24",
      platform: "mac-arm64",
      url: "https://storage.googleapis.com/chrome-for-testing-public/150.0.7871.24/mac-arm64/chrome-mac-arm64.zip"
    });
  });

  it("rejects tiny or missing Chrome for Testing zip files before extraction", () => {
    const tempDir = join(tmpdir(), `cft-installer-test-${process.pid}`);
    const zipPath = join(tempDir, "chrome.zip");
    mkdirSync(tempDir, { recursive: true });
    try {
      writeFileSync(zipPath, "not a complete browser");
      expect(() => validateChromeForTestingZip(zipPath, 1000)).toThrow(/incomplete/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses an HTTP range request when resuming a partial browser download", () => {
    expect(resumeDownloadHeaders(0)).toEqual({});
    expect(resumeDownloadHeaders(2048)).toEqual({ Range: "bytes=2048-" });
  });

  it("finds the extracted macOS Chrome for Testing executable", () => {
    const tempDir = join(tmpdir(), `cft-extracted-test-${process.pid}`);
    const executable = join(
      tempDir,
      "chrome",
      "mac-arm64",
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    );
    mkdirSync(executable.replace(/\/Google Chrome for Testing$/, ""), { recursive: true });
    writeFileSync(executable, "");
    try {
      expect(findInstalledChromeForTestingExecutable(tempDir, "mac-arm64")).toBe(executable);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
