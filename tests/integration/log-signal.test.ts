import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const TEST_PORT = 4098;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const LOG_SIGNAL_PATH = resolve(PROJECT_ROOT, "scripts/observability/log-signal.ts");

/**
 * The log-signal CLI reads server_url from .claude/observability.json.
 * We start a test server on port 4099. The CLI needs to talk to it,
 * so we create a temp config that points to our test port.
 */
let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let originalConfig: string | null = null;
const configPath = resolve(PROJECT_ROOT, ".claude/observability.json");

beforeAll(async () => {
  // Save original config and patch server_url to test port
  const configFile = Bun.file(configPath);
  if (await configFile.exists()) {
    originalConfig = await configFile.text();
    const config = JSON.parse(originalConfig);
    config.server_url = `http://localhost:${TEST_PORT}`;
    await Bun.write(configPath, JSON.stringify(config, null, 2));
  }

  serverProc = Bun.spawn(["bun", "run", resolve(PROJECT_ROOT, "apps/server/src/index.ts")], {
    env: { ...process.env, SERVER_PORT: String(TEST_PORT) },
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server readiness
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) break;
    } catch {
      // not ready
    }
    await Bun.sleep(200);
  }
});

afterAll(async () => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
  // Restore original config
  if (originalConfig !== null) {
    await Bun.write(configPath, originalConfig);
  }
});

describe("log-signal CLI", () => {
  test("--help prints usage and exits 0", async () => {
    const proc = Bun.spawn(["bun", "run", LOG_SIGNAL_PATH, "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--type");
    expect(stdout).toContain("--context");
  });

  test("creates signal with --type and --context", async () => {
    const uniqueType = `integration_test_${Date.now()}`;
    const proc = Bun.spawn(
      [
        "bun",
        "run",
        LOG_SIGNAL_PATH,
        "--type",
        uniqueType,
        "--context",
        JSON.stringify({ test: "log-signal.test.ts", scenario: "basic" }),
      ],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CLAUDE_SOURCE_APP: "test-cli",
          CLAUDE_SESSION_ID: "cli-session-001",
        },
      }
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    // The script outputs the created event as JSON on success
    if (stdout.trim()) {
      const result = JSON.parse(stdout.trim());
      expect(result.hook_event_type).toBe("ExplicitSignal");
      expect(result.payload.type).toBe(uniqueType);
    }

    // Verify it exists in the test server
    const queryRes = await fetch(`${BASE_URL}/events/query?type=ExplicitSignal&limit=10`);
    const queryBody = await queryRes.json();
    const match = queryBody.events.find(
      (e: any) => e.payload?.type === uniqueType
    );
    expect(match).toBeDefined();
  });

  test("creates signal with --tags", async () => {
    const proc = Bun.spawn(
      [
        "bun",
        "run",
        LOG_SIGNAL_PATH,
        "--type",
        "tagged_signal",
        "--context",
        "{}",
        "--tags",
        "flaky,auth,critical",
      ],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CLAUDE_SOURCE_APP: "test-cli",
          CLAUDE_SESSION_ID: "cli-session-tags",
        },
      }
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    if (stdout.trim()) {
      const result = JSON.parse(stdout.trim());
      expect(result.tags).toContain("flaky");
      expect(result.tags).toContain("auth");
      expect(result.tags).toContain("critical");
    }
  });

  test("exits 0 when --type is missing (never blocks Claude)", async () => {
    const proc = Bun.spawn(
      ["bun", "run", LOG_SIGNAL_PATH, "--context", '{"foo": "bar"}'],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
