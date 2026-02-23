/**
 * Session End Hook (TypeScript port)
 * Logs session end events with reason tracking and optionally saves
 * session statistics (message count from transcript).
 *
 * Usage: bun .claude/hooks-ts/session_end.ts [--save-stats]
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const LOG_DIR = "logs";

async function logSessionEnd(
  inputData: Record<string, unknown>,
  reason: string,
) {
  await mkdir(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, "session_end.json");

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
      (inputData.hook_event_name as string) ?? "SessionEnd",
    reason,
    logged_at: new Date().toISOString(),
  };

  logData.push(logEntry);
  await Bun.write(logPath, JSON.stringify(logData, null, 2));
}

async function saveSessionStatistics(inputData: Record<string, unknown>) {
  try {
    const sessionId = (inputData.session_id as string) ?? "unknown";
    const reason = (inputData.reason as string) ?? "other";
    const transcriptPath = (inputData.transcript_path as string) ?? "";

    // Count messages in transcript if available
    let messageCount = 0;
    if (transcriptPath) {
      const tFile = Bun.file(transcriptPath);
      if (await tFile.exists()) {
        try {
          const content = await tFile.text();
          messageCount = content.split("\n").filter((l) => l.trim()).length;
        } catch {
          // Skip on read error
        }
      }
    }

    // Save statistics
    await mkdir(LOG_DIR, { recursive: true });
    const statsPath = join(LOG_DIR, "session_statistics.json");

    let stats: unknown[] = [];
    const statsFile = Bun.file(statsPath);
    if (await statsFile.exists()) {
      try {
        stats = JSON.parse(await statsFile.text());
      } catch {
        stats = [];
      }
    }

    stats.push({
      session_id: sessionId,
      ended_at: new Date().toISOString(),
      reason,
      message_count: messageCount,
    });

    await Bun.write(statsPath, JSON.stringify(stats, null, 2));
  } catch {
    // Don't fail the hook on stats errors
  }
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "save-stats": { type: "boolean", default: false },
      },
      strict: true,
    });

    const inputData = JSON.parse(await Bun.stdin.text());

    const reason = (inputData.reason as string) ?? "other";

    // Log the session end event
    await logSessionEnd(inputData, reason);

    // Save session statistics if requested
    if (values["save-stats"]) {
      await saveSessionStatistics(inputData);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
