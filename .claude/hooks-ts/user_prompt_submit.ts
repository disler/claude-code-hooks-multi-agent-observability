/**
 * User Prompt Submit Hook (TypeScript port)
 * Logs user prompts and manages session tracking data.
 * Supports prompt validation (--validate), session storage (--store-last-prompt),
 * and log-only mode (--log-only).
 *
 * Usage: bun .claude/hooks-ts/user_prompt_submit.ts [--validate] [--log-only] [--store-last-prompt]
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const LOG_DIR = "logs";

async function logUserPrompt(inputData: Record<string, unknown>) {
  await mkdir(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, "user_prompt_submit.json");

  let logData: unknown[] = [];
  const logFile = Bun.file(logPath);
  if (await logFile.exists()) {
    try {
      logData = JSON.parse(await logFile.text());
    } catch {
      logData = [];
    }
  }

  logData.push(inputData);
  await Bun.write(logPath, JSON.stringify(logData, null, 2));
}

async function manageSessionData(
  sessionId: string,
  prompt: string,
) {
  const sessionsDir = join(".claude", "data", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const sessionFile = join(sessionsDir, `${sessionId}.json`);
  let sessionData: Record<string, unknown>;

  const file = Bun.file(sessionFile);
  if (await file.exists()) {
    try {
      sessionData = JSON.parse(await file.text());
    } catch {
      sessionData = { session_id: sessionId, prompts: [] };
    }
  } else {
    sessionData = { session_id: sessionId, prompts: [] };
  }

  (sessionData.prompts as string[]).push(prompt);

  await Bun.write(sessionFile, JSON.stringify(sessionData, null, 2));
}

function validatePrompt(prompt: string): { valid: boolean; reason?: string } {
  // Blocked patterns -- customize as needed
  const blockedPatterns: [string, string][] = [
    // Example: ["rm -rf /", "Dangerous command detected"],
  ];

  const promptLower = prompt.toLowerCase();
  for (const [pattern, reason] of blockedPatterns) {
    if (promptLower.includes(pattern.toLowerCase())) {
      return { valid: false, reason };
    }
  }

  return { valid: true };
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        validate: { type: "boolean", default: false },
        "log-only": { type: "boolean", default: false },
        "store-last-prompt": { type: "boolean", default: false },
      },
      strict: true,
    });

    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";
    const prompt = (inputData.prompt as string) ?? "";

    // Log the user prompt
    await logUserPrompt(inputData);

    // Manage session data if storing prompts
    if (values["store-last-prompt"]) {
      await manageSessionData(sessionId, prompt);
    }

    // Validate prompt if requested and not in log-only mode
    if (values.validate && !values["log-only"]) {
      const result = validatePrompt(prompt);
      if (!result.valid) {
        const output = {
          decision: "block",
          reason: `Prompt blocked: ${result.reason}`,
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
