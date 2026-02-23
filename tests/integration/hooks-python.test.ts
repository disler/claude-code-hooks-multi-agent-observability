import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

describe("Python hooks auto-detection", () => {
  const postToolUsePath = resolve(PROJECT_ROOT, ".claude/hooks/post_tool_use.py");
  const postToolUseFailurePath = resolve(PROJECT_ROOT, ".claude/hooks/post_tool_use_failure.py");
  const observabilityConfigPath = resolve(PROJECT_ROOT, ".claude/observability.json");

  test("post_tool_use.py exists", () => {
    expect(existsSync(postToolUsePath)).toBe(true);
  });

  test("post_tool_use_failure.py exists", () => {
    expect(existsSync(postToolUseFailurePath)).toBe(true);
  });

  test("post_tool_use.py has check_auto_detect_rules function", () => {
    const source = readFileSync(postToolUsePath, "utf-8");
    expect(source).toContain("def check_auto_detect_rules(");
    expect(source).toContain("check_auto_detect_rules(");
  });

  test("post_tool_use_failure.py has check_auto_detect_rules function", () => {
    const source = readFileSync(postToolUseFailurePath, "utf-8");
    expect(source).toContain("def check_auto_detect_rules(");
    expect(source).toContain("check_auto_detect_rules(");
  });

  test("both hooks read from .claude/observability.json", () => {
    const postSource = readFileSync(postToolUsePath, "utf-8");
    const failureSource = readFileSync(postToolUseFailurePath, "utf-8");

    expect(postSource).toContain("observability.json");
    expect(failureSource).toContain("observability.json");
  });

  test(".claude/observability.json exists and has valid structure", () => {
    expect(existsSync(observabilityConfigPath)).toBe(true);

    const config = JSON.parse(readFileSync(observabilityConfigPath, "utf-8"));
    expect(config.auto_detect).toBeDefined();
    expect(config.auto_detect.rules).toBeInstanceOf(Array);
    expect(config.auto_detect.rules.length).toBeGreaterThan(0);

    // Each rule should have required fields
    for (const rule of config.auto_detect.rules) {
      expect(rule.name).toBeDefined();
      expect(rule.hook_event_type).toBeDefined();
      expect(rule.payload_match).toBeDefined();
      expect(rule.auto_tag).toBeInstanceOf(Array);
    }
  });

  test("auto_detect rules reference valid hook event types", () => {
    const config = JSON.parse(readFileSync(observabilityConfigPath, "utf-8"));
    const validTypes = [
      "PostToolUse",
      "PostToolUseFailure",
      "PreToolUse",
      "PermissionRequest",
      "Notification",
      "SessionStart",
      "SessionEnd",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "UserPromptSubmit",
      "PreCompact",
      "ExplicitSignal",
    ];

    for (const rule of config.auto_detect.rules) {
      expect(validTypes).toContain(rule.hook_event_type);
    }
  });
});
