/**
 * Subagent Start Hook (TypeScript port)
 * Tracks subagent lifecycle start events. Logs the full input data
 * to the session log directory.
 *
 * Usage: bun .claude/hooks-ts/subagent_start.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";

    // Ensure session log directory exists
    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "subagent_start.json");

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

    // Append full input data
    logData.push(inputData);

    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
