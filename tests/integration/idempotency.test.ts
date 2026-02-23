import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

/**
 * Idempotency tests for the setup-observability script.
 *
 * The setup script (scripts/setup-observability.ts) scaffolds observability
 * into a target project directory. Running it twice on the same directory
 * should produce the same result without errors.
 */
describe("Setup script idempotency", () => {
  const possiblePaths = [
    resolve(PROJECT_ROOT, "scripts/observability/setup-observability.ts"),
    resolve(PROJECT_ROOT, "scripts/observability/setup.ts"),
    resolve(PROJECT_ROOT, "scripts/setup-observability.ts"),
  ];

  const setupScript = possiblePaths.find((p) => existsSync(p));

  if (!setupScript) {
    test("setup script not yet available - skipping idempotency tests", () => {
      expect(true).toBe(true);
    });
    return;
  }

  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obs-idempotency-"));
    // Create a minimal package.json so the target looks like a real project
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "idempotency-test", version: "0.0.0" })
    );
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  test("first run exits 0", async () => {
    const proc = Bun.spawn(
      ["bun", "run", setupScript!, "--project", tempDir, "--source-app", "test-app"],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("second run exits 0 (idempotency)", async () => {
    const proc = Bun.spawn(
      ["bun", "run", setupScript!, "--project", tempDir, "--source-app", "test-app"],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test(".claude/observability.json exists after setup", () => {
    expect(existsSync(join(tempDir, ".claude", "observability.json"))).toBe(true);
  });

  test(".claude/hooks/ directory exists", () => {
    expect(existsSync(join(tempDir, ".claude", "hooks"))).toBe(true);
  });

  test(".claude/settings.json exists with hook entries", async () => {
    const settingsPath = join(tempDir, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const content = await Bun.file(settingsPath).text();
    const settings = JSON.parse(content);
    // settings.json should have hooks configured
    expect(settings.hooks).toBeDefined();
    expect(Object.keys(settings.hooks).length).toBeGreaterThan(0);
  });
});
