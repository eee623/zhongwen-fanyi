import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  buildChromeLaunchArgs,
  createManualChromeInstructions,
  findChromeExecutable,
  findManualExtensionChromeExecutable,
  resolveManualChromePaths
} from "../apps/extension/src/manualChromeLauncher";

const repoRoot = resolve(process.cwd());
const paths = resolveManualChromePaths(repoRoot, {
  profileDir: process.env.CHROME_PROFILE_DIR ? resolve(process.env.CHROME_PROFILE_DIR) : undefined
});

assertExists(paths.extensionDir, "Built extension directory is missing. Run npm run build first.");
assertExists(paths.manualPageFile, "Manual HTML5 test page is missing.");
mkdirSync(paths.profileDir, { recursive: true });

const chrome = findManualExtensionChromeExecutable(repoRoot) ?? findChromeExecutable();
if (!chrome) {
  console.error("Google Chrome or Chromium was not found.");
  process.exit(1);
}

console.log(createManualChromeInstructions(paths));
console.log("");
console.log(`Launching: ${chrome}`);

const child = spawn(chrome, buildChromeLaunchArgs(paths), {
  detached: true,
  stdio: "ignore"
});
child.unref();

function assertExists(path: string, message: string): void {
  if (!existsSync(path)) {
    console.error(message);
    console.error(path);
    process.exit(1);
  }
}
