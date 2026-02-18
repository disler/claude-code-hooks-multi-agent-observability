import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const HOOKS_TS_DIR = resolve(PROJECT_ROOT, ".claude/hooks-ts");

// The TS hook files that should exist
const EXPECTED_TS_HOOKS = [
  "send_event.ts",
  "pre_tool_use.ts",
  "post_tool_use.ts",
  "post_tool_use_failure.ts",
  "permission_request.ts",
  "notification.ts",
  "user_prompt_submit.ts",
  "stop.ts",
];

describe("TypeScript hook files", () => {
  test("hooks-ts directory exists", () => {
    expect(existsSync(HOOKS_TS_DIR)).toBe(true);
  });

  for (const hookFile of EXPECTED_TS_HOOKS) {
    const hookPath = resolve(HOOKS_TS_DIR, hookFile);

    test(`${hookFile} exists`, () => {
      expect(existsSync(hookPath)).toBe(true);
    });

    test(`${hookFile} can be parsed by Bun (no syntax errors)`, async () => {
      // Use Bun.build to check for syntax/parse errors without running the file
      const result = await Bun.build({
        entrypoints: [hookPath],
        target: "bun",
        // Don't write output, just check for errors
        throw: false,
      });

      if (!result.success) {
        // Provide useful error output for debugging
        const messages = result.logs.map((l) => l.message || String(l)).join("\n");
        // We expect parse success - log details but only fail on real parse errors
        // Some hooks may have import resolution issues which is fine in a build check
        const hasSyntaxError = result.logs.some(
          (l) => String(l).includes("SyntaxError") || String(l).includes("ParseError")
        );
        expect(hasSyntaxError).toBe(false);
      }
    });
  }

  test("send_event.ts is the shared transport module", async () => {
    const sendEventPath = resolve(HOOKS_TS_DIR, "send_event.ts");
    const source = await Bun.file(sendEventPath).text();

    // Should contain a function for sending events to the server
    expect(source).toContain("sendEventToServer");
    // Should use fetch to communicate with the server
    expect(source).toContain("fetch");
    // Should reference the server URL
    expect(source).toContain("localhost:4000");
  });
});
