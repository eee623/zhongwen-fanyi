import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  buildFfmpegMp4FixtureCommand,
  buildFfmpegWebmFixtureCommand,
  buildSayFixtureCommand,
  createLocalMediaFixtureInstructions,
  resolveLocalMediaFixturePaths,
  type ShellCommand
} from "../apps/extension/src/localMediaFixture";

const repoRoot = resolve(process.cwd());
const outputDir = resolve(process.env.LOCAL_MEDIA_FIXTURE_DIR ?? `${repoRoot}/manual-test/generated`);
const durationSeconds = parsePositiveInteger(process.env.LOCAL_MEDIA_FIXTURE_SECONDS ?? "12", "LOCAL_MEDIA_FIXTURE_SECONDS");
const speechText =
  process.env.LOCAL_MEDIA_FIXTURE_TEXT ??
  "Hello, this is a local MP4 and WebM playback test for real time Chinese dubbing.";
const voice = process.env.LOCAL_MEDIA_FIXTURE_VOICE ?? "Samantha";

const paths = resolveLocalMediaFixturePaths(repoRoot, outputDir);
mkdirSync(paths.outputDir, { recursive: true });

const sayPath = requireCommand("say", ["/usr/bin/say"]);
const ffmpegPath = requireCommand("ffmpeg", ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);

runCommand(buildSayFixtureCommand(sayPath, paths, speechText, voice));
runCommand(buildFfmpegMp4FixtureCommand(ffmpegPath, paths, durationSeconds));
runCommand(buildFfmpegWebmFixtureCommand(ffmpegPath, paths, durationSeconds));

console.log(createLocalMediaFixtureInstructions(paths));

function requireCommand(name: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const result = spawnSync("/usr/bin/env", ["which", name], { encoding: "utf8" });
  const resolved = result.stdout.trim();
  if (result.status === 0 && resolved) {
    return resolved;
  }
  throw new Error(`Required command not found: ${name}.`);
}

function runCommand(command: ShellCommand): void {
  const result = spawnSync(command.command, command.args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command.command} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
