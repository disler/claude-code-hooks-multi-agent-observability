/**
 * Session Start Hook (TypeScript port)
 * Logs session initialization events and optionally loads development context
 * (git branch, uncommitted changes, project context files, GitHub issues).
 *
 * Usage: bun .claude/hooks-ts/session_start.ts [--load-context]
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const LOG_DIR = "logs";

async function logSessionStart(inputData: Record<string, unknown>) {
  await mkdir(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, "session_start.json");

  let logData: unknown[] = [];
  const logFile = Bun.file(logPath);
  if (await logFile.exists()) {
    try {
      logData = JSON.parse(await logFile.text());
    } catch {
      logData = [];
    }
  }

  const logEntry = {
    session_id: (inputData.session_id as string) ?? "unknown",
    hook_event_name:
      (inputData.hook_event_name as string) ?? "SessionStart",
    source: (inputData.source as string) ?? "unknown",
    model: (inputData.model as string) ?? "",
    agent_type: (inputData.agent_type as string) ?? "",
  };

  logData.push(logEntry);
  await Bun.write(logPath, JSON.stringify(logData, null, 2));
}

async function getGitStatus(): Promise<{
  branch: string | null;
  changes: number | null;
}> {
  try {
    const branchProc = Bun.spawn(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const branchOutput = await new Response(branchProc.stdout).text();
    await branchProc.exited;
    const branch =
      branchProc.exitCode === 0 ? branchOutput.trim() : null;

    const statusProc = Bun.spawn(["git", "status", "--porcelain"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const statusOutput = await new Response(statusProc.stdout).text();
    await statusProc.exited;
    let changes: number | null = null;
    if (statusProc.exitCode === 0) {
      const lines = statusOutput.trim().split("\n").filter(Boolean);
      changes = lines.length;
    }

    return { branch, changes };
  } catch {
    return { branch: null, changes: null };
  }
}

async function loadDevelopmentContext(
  source: string,
  agentType: string,
): Promise<string> {
  const contextParts: string[] = [];

  // Add timestamp
  contextParts.push(
    `Session started at: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
  );
  contextParts.push(`Session source: ${source}`);
  if (agentType) {
    contextParts.push(`Agent type: ${agentType}`);
  }

  // Add git information
  const { branch, changes } = await getGitStatus();
  if (branch) {
    contextParts.push(`Git branch: ${branch}`);
    if (changes !== null && changes > 0) {
      contextParts.push(`Uncommitted changes: ${changes} files`);
    }
  }

  // Load project-specific context files if they exist
  const contextFiles = [
    ".claude/CONTEXT.md",
    ".claude/TODO.md",
    "TODO.md",
    ".github/ISSUE_TEMPLATE.md",
  ];

  for (const filePath of contextFiles) {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      try {
        const content = (await file.text()).trim();
        if (content) {
          contextParts.push(`\n--- Content from ${filePath} ---`);
          contextParts.push(content.slice(0, 1000));
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return contextParts.join("\n");
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "load-context": { type: "boolean", default: false },
      },
      strict: true,
    });

    const inputData = JSON.parse(await Bun.stdin.text());

    const source = (inputData.source as string) ?? "unknown";
    const agentType = (inputData.agent_type as string) ?? "";

    // Log the session start event
    await logSessionStart(inputData);

    // Load development context if requested
    if (values["load-context"]) {
      const context = await loadDevelopmentContext(source, agentType);
      if (context) {
        const output = {
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: context,
          },
        };
        console.log(JSON.stringify(output));
        process.exit(0);
      }
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
