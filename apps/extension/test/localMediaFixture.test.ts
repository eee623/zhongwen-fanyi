import { describe, expect, it } from "vitest";
import {
  buildFfmpegMp4FixtureCommand,
  buildFfmpegWebmFixtureCommand,
  buildSayFixtureCommand,
  createLocalMediaFixtureInstructions,
  resolveLocalMediaFixturePaths
} from "../src/localMediaFixture";

describe("local media fixture helpers", () => {
  it("resolves deterministic local mp4 and webm fixture paths under manual-test", () => {
    expect(resolveLocalMediaFixturePaths("/repo")).toEqual({
      outputDir: "/repo/manual-test/generated",
      aiffPath: "/repo/manual-test/generated/local-english-source.aiff",
      mp4Path: "/repo/manual-test/generated/local-english-fixture.mp4",
      webmPath: "/repo/manual-test/generated/local-english-fixture.webm"
    });
  });

  it("builds a macOS say command for English speech audio", () => {
    expect(buildSayFixtureCommand("/usr/bin/say", resolveLocalMediaFixturePaths("/repo"), "Hello world", "Samantha")).toEqual({
      command: "/usr/bin/say",
      args: ["-v", "Samantha", "-o", "/repo/manual-test/generated/local-english-source.aiff", "Hello world"]
    });
  });

  it("builds Chrome-playable mp4 and webm ffmpeg commands", () => {
    const paths = resolveLocalMediaFixturePaths("/repo");

    expect(buildFfmpegMp4FixtureCommand("/opt/homebrew/bin/ffmpeg", paths, 12)).toMatchObject({
      command: "/opt/homebrew/bin/ffmpeg",
      args: expect.arrayContaining([
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=30:duration=12",
        "-i",
        paths.aiffPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        paths.mp4Path
      ])
    });
    expect(buildFfmpegWebmFixtureCommand("/opt/homebrew/bin/ffmpeg", paths, 12)).toMatchObject({
      command: "/opt/homebrew/bin/ffmpeg",
      args: expect.arrayContaining(["-c:v", "libvpx-vp9", "-c:a", "libopus", paths.webmPath])
    });
  });

  it("prints manual acceptance instructions for the generated files", () => {
    const instructions = createLocalMediaFixtureInstructions(resolveLocalMediaFixturePaths("/repo"));

    expect(instructions).toContain("local-english-fixture.mp4");
    expect(instructions).toContain("local-english-fixture.webm");
    expect(instructions).toContain("Allow access to file URLs");
    expect(instructions).toContain("manual:mock");
  });
});
