import { describe, expect, it } from "vitest";
import { createChromeStorePackageCommand } from "../src/chromeStorePackage";

describe("Chrome Web Store package command", () => {
  it("runs the compliance gate before creating an upload zip", () => {
    const command = createChromeStorePackageCommand();

    expect(command).toBe("npm run check:chrome-store && npm run zip -w @realtime-dubbing/extension");
  });
});
