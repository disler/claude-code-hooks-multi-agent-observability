import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const TEST_PORT = 4099;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB_PATH = resolve(PROJECT_ROOT, "events.test.db");

let serverProc: ReturnType<typeof Bun.spawn> | null = null;

/**
 * Helper to create a minimal valid HookEvent payload for POST /events.
 */
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    source_app: "test-runner",
    session_id: "test-session-001",
    hook_event_type: "PostToolUse",
    payload: { tool_name: "Bash", tool_input: { command: "echo hello" } },
    timestamp: Date.now(),
    ...overrides,
  };
}

beforeAll(async () => {
  // Remove stale test DB if present
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  serverProc = Bun.spawn(["bun", "run", resolve(PROJECT_ROOT, "apps/server/src/index.ts")], {
    env: { ...process.env, SERVER_PORT: String(TEST_PORT) },
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to be ready (up to 4 seconds)
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(200);
  }

  if (!ready) {
    throw new Error("Test server failed to start on port " + TEST_PORT);
  }
});

afterAll(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  test("returns status ok with uptime", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// POST /events - create events
// ---------------------------------------------------------------------------
describe("POST /events", () => {
  test("creates an event and returns it with an id", async () => {
    const event = makeEvent();
    const res = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(typeof saved.id).toBe("number");
    expect(saved.source_app).toBe("test-runner");
    expect(saved.session_id).toBe("test-session-001");
    expect(saved.hook_event_type).toBe("PostToolUse");
  });

  test("rejects event missing required fields", async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_app: "x" }), // missing session_id, hook_event_type, payload
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /events/query
// ---------------------------------------------------------------------------
describe("GET /events/query", () => {
  // Seed some events before query tests
  let seededIds: number[] = [];

  beforeAll(async () => {
    const types = ["PostToolUse", "PostToolUseFailure", "ExplicitSignal"];
    for (const type of types) {
      const res = await fetch(`${BASE_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          makeEvent({
            hook_event_type: type,
            tags: type === "ExplicitSignal" ? ["signal-tag"] : [],
          })
        ),
      });
      const saved = await res.json();
      seededIds.push(saved.id);
    }
  });

  test("returns events filtered by type", async () => {
    const res = await fetch(`${BASE_URL}/events/query?type=PostToolUseFailure`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toBeInstanceOf(Array);
    expect(body.total).toBeGreaterThanOrEqual(1);
    for (const event of body.events) {
      expect(event.hook_event_type).toBe("PostToolUseFailure");
    }
  });

  test("supports limit and offset", async () => {
    const res = await fetch(`${BASE_URL}/events/query?limit=1&offset=0`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events.length).toBeLessThanOrEqual(1);
    expect(typeof body.total).toBe("number");
  });

  test("supports tag filter", async () => {
    const res = await fetch(`${BASE_URL}/events/query?tag=signal-tag`);
    expect(res.status).toBe(200);

    const body = await res.json();
    // All returned events should contain the tag
    for (const event of body.events) {
      expect(event.tags).toContain("signal-tag");
    }
  });
});

// ---------------------------------------------------------------------------
// POST /events/:id/tag
// ---------------------------------------------------------------------------
describe("POST /events/:id/tag", () => {
  let eventId: number;

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeEvent({ tags: [] })),
    });
    const saved = await res.json();
    eventId = saved.id;
  });

  test("adds tags to an event", async () => {
    const res = await fetch(`${BASE_URL}/events/${eventId}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["important", "reviewed"] }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.tags).toContain("important");
    expect(updated.tags).toContain("reviewed");
  });

  test("merges tags without duplicates on second call", async () => {
    // Tag again with overlap
    const res = await fetch(`${BASE_URL}/events/${eventId}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["important", "new-tag"] }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    // Should have all three unique tags
    expect(updated.tags).toContain("important");
    expect(updated.tags).toContain("reviewed");
    expect(updated.tags).toContain("new-tag");
    // No duplicate "important"
    const importantCount = updated.tags.filter((t: string) => t === "important").length;
    expect(importantCount).toBe(1);
  });

  test("adds a note with timestamp when note is provided", async () => {
    const res = await fetch(`${BASE_URL}/events/${eventId}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["noted"], note: "This was a flaky test" }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.notes).toBeInstanceOf(Array);
    expect(updated.notes.length).toBeGreaterThanOrEqual(1);

    const lastNote = updated.notes[updated.notes.length - 1];
    expect(lastNote.text).toBe("This was a flaky test");
    expect(typeof lastNote.timestamp).toBe("number");
    expect(lastNote.source).toBe("api");
  });

  test("returns 400 when tags is not an array", async () => {
    const res = await fetch(`${BASE_URL}/events/${eventId}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: "not-an-array" }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent event", async () => {
    const res = await fetch(`${BASE_URL}/events/999999/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["x"] }),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /signals/rules & POST /signals/rules
// ---------------------------------------------------------------------------
describe("Signals rules API", () => {
  let originalRules: any[] = [];

  beforeAll(async () => {
    // Save original rules so we can restore them after mutation tests
    const res = await fetch(`${BASE_URL}/signals/rules`);
    const body = await res.json();
    originalRules = body.rules || [];
  });

  afterAll(async () => {
    // Restore original rules to avoid polluting .claude/observability.json
    await fetch(`${BASE_URL}/signals/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: originalRules }),
    });
  });

  test("GET /signals/rules returns rules array", async () => {
    const res = await fetch(`${BASE_URL}/signals/rules`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.rules).toBeInstanceOf(Array);
  });

  test("POST /signals/rules updates rules", async () => {
    const newRules = [
      {
        name: "test_rule",
        description: "A test rule",
        hook_event_type: "PostToolUseFailure",
        payload_match: "error",
        auto_tag: ["test_signal"],
      },
    ];

    const res = await fetch(`${BASE_URL}/signals/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: newRules }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toBeInstanceOf(Array);
    expect(body.rules.length).toBe(1);
    expect(body.rules[0].name).toBe("test_rule");

    // Verify GET returns the updated rules
    const getRes = await fetch(`${BASE_URL}/signals/rules`);
    const getBody = await getRes.json();
    expect(getBody.rules.length).toBe(1);
    expect(getBody.rules[0].name).toBe("test_rule");
  });

  test("POST /signals/rules rejects non-array rules", async () => {
    const res = await fetch(`${BASE_URL}/signals/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: "not-array" }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /events/export
// ---------------------------------------------------------------------------
describe("GET /events/export", () => {
  beforeAll(async () => {
    // Ensure we have at least one event to export
    await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeEvent({ hook_event_type: "ExportTest" })),
    });
  });

  test("format=json returns JSON array", async () => {
    const res = await fetch(`${BASE_URL}/events/export?format=json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  test("format=jsonl returns newline-delimited JSON", async () => {
    const res = await fetch(`${BASE_URL}/events/export?format=jsonl`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");

    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // Each line should be valid JSON
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.id).toBeDefined();
    }
  });

  test("format=csv returns CSV with headers", async () => {
    const res = await fetch(`${BASE_URL}/events/export?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least one row

    const headerLine = lines[0];
    expect(headerLine).toContain("id");
    expect(headerLine).toContain("source_app");
    expect(headerLine).toContain("hook_event_type");
    expect(headerLine).toContain("timestamp");
  });
});

// ---------------------------------------------------------------------------
// POST /signals - explicit signal creation
// ---------------------------------------------------------------------------
describe("POST /signals", () => {
  test("creates an ExplicitSignal event", async () => {
    const res = await fetch(`${BASE_URL}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "test_failure",
        context: { test: "auth.test.ts", error: "timeout" },
        source_app: "test-runner",
        session_id: "test-signal-session",
        tags: ["learning_signal"],
      }),
    });

    expect(res.status).toBe(201);
    const saved = await res.json();
    expect(saved.hook_event_type).toBe("ExplicitSignal");
    expect(saved.payload.type).toBe("test_failure");
    expect(saved.payload.context.test).toBe("auth.test.ts");
    expect(saved.tags).toContain("learning_signal");
  });

  test("returns 400 when type is missing", async () => {
    const res = await fetch(`${BASE_URL}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { foo: "bar" } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns 400 when context is missing", async () => {
    const res = await fetch(`${BASE_URL}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "some_type" }),
    });

    expect(res.status).toBe(400);
  });

  test("defaults source_app and session_id when not provided", async () => {
    const res = await fetch(`${BASE_URL}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "insight",
        context: { note: "discovered pattern" },
      }),
    });

    expect(res.status).toBe(201);
    const saved = await res.json();
    expect(saved.source_app).toBe("signals-api");
    expect(saved.session_id).toMatch(/^signal-/);
  });
});

// ---------------------------------------------------------------------------
// GET /events/recent
// ---------------------------------------------------------------------------
describe("GET /events/recent", () => {
  test("returns an array of recent events", async () => {
    const res = await fetch(`${BASE_URL}/events/recent`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
  });

  test("respects limit parameter", async () => {
    const res = await fetch(`${BASE_URL}/events/recent?limit=2`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// GET /events/filter-options
// ---------------------------------------------------------------------------
describe("GET /events/filter-options", () => {
  test("returns source_apps, session_ids, hook_event_types", async () => {
    const res = await fetch(`${BASE_URL}/events/filter-options`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source_apps).toBeInstanceOf(Array);
    expect(body.session_ids).toBeInstanceOf(Array);
    expect(body.hook_event_types).toBeInstanceOf(Array);
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
describe("CORS headers", () => {
  test("OPTIONS preflight returns CORS headers", async () => {
    const res = await fetch(`${BASE_URL}/events`, { method: "OPTIONS" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
