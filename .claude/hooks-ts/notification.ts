/**
 * Notification Hook (TypeScript port)
 * Logs notification events (permission_prompt, idle_prompt, etc.) to session directory.
 * NO TTS in the TypeScript port -- TTS is Python-only.
 *
 * Usage: bun .claude/hooks-ts/notification.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";
    const notificationType = (inputData.notification_type as string) ?? "";
    const message = (inputData.message as string) ?? "";
    const title = (inputData.title as string) ?? "";

    // Ensure session log directory exists
    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "notification.json");

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
      hook_event_name: (inputData.hook_event_name as string) ?? "Notification",
      notification_type: notificationType,
      message,
      title,
    };

    logData.push(logEntry);

    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
