export interface LocalMediaFixturePaths {
  outputDir: string;
  aiffPath: string;
  mp4Path: string;
  webmPath: string;
}

export interface ShellCommand {
  command: string;
  args: string[];
}

export function resolveLocalMediaFixturePaths(repoRoot: string, outputDir = `${repoRoot}/manual-test/generated`): LocalMediaFixturePaths {
  return {
    outputDir,
    aiffPath: `${outputDir}/local-english-source.aiff`,
    mp4Path: `${outputDir}/local-english-fixture.mp4`,
    webmPath: `${outputDir}/local-english-fixture.webm`
  };
}

export function buildSayFixtureCommand(
  sayPath: string,
  paths: Pick<LocalMediaFixturePaths, "aiffPath">,
  speechText: string,
  voice = "Samantha"
): ShellCommand {
  return {
    command: sayPath,
    args: ["-v", voice, "-o", paths.aiffPath, speechText]
  };
}

export function buildFfmpegMp4FixtureCommand(
  ffmpegPath: string,
  paths: Pick<LocalMediaFixturePaths, "aiffPath" | "mp4Path">,
  durationSeconds = 12
): ShellCommand {
  return {
    command: ffmpegPath,
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=1280x720:rate=30:duration=${durationSeconds}`,
      "-i",
      paths.aiffPath,
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      paths.mp4Path
    ]
  };
}

export function buildFfmpegWebmFixtureCommand(
  ffmpegPath: string,
  paths: Pick<LocalMediaFixturePaths, "aiffPath" | "webmPath">,
  durationSeconds = 12
): ShellCommand {
  return {
    command: ffmpegPath,
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=1280x720:rate=30:duration=${durationSeconds}`,
      "-i",
      paths.aiffPath,
      "-shortest",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "1M",
      "-c:a",
      "libopus",
      paths.webmPath
    ]
  };
}

export function createLocalMediaFixtureInstructions(paths: Pick<LocalMediaFixturePaths, "mp4Path" | "webmPath">): string {
  return [
    "Local media fixtures generated.",
    "",
    `- MP4: ${paths.mp4Path}`,
    `- WebM: ${paths.webmPath}`,
    "",
    "Manual acceptance path:",
    "1. Run npm run manual:mock.",
    "2. Open the MP4 or WebM file in the launched Chrome for Testing profile.",
    "3. Enable Allow access to file URLs for the extension if Chrome blocks local file pages.",
    "4. Play the file, open the extension popup, and start mock dubbing."
  ].join("\n");
}
