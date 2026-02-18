#!/usr/bin/env bun
/**
 * setup-observability.ts — Scaffold the full observability stack into a target project.
 *
 * Usage:
 *   bun scripts/setup-observability.ts --project /path/to/target --source-app my-app [--port 4000] [--language ts|py]
 *
 * This script is IDEMPOTENT: running it twice produces identical results.
 * Every step checks before writing.
 */

import { parseArgs } from "node:util";
import { resolve, join, relative, basename, dirname } from "node:path";
import {
  mkdir,
  readdir,
  copyFile,
  stat,
  cp,
} from "node:fs/promises";

// ─── CLI Argument Parsing ────────────────────────────────────

const USAGE = `Usage:
  bun scripts/setup-observability.ts --project <path> --source-app <name> [--port 4000] [--language ts|py]

Options:
  --project      Target project directory (required)
  --source-app   Application identifier for hook events (required)
  --port         Observability server port (default: 4000)
  --language     Hook language: ts or py (auto-detect if omitted)
  --help         Show this help message

Examples:
  bun scripts/setup-observability.ts --project ~/my-app --source-app my-app
  bun scripts/setup-observability.ts --project . --source-app web-ui --port 4001 --language ts`;

const { values } = parseArgs({
  options: {
    project: { type: "string", short: "p" },
    "source-app": { type: "string", short: "s" },
    port: { type: "string", default: "4000" },
    language: { type: "string", short: "l" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

if (!values.project) {
  console.error("Error: --project is required\n");
  console.error(USAGE);
  process.exit(1);
}

if (!values["source-app"]) {
  console.error("Error: --source-app is required\n");
  console.error(USAGE);
  process.exit(1);
}

const targetDir = resolve(values.project);
const sourceApp = values["source-app"]!;
const port = parseInt(values.port || "4000", 10);
const languageArg = values.language as "ts" | "py" | undefined;

// Toolkit repo root = parent of scripts/
const toolkitRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

// ─── Helpers ─────────────────────────────────────────────────

const summary: { created: string[]; skipped: string[]; errors: string[] } = {
  created: [],
  skipped: [],
  errors: [],
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const file = Bun.file(path);
    return (await file.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

async function readText(path: string): Promise<string> {
  try {
    const file = Bun.file(path);
    return await file.text();
  } catch {
    return "";
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

/**
 * Recursively copy a directory, skipping node_modules, .db files, dist, logs,
 * and other build artifacts. IDEMPOTENT: overwrites existing files.
 */
async function copyDirFiltered(
  src: string,
  dest: string,
  skipPatterns: string[] = [
    "node_modules",
    ".db",
    ".db-wal",
    ".db-shm",
    "dist",
    "logs",
    ".DS_Store",
    "__pycache__",
    ".cache",
    "bun.lock",
  ]
): Promise<number> {
  await ensureDir(dest);
  let copied = 0;
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    // Skip patterns
    if (skipPatterns.some((p) => entry.name.endsWith(p) || entry.name === p)) {
      continue;
    }

    if (entry.isDirectory()) {
      copied += await copyDirFiltered(srcPath, destPath, skipPatterns);
    } else {
      await ensureDir(dirname(destPath));
      await copyFile(srcPath, destPath);
      copied++;
    }
  }
  return copied;
}

// ─── Step 1: Validate Target ────────────────────────────────

async function validateTarget(): Promise<void> {
  if (!(await exists(targetDir))) {
    console.error(`Error: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }
  console.log(`Target project: ${targetDir}`);
  console.log(`Source app:     ${sourceApp}`);
  console.log(`Server port:    ${port}`);
}

// ─── Step 2: Detect Language ─────────────────────────────────

type Language = "ts" | "py";

async function detectLanguage(): Promise<Language> {
  if (languageArg) {
    if (languageArg !== "ts" && languageArg !== "py") {
      console.error(`Error: --language must be 'ts' or 'py', got '${languageArg}'`);
      process.exit(1);
    }
    console.log(`Language:       ${languageArg} (explicit)`);
    return languageArg;
  }

  const hasPackageJson = await exists(join(targetDir, "package.json"));
  const hasRequirements = await exists(join(targetDir, "requirements.txt"));
  const hasPyproject = await exists(join(targetDir, "pyproject.toml"));
  const hasPython = hasRequirements || hasPyproject;

  if (hasPackageJson && hasPython) {
    console.log("Language:       ts (mixed project — defaulting to TypeScript. Use --language py to override)");
    return "ts";
  }

  if (hasPackageJson) {
    console.log("Language:       ts (auto-detected from package.json)");
    return "ts";
  }

  if (hasPython) {
    console.log("Language:       py (auto-detected from requirements.txt/pyproject.toml)");
    return "py";
  }

  // Default to ts if nothing detected
  console.log("Language:       ts (default — no project markers found)");
  return "ts";
}

// ─── Step 3: Create .claude/ Directory ──────────────────────

async function ensureClaudeDir(): Promise<void> {
  const claudeDir = join(targetDir, ".claude");
  if (await exists(claudeDir)) {
    summary.skipped.push(".claude/ (already exists)");
  } else {
    await ensureDir(claudeDir);
    summary.created.push(".claude/");
  }
}

// ─── Step 4: Scaffold Hooks ─────────────────────────────────

async function scaffoldHooks(lang: Language): Promise<void> {
  const targetHooksDir = join(targetDir, ".claude", "hooks");
  const srcHooksDir =
    lang === "ts"
      ? join(toolkitRoot, ".claude", "hooks-ts")
      : join(toolkitRoot, ".claude", "hooks");

  if (!(await exists(srcHooksDir))) {
    summary.errors.push(`Source hooks directory not found: ${srcHooksDir}`);
    return;
  }

  await ensureDir(targetHooksDir);
  const count = await copyDirFiltered(srcHooksDir, targetHooksDir, [
    "node_modules",
    "__pycache__",
    ".DS_Store",
    "examples",
    "validators",
  ]);

  summary.created.push(`.claude/hooks/ (${count} files, ${lang})`);
}

// ─── Step 5: Merge settings.json ─────────────────────────────

const HOOK_EVENT_TYPES = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "PreCompact",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
] as const;

/**
 * Build the hook commands for a given event type and language.
 * Mirrors the structure in the toolkit's .claude/settings.json.
 */
function buildHookEntry(
  eventType: string,
  lang: Language,
  app: string
): { matcher: string; hooks: { type: string; command: string }[] } {
  const prefix =
    lang === "ts"
      ? "bun $CLAUDE_PROJECT_DIR/.claude/hooks/"
      : "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/";

  const ext = lang === "ts" ? ".ts" : ".py";

  // Map event types to their specific hook script names and extra flags
  const hookMap: Record<string, { script: string; flags?: string }> = {
    PreToolUse: { script: "pre_tool_use" },
    PostToolUse: { script: "post_tool_use" },
    PostToolUseFailure: { script: "post_tool_use_failure" },
    PermissionRequest: { script: "permission_request" },
    Notification: { script: "notification" },
    SubagentStart: { script: "subagent_start" },
    SubagentStop: { script: "subagent_stop" },
    Stop: { script: "stop", flags: "--chat" },
    PreCompact: { script: "pre_compact" },
    UserPromptSubmit: {
      script: "user_prompt_submit",
      flags: "--log-only --store-last-prompt --name-agent",
    },
    SessionStart: { script: "session_start" },
    SessionEnd: { script: "session_end" },
  };

  const info = hookMap[eventType];
  if (!info) return { matcher: "", hooks: [] };

  const specificCmd = `${prefix}${info.script}${ext}${info.flags ? " " + info.flags : ""}`;

  // send_event command — always includes --source-app and --event-type
  const sendEventFlags: Record<string, string> = {
    PreToolUse: "--summarize",
    PostToolUse: "--summarize",
    PostToolUseFailure: "--summarize",
    PermissionRequest: "--summarize",
    Notification: "--summarize",
    UserPromptSubmit: "--summarize",
    Stop: "--add-chat",
  };
  const extraFlags = sendEventFlags[eventType] ? ` ${sendEventFlags[eventType]}` : "";
  const sendEventCmd = `${prefix}send_event${ext} --source-app ${app} --event-type ${eventType}${extraFlags}`;

  // Events that use a matcher
  const matcherEvents = [
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "SubagentStart",
  ];

  return {
    matcher: matcherEvents.includes(eventType) ? "" : undefined as unknown as string,
    hooks: [
      { type: "command", command: specificCmd },
      { type: "command", command: sendEventCmd },
    ],
  };
}

async function mergeSettings(lang: Language): Promise<void> {
  const settingsPath = join(targetDir, ".claude", "settings.json");
  const settings = (await readJson(settingsPath)) as Record<string, unknown>;

  if (!settings.hooks) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  let added = 0;
  let skipped = 0;

  const prefix =
    lang === "ts"
      ? "bun $CLAUDE_PROJECT_DIR/.claude/hooks/"
      : "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/";

  for (const eventType of HOOK_EVENT_TYPES) {
    if (!hooks[eventType]) {
      hooks[eventType] = [];
    }

    const existingEntries = hooks[eventType] as Array<{
      hooks?: Array<{ command?: string }>;
    }>;

    // Check if observability hook already exists (look for send_event in commands)
    const alreadyHasObsHook = existingEntries.some((entry) =>
      entry.hooks?.some(
        (h) =>
          h.command?.includes("send_event") &&
          h.command?.includes(sourceApp)
      )
    );

    if (alreadyHasObsHook) {
      skipped++;
      continue;
    }

    const entry = buildHookEntry(eventType, lang, sourceApp);
    // Clean up undefined matcher
    const cleanEntry: Record<string, unknown> = {
      hooks: entry.hooks,
    };
    if (entry.matcher !== (undefined as unknown as string)) {
      cleanEntry.matcher = entry.matcher;
    }

    existingEntries.push(cleanEntry as never);
    added++;
  }

  await writeJson(settingsPath, settings);

  if (added > 0) {
    summary.created.push(`.claude/settings.json (${added} hook event types added)`);
  }
  if (skipped > 0) {
    summary.skipped.push(`${skipped} hook event types (already configured)`);
  }
}

// ─── Step 6: Copy Server + Client ───────────────────────────

async function copyServerAndClient(): Promise<void> {
  const obsDir = join(targetDir, ".observability");
  await ensureDir(obsDir);

  // Copy server
  const serverSrc = join(toolkitRoot, "apps", "server");
  const serverDest = join(obsDir, "server");
  const serverCount = await copyDirFiltered(serverSrc, serverDest);
  summary.created.push(`.observability/server/ (${serverCount} files)`);

  // Copy client
  const clientSrc = join(toolkitRoot, "apps", "client");
  const clientDest = join(obsDir, "client");
  const clientCount = await copyDirFiltered(clientSrc, clientDest);
  summary.created.push(`.observability/client/ (${clientCount} files)`);

  // Copy log-signal.ts
  const scriptsDir = join(obsDir, "scripts");
  await ensureDir(scriptsDir);
  const logSignalSrc = join(toolkitRoot, "scripts", "observability", "log-signal.ts");
  const logSignalDest = join(scriptsDir, "log-signal.ts");
  if (await exists(logSignalSrc)) {
    await copyFile(logSignalSrc, logSignalDest);
    summary.created.push(".observability/scripts/log-signal.ts");
  }

  // Create data directory for SQLite
  const dataDir = join(obsDir, "data");
  if (!(await exists(dataDir))) {
    await ensureDir(dataDir);
    // Write .gitkeep so the dir is tracked
    await writeText(join(dataDir, ".gitkeep"), "");
    summary.created.push(".observability/data/");
  } else {
    summary.skipped.push(".observability/data/ (already exists)");
  }
}

// ─── Step 7: Install Dependencies ───────────────────────────

async function installDeps(): Promise<void> {
  const obsDir = join(targetDir, ".observability");

  console.log("\nInstalling server dependencies...");
  const serverResult = Bun.spawnSync(["bun", "install"], {
    cwd: join(obsDir, "server"),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (serverResult.exitCode !== 0) {
    summary.errors.push(
      `Server bun install failed: ${serverResult.stderr.toString()}`
    );
  } else {
    summary.created.push(".observability/server/node_modules");
  }

  console.log("Installing client dependencies...");
  const clientResult = Bun.spawnSync(["bun", "install"], {
    cwd: join(obsDir, "client"),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (clientResult.exitCode !== 0) {
    summary.errors.push(
      `Client bun install failed: ${clientResult.stderr.toString()}`
    );
  } else {
    summary.created.push(".observability/client/node_modules");
  }
}

// ─── Step 8: Create observability.json ──────────────────────

async function createObservabilityConfig(): Promise<void> {
  const configPath = join(targetDir, ".claude", "observability.json");

  if (await exists(configPath)) {
    // Check if source_app matches
    const existing = await readJson(configPath);
    if (existing.source_app === sourceApp) {
      summary.skipped.push(".claude/observability.json (already configured)");
      return;
    }
  }

  // Read template from toolkit
  const templatePath = join(toolkitRoot, ".claude", "observability.json");
  const template = await readJson(templatePath);

  // Replace placeholders
  template.source_app = sourceApp;
  template.server_url = `http://localhost:${port}`;

  await writeJson(configPath, template);
  summary.created.push(".claude/observability.json");
}

// ─── Step 9: Copy Skill ─────────────────────────────────────

async function copySkill(): Promise<void> {
  const skillSrc = join(
    toolkitRoot,
    ".claude",
    "skills",
    "observability",
    "SKILL.md"
  );
  const skillDest = join(
    targetDir,
    ".claude",
    "skills",
    "observability",
    "SKILL.md"
  );

  if (!(await exists(skillSrc))) {
    summary.errors.push("Skill source not found: " + skillSrc);
    return;
  }

  if (await exists(skillDest)) {
    summary.skipped.push(".claude/skills/observability/SKILL.md (already exists)");
    return;
  }

  await ensureDir(dirname(skillDest));
  await copyFile(skillSrc, skillDest);
  summary.created.push(".claude/skills/observability/SKILL.md");
}

// ─── Step 10: Add Observability Scripts (per project type) ──

/**
 * For JS/TS projects: merge obs:* scripts into the target's package.json.
 * Reads existing package.json, adds scripts defensively (no overwrite), writes back.
 */
async function mergePackageJsonScripts(): Promise<void> {
  const pkgPath = join(targetDir, "package.json");

  if (!(await exists(pkgPath))) {
    // Caller should have checked — this is a safety fallback
    return;
  }

  const pkg = await readJson(pkgPath) as Record<string, unknown>;

  if (!pkg.scripts) {
    pkg.scripts = {};
  }
  const scripts = pkg.scripts as Record<string, string>;

  const obsScripts: Record<string, string> = {
    "obs:start":
      "cd .observability/server && bun run src/index.ts & cd .observability/client && bun run dev &",
    "obs:stop":
      "pkill -f '.observability/server' 2>/dev/null; pkill -f '.observability/client' 2>/dev/null",
    "obs:status":
      "curl -sf http://localhost:4000/health && echo 'Server: UP' || echo 'Server: DOWN'",
  };

  let added = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(obsScripts)) {
    if (scripts[key]) {
      skipped++;
    } else {
      scripts[key] = value;
      added++;
    }
  }

  await writeJson(pkgPath, pkg);

  if (added > 0) {
    summary.created.push(`package.json obs:* scripts (${added} added)`);
  }
  if (skipped > 0) {
    summary.skipped.push(`${skipped} obs:* scripts (already in package.json)`);
  }
}

/**
 * For Python projects: create .observability/obs.sh management script.
 * Creates a standalone shell script with start/stop/status commands.
 */
async function createObsShellScript(): Promise<void> {
  const obsDir = join(targetDir, ".observability");
  const scriptPath = join(obsDir, "obs.sh");

  if (await exists(scriptPath)) {
    summary.skipped.push(".observability/obs.sh (already exists)");
    return;
  }

  await ensureDir(obsDir);

  const scriptContent = `#!/usr/bin/env bash
# Observability management script
case "$1" in
  start)
    cd "$(dirname "$0")/server" && bun run src/index.ts &
    cd "$(dirname "$0")/client" && bun run dev &
    echo "Dashboard: http://localhost:5173 | Server: http://localhost:4000"
    ;;
  stop)
    pkill -f '.observability/server' 2>/dev/null
    pkill -f '.observability/client' 2>/dev/null
    echo "Stopped observability services"
    ;;
  status)
    curl -sf http://localhost:4000/health && echo "Server: UP" || echo "Server: DOWN"
    curl -sf http://localhost:5173 > /dev/null 2>&1 && echo "Client: UP" || echo "Client: DOWN"
    ;;
  *)
    echo "Usage: ./obs.sh {start|stop|status}"
    ;;
esac
`;

  await writeText(scriptPath, scriptContent);

  // Make executable (chmod +x)
  const chmodResult = Bun.spawnSync(["chmod", "+x", scriptPath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (chmodResult.exitCode !== 0) {
    summary.errors.push(`Failed to chmod +x obs.sh: ${chmodResult.stderr.toString()}`);
  } else {
    summary.created.push(".observability/obs.sh (executable)");
  }
}

// ─── Step 11: Update CLAUDE.md ──────────────────────────────

const OBS_CLAUDE_MARKER = "## Observability Toolkit";

function getObsClaudeSection(lang: Language): string {
  if (lang === "ts") {
    return `
## Observability Toolkit

This project has Claude Code observability enabled. Configuration: \`.claude/observability.json\`

- **Start dashboard:** \`bun run obs:start\`
- **Stop dashboard:** \`bun run obs:stop\`
- **Check status:** \`bun run obs:status\`
- **Query traces:** Use \`/observability query\` skill
- **Log a signal:** \`bun .observability/scripts/log-signal.ts --type <type> --context '<json>'\`
- **View learning signals:** \`/observability digest\`
- **Full docs:** Use \`/observability\` skill for guided access to all features
`;
  }

  return `
## Observability Toolkit

This project has Claude Code observability enabled. Configuration: \`.claude/observability.json\`

- **Start dashboard:** \`./.observability/obs.sh start\`
- **Stop dashboard:** \`./.observability/obs.sh stop\`
- **Check status:** \`./.observability/obs.sh status\`
- **Query traces:** Use \`/observability query\` skill
- **Log a signal:** \`bun .observability/scripts/log-signal.ts --type <type> --context '<json>'\`
- **View learning signals:** \`/observability digest\`
- **Full docs:** Use \`/observability\` skill for guided access to all features
`;
}

async function updateClaudeMd(lang: Language): Promise<void> {
  const claudeMdPath = join(targetDir, "CLAUDE.md");
  const section = getObsClaudeSection(lang);

  if (!(await exists(claudeMdPath))) {
    const content = `# ${sourceApp}\n${section}`;
    await writeText(claudeMdPath, content);
    summary.created.push("CLAUDE.md (new, with observability section)");
    return;
  }

  const content = await readText(claudeMdPath);

  if (content.includes(OBS_CLAUDE_MARKER)) {
    summary.skipped.push("CLAUDE.md observability section (already present)");
    return;
  }

  await writeText(claudeMdPath, content.trimEnd() + "\n" + section);
  summary.created.push("CLAUDE.md (appended observability section)");
}

// ─── Step 12: Print Summary ─────────────────────────────────

function printSummary(lang: Language): void {
  console.log("\n" + "=".repeat(60));
  console.log("  Observability Setup Complete");
  console.log("=".repeat(60));

  if (summary.created.length > 0) {
    console.log("\n  CREATED:");
    for (const item of summary.created) {
      console.log(`    + ${item}`);
    }
  }

  if (summary.skipped.length > 0) {
    console.log("\n  SKIPPED (already exists):");
    for (const item of summary.skipped) {
      console.log(`    - ${item}`);
    }
  }

  if (summary.errors.length > 0) {
    console.log("\n  ERRORS:");
    for (const item of summary.errors) {
      console.log(`    ! ${item}`);
    }
  }

  const startCmd =
    lang === "ts" ? "bun run obs:start" : "./.observability/obs.sh start";

  console.log("\n  NEXT STEPS:");
  console.log(`    1. Start the dashboard:  ${startCmd}`);
  console.log(`    2. Open the dashboard:   open http://localhost:5173`);
  console.log(`    3. Run Claude Code — hooks will send events automatically`);
  console.log("=".repeat(60) + "\n");
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Setting up Claude Code observability...\n");

  await validateTarget();
  const lang = await detectLanguage();

  console.log("\n--- Scaffolding ---\n");

  // Step 3
  console.log("[1/9] Creating .claude/ directory...");
  await ensureClaudeDir();

  // Step 4
  console.log("[2/9] Copying hooks...");
  await scaffoldHooks(lang);

  // Step 5
  console.log("[3/9] Merging settings.json...");
  await mergeSettings(lang);

  // Step 6
  console.log("[4/9] Copying server + client...");
  await copyServerAndClient();

  // Step 7
  console.log("[5/9] Installing dependencies...");
  await installDeps();

  // Step 8
  console.log("[6/9] Creating observability.json...");
  await createObservabilityConfig();

  // Step 9
  console.log("[7/9] Copying observability skill...");
  await copySkill();

  // Step 10 — add startup commands
  // For TS projects WITH a package.json: add scripts to package.json
  // For TS projects WITHOUT a package.json OR Python projects: create obs.sh
  const hasPkgJson = await exists(join(targetDir, "package.json"));
  let effectiveLang = lang;

  if (lang === "ts" && hasPkgJson) {
    console.log("[8/9] Adding obs:* scripts to package.json...");
    await mergePackageJsonScripts();
  } else {
    if (lang === "ts" && !hasPkgJson) {
      console.log(
        "[8/9] No package.json found — creating obs.sh instead..."
      );
      effectiveLang = "py"; // obs.sh is language-agnostic
    } else {
      console.log("[8/9] Creating .observability/obs.sh script...");
    }
    await createObsShellScript();
  }

  // Step 11
  console.log("[9/9] Updating CLAUDE.md...");
  await updateClaudeMd(effectiveLang);

  // Step 12
  printSummary(effectiveLang);
}

main().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
