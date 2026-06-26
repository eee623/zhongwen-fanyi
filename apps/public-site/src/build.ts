import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublicSite } from "./publicSite";

const policyPath = fileURLToPath(new URL("../../../docs/privacy-policy-public.md", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const projectRoot = new URL("../../../", import.meta.url);

const policyMarkdown = await readFile(policyPath, "utf8");
const site = buildPublicSite(policyMarkdown, {
  publicBaseUrl: process.env.PUBLIC_SITE_BASE_URL,
  publicBasePath: process.env.PUBLIC_SITE_BASE_PATH
});

await rm(distRoot, { recursive: true, force: true });

for (const [path, content] of Object.entries(site.files)) {
  const outputPath = fileURLToPath(new URL(path, `file://${distRoot}/`));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

for (const asset of site.assets) {
  const outputPath = fileURLToPath(new URL(asset.outputPath, `file://${distRoot}/`));
  const sourcePath = fileURLToPath(new URL(asset.sourcePath, projectRoot));
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

console.log(`Public site built at ${distRoot}`);
