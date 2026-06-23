import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrivacyPolicySite } from "./privacySite";

const policyPath = fileURLToPath(new URL("../../../docs/privacy-policy-public.md", import.meta.url));
const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

const policyMarkdown = await readFile(policyPath, "utf8");
const site = buildPrivacyPolicySite(policyMarkdown, {
  canonicalUrl: process.env.PRIVACY_POLICY_CANONICAL_URL
});

await rm(distRoot, { recursive: true, force: true });

for (const [path, content] of Object.entries(site.files)) {
  const outputPath = fileURLToPath(new URL(path, `file://${distRoot}/`));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

console.log(`Privacy policy site built at ${distRoot}`);
