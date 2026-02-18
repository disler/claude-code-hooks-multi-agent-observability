import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, stat, access, constants } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const SETUP_SCRIPT = resolve(PROJECT_ROOT, "scripts/setup-observability.ts");

/**
 * Integration tests for setup-observability.ts project-type detection.
 *
 * Verifies that the setup script:
 * - Adds obs:* scripts to package.json for JS/TS projects
 * - Creates .observability/obs.sh for Python projects
 * - Never creates or modifies a justfile in the target project
 * - Is idempotent (running twice produces same result)
 */

async function runSetup(
  targetDir: string,
  sourceApp: string = "test-app",
  extraArgs: string[] = []
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    [
      "bun",
      "run",
      SETUP_SCRIPT,
      "--project",
      targetDir,
      "--source-app",
      sourceApp,
      ...extraArgs,
    ],
    {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

// ─── JS/TS Project Tests ────────────────────────────────────

describe("JS/TS project setup (package.json)", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obs-jsts-"));
    // Create a minimal package.json with existing scripts
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-jsts-project",
          version: "1.0.0",
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
          },
        },
        null,
        2
      )
    );
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  test("setup exits 0 for JS/TS project", async () => {
    const result = await runSetup(tempDir);
    expect(result.exitCode).toBe(0);
  });

  test("package.json has obs:start script after setup", async () => {
    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8")
    );
    expect(pkg.scripts["obs:start"]).toBeDefined();
    expect(pkg.scripts["obs:start"]).toContain(".observability/server");
    expect(pkg.scripts["obs:start"]).toContain(".observability/client");
  });

  test("package.json has obs:stop script after setup", async () => {
    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8")
    );
    expect(pkg.scripts["obs:stop"]).toBeDefined();
    expect(pkg.scripts["obs:stop"]).toContain("pkill");
  });

  test("package.json has obs:status script after setup", async () => {
    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8")
    );
    expect(pkg.scripts["obs:status"]).toBeDefined();
    expect(pkg.scripts["obs:status"]).toContain("health");
  });

  test("existing scripts are preserved (not overwritten)", async () => {
    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8")
    );
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts.build).toBe("tsc && vite build");
  });

  test("no justfile is created in JS/TS target project", () => {
    expect(existsSync(join(tempDir, "justfile"))).toBe(false);
    expect(existsSync(join(tempDir, "Justfile"))).toBe(false);
  });

  test("no .observability/obs.sh is created for JS/TS projects", () => {
    expect(existsSync(join(tempDir, ".observability", "obs.sh"))).toBe(false);
  });

  test("idempotent: second run preserves same scripts", async () => {
    const result = await runSetup(tempDir);
    expect(result.exitCode).toBe(0);

    const pkg = JSON.parse(
      await readFile(join(tempDir, "package.json"), "utf-8")
    );
    // Scripts should still be there
    expect(pkg.scripts["obs:start"]).toBeDefined();
    expect(pkg.scripts["obs:stop"]).toBeDefined();
    expect(pkg.scripts["obs:status"]).toBeDefined();
    // Existing scripts still preserved
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts.build).toBe("tsc && vite build");
  });
});

// ─── Python Project Tests ───────────────────────────────────

describe("Python project setup (requirements.txt, no package.json)", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obs-python-"));
    // Create a Python project marker (requirements.txt, no package.json)
    await writeFile(join(tempDir, "requirements.txt"), "flask>=3.0\nrequests\n");
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  test("setup exits 0 for Python project", async () => {
    const result = await runSetup(tempDir, "test-py-app");
    expect(result.exitCode).toBe(0);
  });

  test(".observability/obs.sh exists after setup", () => {
    expect(existsSync(join(tempDir, ".observability", "obs.sh"))).toBe(true);
  });

  test(".observability/obs.sh is executable", async () => {
    try {
      await access(
        join(tempDir, ".observability", "obs.sh"),
        constants.X_OK
      );
      expect(true).toBe(true);
    } catch {
      expect(false).toBe(true); // Force fail if not executable
    }
  });

  test(".observability/obs.sh contains start command", async () => {
    const content = await readFile(
      join(tempDir, ".observability", "obs.sh"),
      "utf-8"
    );
    expect(content).toContain("start)");
    expect(content).toContain("bun run src/index.ts");
    expect(content).toContain("bun run dev");
  });

  test(".observability/obs.sh contains stop command", async () => {
    const content = await readFile(
      join(tempDir, ".observability", "obs.sh"),
      "utf-8"
    );
    expect(content).toContain("stop)");
    expect(content).toContain("pkill");
  });

  test(".observability/obs.sh contains status command", async () => {
    const content = await readFile(
      join(tempDir, ".observability", "obs.sh"),
      "utf-8"
    );
    expect(content).toContain("status)");
    expect(content).toContain("health");
  });

  test("no justfile is created in Python target project", () => {
    expect(existsSync(join(tempDir, "justfile"))).toBe(false);
    expect(existsSync(join(tempDir, "Justfile"))).toBe(false);
  });

  test("no package.json scripts added for Python projects", () => {
    // Python project should not have a package.json at all
    expect(existsSync(join(tempDir, "package.json"))).toBe(false);
  });

  test("idempotent: second run preserves obs.sh", async () => {
    const contentBefore = await readFile(
      join(tempDir, ".observability", "obs.sh"),
      "utf-8"
    );

    const result = await runSetup(tempDir, "test-py-app");
    expect(result.exitCode).toBe(0);

    const contentAfter = await readFile(
      join(tempDir, ".observability", "obs.sh"),
      "utf-8"
    );
    expect(contentAfter).toBe(contentBefore);
  });
});

// ─── Python Project with pyproject.toml ─────────────────────

describe("Python project setup (pyproject.toml, no package.json)", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obs-pyproject-"));
    await writeFile(
      join(tempDir, "pyproject.toml"),
      '[project]\nname = "test-py"\nversion = "0.1.0"\n'
    );
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  test("setup exits 0 for pyproject.toml project", async () => {
    const result = await runSetup(tempDir, "test-pyproject-app");
    expect(result.exitCode).toBe(0);
  });

  test(".observability/obs.sh exists after setup", () => {
    expect(existsSync(join(tempDir, ".observability", "obs.sh"))).toBe(true);
  });

  test("no justfile is created", () => {
    expect(existsSync(join(tempDir, "justfile"))).toBe(false);
  });
});

// ─── CLAUDE.md Template Validation ──────────────────────────

describe("CLAUDE.md template uses correct commands per project type", () => {
  let jsTempDir: string;
  let pyTempDir: string;

  beforeAll(async () => {
    // JS project
    jsTempDir = await mkdtemp(join(tmpdir(), "obs-claudemd-js-"));
    await writeFile(
      join(jsTempDir, "package.json"),
      JSON.stringify({ name: "test-js", version: "0.0.0" })
    );
    await runSetup(jsTempDir, "js-app");

    // Python project
    pyTempDir = await mkdtemp(join(tmpdir(), "obs-claudemd-py-"));
    await writeFile(join(pyTempDir, "requirements.txt"), "flask\n");
    await runSetup(pyTempDir, "py-app");
  });

  afterAll(async () => {
    try {
      await rm(jsTempDir, { recursive: true, force: true });
      await rm(pyTempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  test("JS/TS project CLAUDE.md references bun run obs:start", async () => {
    const content = await readFile(join(jsTempDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("bun run obs:start");
    expect(content).not.toContain("just obs-start");
  });

  test("Python project CLAUDE.md references obs.sh start", async () => {
    const content = await readFile(join(pyTempDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("obs.sh start");
    expect(content).not.toContain("just obs-start");
  });
});
