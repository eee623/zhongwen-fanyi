import { createPublicSiteReleaseUrls, publicSiteReleaseEnv } from "../apps/public-site/src/releaseUrls";

const baseUrl = process.argv[2] ?? process.env.PUBLIC_SITE_BASE_URL;

if (!baseUrl) {
  console.error("Usage: npm run public-site:release-urls -- https://your-public-site.example");
  process.exit(1);
}

try {
  const urls = createPublicSiteReleaseUrls(baseUrl);
  console.log(JSON.stringify(urls, null, 2));
  console.log("");
  console.log(publicSiteReleaseEnv(urls));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
