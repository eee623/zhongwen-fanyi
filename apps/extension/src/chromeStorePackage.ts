export function createChromeStorePackageCommand(): string {
  return "npm run check:chrome-store && npm run zip -w @realtime-dubbing/extension";
}
