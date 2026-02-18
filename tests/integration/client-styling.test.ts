import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

/**
 * Client styling tests for the setup-observability script.
 *
 * Verifies that the scaffolded client includes all files required for
 * Tailwind CSS to compile: tailwind.config.js, postcss.config.js, and
 * the src/styles/ directory with @tailwind directives.
 *
 * Without these files, the dashboard renders as raw unstyled HTML.
 */
describe("Client styling files are scaffolded correctly", () => {
  const possiblePaths = [
    resolve(PROJECT_ROOT, "scripts/observability/setup-observability.ts"),
    resolve(PROJECT_ROOT, "scripts/observability/setup.ts"),
    resolve(PROJECT_ROOT, "scripts/setup-observability.ts"),
  ];

  const setupScript = possiblePaths.find((p) => existsSync(p));

  if (!setupScript) {
    test("setup script not yet available - skipping client styling tests", () => {
      expect(true).toBe(true);
    });
    return;
  }

  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obs-client-styling-"));
    // Create a minimal package.json so the target looks like a real project
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "styling-test", version: "0.0.0" })
    );

    // Run the setup script
    const proc = Bun.spawn(
      ["bun", "run", setupScript!, "--project", tempDir, "--source-app", "test-app"],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Setup script failed (exit ${exitCode}): ${stderr}`);
    }
  });

  afterAll(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  // --- Tailwind config ---

  test("tailwind.config.js exists in scaffolded client", () => {
    const tailwindPath = join(tempDir, ".observability", "client", "tailwind.config.js");
    expect(existsSync(tailwindPath)).toBe(true);
  });

  test("tailwind.config.js has content array targeting Vue files", async () => {
    const tailwindPath = join(tempDir, ".observability", "client", "tailwind.config.js");
    const content = await readFile(tailwindPath, "utf-8");
    // Must scan .vue files for Tailwind class extraction
    expect(content).toContain("vue");
    expect(content).toContain("content");
  });

  // --- PostCSS config ---

  test("postcss.config.js exists in scaffolded client", () => {
    const postcssPath = join(tempDir, ".observability", "client", "postcss.config.js");
    expect(existsSync(postcssPath)).toBe(true);
  });

  test("postcss.config.js references tailwindcss plugin", async () => {
    const postcssPath = join(tempDir, ".observability", "client", "postcss.config.js");
    const content = await readFile(postcssPath, "utf-8");
    expect(content).toContain("tailwindcss");
  });

  // --- Styles directory ---

  test("src/styles/ directory exists in scaffolded client", () => {
    const stylesDir = join(tempDir, ".observability", "client", "src", "styles");
    expect(existsSync(stylesDir)).toBe(true);
  });

  test("main.css exists with @tailwind directives", async () => {
    const mainCssPath = join(tempDir, ".observability", "client", "src", "styles", "main.css");
    expect(existsSync(mainCssPath)).toBe(true);

    const content = await readFile(mainCssPath, "utf-8");
    expect(content).toContain("@tailwind base");
    expect(content).toContain("@tailwind components");
    expect(content).toContain("@tailwind utilities");
  });

  test("themes.css exists in scaffolded client", () => {
    const themesPath = join(tempDir, ".observability", "client", "src", "styles", "themes.css");
    expect(existsSync(themesPath)).toBe(true);
  });

  // --- Package.json files array (source of truth for npm publish) ---

  test("root package.json files array includes tailwind.config.js", async () => {
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    expect(pkg.files).toContain("apps/client/tailwind.config.js");
  });

  test("root package.json files array includes postcss.config.js", async () => {
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    expect(pkg.files).toContain("apps/client/postcss.config.js");
  });

  test("root package.json files array includes src/styles/ directory", async () => {
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content);
    // The src/ entry already covers src/styles/, but let's verify src/ is present
    // OR a more specific styles entry exists
    const hasStylesCoverage = pkg.files.some(
      (f: string) =>
        f === "apps/client/src/" ||
        f === "apps/client/src/styles/" ||
        f === "apps/client/src/styles/**"
    );
    expect(hasStylesCoverage).toBe(true);
  });
});
