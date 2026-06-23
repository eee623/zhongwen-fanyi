import { existsSync, mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import {
  buildChromeLaunchArgs,
  buildManualAliyunApiEnv,
  chromeJsonListUrl,
  createManualAliyunHelpText,
  createManualAliyunInstructions,
  createManualSessionTargetEvidence,
  findChromeExecutable,
  findExtensionTarget,
  findManualExtensionChromeExecutable,
  findManualPageTarget,
  mockApiHealthUrl,
  readChromeDebugTargets,
  resolveManualAliyunSessionPaths,
  stageExtensionForChrome
} from "../apps/extension/src/manualChromeLauncher";
import { runAliConnectivityCheck } from "../apps/api/src/aliConnectivityCheck";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(createManualAliyunHelpText());
  process.exit(0);
}

const repoRoot = resolve(process.cwd());
const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const chromeDebugPort = Number.parseInt(process.env.CHROME_DEBUG_PORT ?? "9223", 10);
const paths = resolveManualAliyunSessionPaths(repoRoot, {
  profileDir: process.env.CHROME_PROFILE_DIR ? resolve(process.env.CHROME_PROFILE_DIR) : undefined
});

assertExists(paths.extensionDir, "Built extension directory is missing. Run npm run build first.");
assertExists(paths.manualPageFile, "Manual HTML5 test page is missing.");
assertExists(`${repoRoot}/apps/api/dist/server.js`, "Built API server is missing. Run npm run build first.");
mkdirSync(paths.profileDir, { recursive: true });
mkdirSync(paths.dataDir, { recursive: true });
const stagedExtension = stageExtensionForChrome(paths.extensionDir);
const chromePaths = {
  ...paths,
  extensionDir: stagedExtension.extensionDir
};

const chrome = findManualExtensionChromeExecutable(repoRoot) ?? findChromeExecutable();
if (!chrome) {
  console.error("Google Chrome or Chromium was not found.");
  process.exit(1);
}

const preflight = await runAliConnectivityCheck({
  apiKey: process.env.DASHSCOPE_API_KEY,
  endpoint: process.env.ALI_LIVE_TRANSLATE_ENDPOINT ?? "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
});
if (!preflight.ok) {
  console.error(`Aliyun realtime preflight failed: ${preflight.reason}${preflight.code ? ` (${preflight.code})` : ""}.`);
  if (preflight.message) {
    console.error(preflight.message);
  }
  process.exit(1);
}

const api = spawn(process.execPath, [`${repoRoot}/apps/api/dist/server.js`], {
  cwd: repoRoot,
  env: buildManualAliyunApiEnv(paths, process.env, port),
  stdio: ["ignore", "pipe", "pipe"]
});

api.stdout?.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
api.stderr?.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
api.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Aliyun API exited unexpectedly: code=${code ?? "null"} signal=${signal ?? "null"}`);
    process.exit(code ?? 1);
  }
});

let shuttingDown = false;
try {
  await waitForHealth(port);
  console.log(`Aliyun realtime preflight passed: ${preflight.readyEventType} in ${preflight.elapsedMs}ms.`);
  console.log(createManualAliyunInstructions(paths, port));
  console.log("");
  console.log(`Launching: ${chrome}`);

  const chromeProcess = spawn(chrome, buildChromeLaunchArgs(chromePaths, { remoteDebuggingPort: chromeDebugPort }), {
    detached: true,
    stdio: "ignore"
  });
  chromeProcess.unref();
  console.log(await waitForManualSessionTargets(chromeDebugPort));

  process.stdin.resume();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(api);
  process.exit(1);
}

process.on("SIGINT", () => shutdown(api));
process.on("SIGTERM", () => shutdown(api));

async function waitForHealth(apiPort: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  const url = mockApiHealthUrl(apiPort);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Aliyun API did not become healthy: ${url}`);
}

async function waitForManualSessionTargets(debugPort: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  const url = chromeJsonListUrl(debugPort);
  let latestTargets: Array<{ type?: string; title?: string; url?: string }> = [];
  while (Date.now() < deadline) {
    try {
      const targets = await readChromeDebugTargets(url);
      latestTargets = targets;
      if (findManualPageTarget(targets, paths) && findExtensionTarget(targets)) {
        return createManualSessionTargetEvidence(targets, paths);
      }
    } catch {
      // Chrome DevTools endpoint is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return createManualSessionTargetEvidence(latestTargets, paths);
}

function shutdown(apiProcess: ChildProcess): void {
  shuttingDown = true;
  apiProcess.kill("SIGTERM");
  stagedExtension.cleanup();
  process.exit(0);
}

function assertExists(path: string, message: string): void {
  if (!existsSync(path)) {
    console.error(message);
    console.error(path);
    process.exit(1);
  }
}
