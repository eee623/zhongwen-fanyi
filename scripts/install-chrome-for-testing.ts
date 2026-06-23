import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import {
  chromeForTestingPlatform,
  findInstalledChromeForTestingExecutable,
  installChromeForTestingHelpText,
  resumeDownloadHeaders,
  selectChromeForTestingDownload,
  validateChromeForTestingZip
} from "../apps/extension/src/chromeForTestingInstaller";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(installChromeForTestingHelpText());
  process.exit(0);
}

const metadataUrl =
  process.env.CHROME_FOR_TESTING_METADATA_URL ??
  "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
const installRoot = resolve(process.env.CHROME_FOR_TESTING_INSTALL_DIR ?? ".tmp/chrome-for-testing");
const platform = chromeForTestingPlatform();

const existing = findInstalledChromeForTestingExecutable(installRoot, platform);
if (existing) {
  console.log(`Chrome for Testing already installed: ${existing}`);
  console.log(`CHROME_FOR_TESTING=${existing}`);
  process.exit(0);
}

const metadata = await fetchJson(metadataUrl);
const download = selectChromeForTestingDownload(metadata, platform);
const zipPath = join(installRoot, "downloads", `${download.version}-${platform}.zip`);
const extractDir = join(installRoot, "chrome", platform);

mkdirSync(dirname(zipPath), { recursive: true });
mkdirSync(extractDir, { recursive: true });

console.log(`Downloading Chrome for Testing ${download.version} (${download.platform})`);
console.log(download.url);
await downloadFile(download.url, zipPath);
validateChromeForTestingZip(zipPath);

rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });
extractZip(zipPath, extractDir);

const executable = findInstalledChromeForTestingExecutable(installRoot, platform);
if (!executable) {
  throw new Error(`Chrome for Testing executable was not found after extraction under ${installRoot}.`);
}

console.log(`Chrome for Testing installed: ${executable}`);
console.log(`CHROME_FOR_TESTING=${executable}`);

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const existingBytes = existsSync(destination) ? statSync(destination).size : 0;
  const response = await fetch(url, {
    headers: resumeDownloadHeaders(existingBytes)
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const responseBytes = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  const totalBytes = response.status === 206 ? existingBytes + responseBytes : responseBytes;
  let downloadedBytes = response.status === 206 ? existingBytes : 0;
  let lastLoggedAt = 0;
  const output = createWriteStream(destination, {
    flags: response.status === 206 ? "a" : "w"
  });

  try {
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      output.write(chunk);
      downloadedBytes += chunk.byteLength;
      if (totalBytes > 0 && Date.now() - lastLoggedAt > 1500) {
        lastLoggedAt = Date.now();
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        process.stdout.write(`Downloaded ${percent}% (${downloadedBytes}/${totalBytes} bytes)\r`);
      }
    }
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      output.end((error?: Error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    });
  }

  if (totalBytes > 0) {
    process.stdout.write(`Downloaded 100.0% (${downloadedBytes}/${totalBytes} bytes)\n`);
  }
}

function extractZip(zipPath: string, destination: string): void {
  const unzip = existsSync("/usr/bin/unzip") ? "/usr/bin/unzip" : "unzip";
  const result = spawnSync(unzip, ["-q", zipPath, "-d", destination], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract ${zipPath}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}
