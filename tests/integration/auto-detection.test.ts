import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const TEST_PORT = 4099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let originalRules: any[] = [];

/**
 * Helper to create a minimal valid HookEvent payload for POST /events.
 */
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    source_app: "auto-detect-test",
    session_id: "auto-detect-session",
    hook_event_type: "PostToolUse",
    payload: { tool_name: "Bash", tool_input: { command: "echo ok" } },
    timestamp: Date.now(),
    ...overrides,
  };
}

beforeAll(async () => {
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

  // Save original rules
  const rulesRes = await fetch(`${BASE_URL}/signals/rules`);
  const rulesBody = await rulesRes.json();
  originalRules = rulesBody.rules || [];
});

afterAll(async () => {
  // Restore original rules
  await fetch(`${BASE_URL}/signals/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: originalRules }),
  });

  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

// ---------------------------------------------------------------------------
// Auto-detection rule matching
// ---------------------------------------------------------------------------
describe("Auto-detection rule matching", () => {
  describe("setup: configure test rules via API", () => {
    test("POST /signals/rules sets up auto-detect rules", async () => {
      const testRules = [
        {
          name: "test_failure_detect",
          description: "Detect test failures",
          hook_event_type: "PostToolUseFailure",
          payload_match: "test|jest|vitest|bun test",
          auto_tag: ["learning_signal", "test_failure"],
        },
        {
          name: "build_failure_detect",
          description: "Detect build failures",
          hook_event_type: "PostToolUseFailure",
          payload_match: "build|compile|tsc",
          auto_tag: ["learning_signal", "build_failure"],
        },
        {
          name: "catch_all_failures",
          description: "Catch all tool failures",
          hook_event_type: "PostToolUseFailure",
          payload_match: ".*",
          auto_tag: ["agent_error"],
        },
      ];

      const res = await fetch(`${BASE_URL}/signals/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: testRules }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rules.length).toBe(3);
    });
  });

  describe("insert PostToolUseFailure with 'test' in payload and verify tagging", () => {
    let failureEventId: number;

    test("creates a PostToolUseFailure event with 'test' keyword in payload", async () => {
      const event = makeEvent({
        hook_event_type: "PostToolUseFailure",
        payload: {
          tool_name: "Bash",
          tool_input: { command: "bun test src/" },
          error: "Test suite failed: 3 failures",
          is_interrupt: false,
        },
      });

      const res = await fetch(`${BASE_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      expect(res.status).toBe(200);
      const saved = await res.json();
      failureEventId = saved.id;
      expect(typeof failureEventId).toBe("number");
    });

    test("can tag the failure event with auto-detect tags via API", async () => {
      // Simulate what the Python hook's check_auto_detect_rules would do:
      // Read the rules, check if the event matches, then POST /events/:id/tag

      // Read rules
      const rulesRes = await fetch(`${BASE_URL}/signals/rules`);
      const rulesBody = await rulesRes.json();
      const rules = rulesBody.rules;

      // Get the event we just created
      const queryRes = await fetch(`${BASE_URL}/events/query?type=PostToolUseFailure&limit=1`);
      const queryBody = await queryRes.json();
      expect(queryBody.events.length).toBeGreaterThanOrEqual(1);

      const event = queryBody.events[0];
      const payloadStr = JSON.stringify(event.payload);

      // Find matching rules
      const matchingTags: string[] = [];
      for (const rule of rules) {
        if (rule.hook_event_type !== "PostToolUseFailure") continue;
        const regex = new RegExp(rule.payload_match, "i");
        if (regex.test(payloadStr)) {
          matchingTags.push(...rule.auto_tag);
        }
      }

      // Should match test_failure_detect (has "test") and catch_all_failures (.*)
      expect(matchingTags).toContain("learning_signal");
      expect(matchingTags).toContain("test_failure");
      expect(matchingTags).toContain("agent_error");

      // Tag the event
      const tagRes = await fetch(`${BASE_URL}/events/${event.id}/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: [...new Set(matchingTags)],
          note: "Auto-detected by rule: test_failure_detect, catch_all_failures",
        }),
      });

      expect(tagRes.status).toBe(200);
      const tagged = await tagRes.json();
      expect(tagged.tags).toContain("learning_signal");
      expect(tagged.tags).toContain("test_failure");
      expect(tagged.tags).toContain("agent_error");
      expect(tagged.notes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("pattern matching with various regex patterns", () => {
    test("exact keyword match: 'build' matches build failure rule", () => {
      const pattern = "build|compile|tsc";
      const payload = JSON.stringify({ error: "build failed: exit code 1" });
      expect(new RegExp(pattern, "i").test(payload)).toBe(true);
    });

    test("partial keyword match: 'compile' appears as substring", () => {
      const pattern = "build|compile|tsc";
      // Note: "compilation" does NOT match "compile" -- regex is exact substring
      const payloadMatch = JSON.stringify({ error: "Failed to compile module" });
      expect(new RegExp(pattern, "i").test(payloadMatch)).toBe(true);

      // "compilation" does not contain "compile" (compil + ation, not compil + e)
      const payloadNoMatch = JSON.stringify({ error: "TypeScript compilation error" });
      expect(new RegExp(pattern, "i").test(payloadNoMatch)).toBe(false);
    });

    test("case-insensitive match: 'TEST' matches test failure rule", () => {
      const pattern = "test|jest|vitest|bun test";
      const payload = JSON.stringify({ command: "bun TEST src/" });
      expect(new RegExp(pattern, "i").test(payload)).toBe(true);
    });

    test("catch-all pattern '.*' matches any payload", () => {
      const pattern = ".*";
      const payloads = [
        JSON.stringify({ anything: "goes" }),
        JSON.stringify({ error: "" }),
        JSON.stringify({}),
      ];
      for (const payload of payloads) {
        expect(new RegExp(pattern, "i").test(payload)).toBe(true);
      }
    });

    test("no match when payload does not contain keywords", () => {
      const pattern = "test|jest|vitest|bun test";
      const payload = JSON.stringify({ tool_name: "Read", tool_input: { file: "src/db.ts" } });
      expect(new RegExp(pattern, "i").test(payload)).toBe(false);
    });

    test("pipe-separated patterns work as OR conditions", () => {
      const pattern = "webpack|esbuild|rollup";
      expect(new RegExp(pattern, "i").test("webpack build failed")).toBe(true);
      expect(new RegExp(pattern, "i").test("esbuild error")).toBe(true);
      expect(new RegExp(pattern, "i").test("rollup bundle")).toBe(true);
      expect(new RegExp(pattern, "i").test("vite dev server")).toBe(false);
    });
  });

  describe("end-to-end: non-matching event should not be auto-tagged", () => {
    test("PostToolUse event does not match PostToolUseFailure rules", async () => {
      // Create a PostToolUse (success) event
      const event = makeEvent({
        hook_event_type: "PostToolUse",
        payload: {
          tool_name: "Read",
          tool_input: { file: "test.ts" },
          tool_response: { content: "file content" },
        },
      });

      const res = await fetch(`${BASE_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      const saved = await res.json();

      // Read rules and check - none should match PostToolUse
      const rulesRes = await fetch(`${BASE_URL}/signals/rules`);
      const rulesBody = await rulesRes.json();

      const matchingRules = rulesBody.rules.filter(
        (r: any) => r.hook_event_type === "PostToolUse"
      );
      // All our test rules target PostToolUseFailure, not PostToolUse
      expect(matchingRules.length).toBe(0);
    });
  });
});
