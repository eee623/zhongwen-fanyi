import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCheckoutSite } from "./checkoutSite";

const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const site = buildCheckoutSite();

await rm(distRoot, { recursive: true, force: true });

for (const [path, content] of Object.entries(site.files)) {
  const outputPath = fileURLToPath(new URL(path, `file://${distRoot}/`));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

console.log(`Checkout site built at ${distRoot}`);
