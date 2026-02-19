/**
 * Teammate Idle Hook (TypeScript port)
 * Tracks teammate idle events. Logs the full input data
 * to the session log directory.
 *
 * Usage: bun .claude/hooks-ts/teammate_idle.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";

    // Ensure session log directory exists
    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "teammate_idle.json");

    // Read existing log data or initialize empty array
    let logData: unknown[] = [];
    const logFile = Bun.file(logPath);
    if (await logFile.exists()) {
      try {
        logData = JSON.parse(await logFile.text());
      } catch (error) {
        console.warn(`Warning: Could not parse ${logPath}. Initializing with new data. Error:`, error);
        logData = [];
      }
    }

    // Append full input data
    logData.push(inputData);

    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Warning: teammate_idle hook error:", error);
    process.exit(0);
  }
}

await main();
