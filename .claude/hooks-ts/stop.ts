/**
 * Stop Hook (TypeScript port)
 * Handles stop events, logs completion status, and optionally exports
 * the chat transcript to a JSON file. NO TTS -- that is Python-only.
 *
 * Usage: bun .claude/hooks-ts/stop.ts [--chat]
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        chat: { type: "boolean", default: false },
      },
      strict: true,
    });

    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "";
    const stopHookActive = (inputData.stop_hook_active as boolean) ?? false;

    // If stop_hook_active is true, exit immediately to prevent infinite loops
    if (stopHookActive) {
      process.exit(0);
    }

    // Ensure session log directory exists
    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "stop.json");

    // Read existing log data or initialize empty array
    let logData: unknown[] = [];
    const logFile = Bun.file(logPath);
    if (await logFile.exists()) {
      try {
        logData = JSON.parse(await logFile.text());
      } catch {
        logData = [];
      }
    }

    // Build log entry
    const logEntry = {
      session_id: sessionId,
      hook_event_name: (inputData.hook_event_name as string) ?? "Stop",
      stop_hook_active: stopHookActive,
    };

    logData.push(logEntry);
    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    // Handle --chat switch: export transcript to chat.json
    if (values.chat && inputData.transcript_path) {
      const transcriptPath = inputData.transcript_path as string;
      const tFile = Bun.file(transcriptPath);
      if (await tFile.exists()) {
        const chatData: unknown[] = [];
        try {
          const content = await tFile.text();
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              chatData.push(JSON.parse(trimmed));
            } catch {
              // Skip invalid lines
            }
          }
          const chatFile = join(logDir, "chat.json");
          await Bun.write(chatFile, JSON.stringify(chatData, null, 2));
        } catch {
          // Fail silently
        }
      }
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
