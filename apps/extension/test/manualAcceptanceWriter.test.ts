import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeManualAcceptanceReportTemplate } from "../src/manualAcceptanceWriter";

describe("manual acceptance report writer", () => {
  it("does not overwrite an existing manual acceptance report unless forced", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manual-acceptance-writer-"));
    const path = join(dir, "manual-acceptance-report.md");

    try {
      await writeManualAcceptanceReportTemplate(path, {
        generatedAt: "2026-06-23T00:00:00.000Z",
        force: true
      });
      await expect(
        writeManualAcceptanceReportTemplate(path, {
          generatedAt: "2026-06-23T00:01:00.000Z"
        })
      ).rejects.toThrow("already exists");

      const existing = await readFile(path, "utf8");
      expect(existing).toContain("2026-06-23T00:00:00.000Z");
      expect(existing).not.toContain("2026-06-23T00:01:00.000Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites the report when force is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "manual-acceptance-writer-"));
    const path = join(dir, "manual-acceptance-report.md");

    try {
      await writeManualAcceptanceReportTemplate(path, {
        generatedAt: "2026-06-23T00:00:00.000Z",
        force: true
      });
      await writeManualAcceptanceReportTemplate(path, {
        generatedAt: "2026-06-23T00:01:00.000Z",
        force: true
      });

      const overwritten = await readFile(path, "utf8");
      expect(overwritten).toContain("2026-06-23T00:01:00.000Z");
      expect(overwritten).not.toContain("2026-06-23T00:00:00.000Z");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
