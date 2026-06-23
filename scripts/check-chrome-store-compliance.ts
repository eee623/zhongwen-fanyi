import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  buildChromeStoreSubmissionChecklist,
  checkChromeStoreCompliance,
  formatChromeStoreSubmissionChecklist,
  type ChromeStoreAsset,
  type ChromeStoreReleaseArtifacts,
  type ChromeStoreSubmissionMetadata,
  type ChromeExtensionManifest
} from "../apps/extension/src/chromeStoreCompliance";
import { privacyPolicyUrlResponseError, shouldFetchPrivacyPolicyUrl } from "../apps/extension/src/privacyPolicyUrl";

const extensionOutputPath = resolve(process.cwd(), "apps/extension/.output/chrome-mv3");
const manifestPath = resolve(extensionOutputPath, "manifest.json");
const storeAssetsPath = resolve(process.cwd(), "store-assets/chrome-web-store");
const artifacts: ChromeStoreReleaseArtifacts = {
  storeListing: await readText("docs/chrome-web-store-listing.md"),
  permissionJustification: await readText("docs/chrome-web-store-permissions.md"),
  privacyDisclosure: await readText("docs/privacy-disclosure.md"),
  privacyPolicyText: await readText("docs/privacy-policy-public.md"),
  packagedFiles: await listPackageFiles(extensionOutputPath),
  storeAssets: await collectStoreAssets(storeAssetsPath),
  submissionMetadata: await readSubmissionMetadata("store-assets/chrome-web-store/submission.json"),
  sourceFiles: await readSourceAuditFiles([
    "apps/extension/entrypoints/background.ts",
    "apps/extension/entrypoints/popup/App.tsx",
    "apps/extension/entrypoints/offscreen/main.ts",
    "apps/extension/entrypoints/content.ts"
  ])
};
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChromeExtensionManifest;
const result = checkChromeStoreCompliance(manifest, artifacts);
const publishedPrivacyPolicyError = await verifyPublishedPrivacyPolicyUrl(artifacts.submissionMetadata?.privacyPolicyUrl);
if (publishedPrivacyPolicyError) {
  result.errors.push(publishedPrivacyPolicyError);
}
const checklist = buildChromeStoreSubmissionChecklist(result);

for (const warning of result.warnings) {
  console.warn(`[chrome-store warning] ${warning}`);
}

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`[chrome-store error] ${error}`);
  }
  console.error(formatChromeStoreSubmissionChecklist(checklist));
  process.exit(1);
}

console.log(formatChromeStoreSubmissionChecklist(checklist));
console.log("Chrome Web Store compliance gate passed.");

async function readText(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

async function readSourceAuditFiles(paths: string[]) {
  return Promise.all(
    paths.map(async (path) => ({
      path,
      text: await readText(path)
    }))
  );
}

async function readSubmissionMetadata(path: string): Promise<ChromeStoreSubmissionMetadata> {
  const metadataPath = resolve(process.cwd(), path);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as ChromeStoreSubmissionMetadata;
  const privacyPolicyUrl = process.env.CHROME_STORE_PRIVACY_POLICY_URL?.trim() || metadata.privacyPolicyUrl;
  return {
    ...metadata,
    privacyPolicyUrl
  };
}

async function verifyPublishedPrivacyPolicyUrl(url: string | undefined): Promise<string | undefined> {
  if (!shouldFetchPrivacyPolicyUrl(url)) {
    return undefined;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: "follow"
    });
    return privacyPolicyUrlResponseError({
      ok: response.ok,
      status: response.status,
      text: await response.text()
    });
  } catch {
    return "Chrome Web Store privacy policy URL must be reachable and point to the privacy policy.";
  }
}

async function listPackageFiles(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        return listPackageFiles(rootPath, absolutePath);
      }
      return [relative(rootPath, absolutePath).split(sep).join("/")];
    })
  );

  return files.flat().sort();
}

async function collectStoreAssets(rootPath: string): Promise<ChromeStoreAsset[]> {
  const assets: ChromeStoreAsset[] = [];
  await pushImageAssetIfPresent(assets, rootPath, "storeIcon", "icon-128.png");
  await pushImageAssetIfPresent(assets, rootPath, "smallPromoTile", "promo-small-440x280.png");
  await pushImageAssetIfPresent(assets, rootPath, "marqueePromoTile", "promo-marquee-1400x560.png");

  const screenshotPath = join(rootPath, "screenshots");
  if (await pathExists(screenshotPath)) {
    const entries = await readdir(screenshotPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(?:png|jpe?g)$/i.test(entry.name)) {
        await pushImageAssetIfPresent(assets, screenshotPath, "screenshot", entry.name);
      }
    }
  }

  return assets;
}

async function pushImageAssetIfPresent(
  assets: ChromeStoreAsset[],
  rootPath: string,
  role: ChromeStoreAsset["role"],
  filename: string
): Promise<void> {
  const absolutePath = join(rootPath, filename);
  if (!(await pathExists(absolutePath))) {
    return;
  }

  const image = imageInfo(await readFile(absolutePath), absolutePath);
  assets.push({
    role,
    path: relative(process.cwd(), absolutePath).split(sep).join("/"),
    width: image.width,
    height: image.height,
    format: image.format
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function imageInfo(buffer: Buffer, path: string): Pick<ChromeStoreAsset, "width" | "height" | "format"> {
  if (isPng(buffer)) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      format: "png"
    };
  }

  if (isJpeg(buffer)) {
    const size = jpegSize(buffer);
    return {
      width: size.width,
      height: size.height,
      format: "jpeg"
    };
  }

  throw new Error(`Unsupported Chrome Web Store asset format: ${path}`);
}

function isPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function jpegSize(buffer: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (isStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }

  throw new Error("Unable to read JPEG dimensions.");
}

function isStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}
