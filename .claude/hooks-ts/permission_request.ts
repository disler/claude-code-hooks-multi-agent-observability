/**
 * Permission Request Hook (TypeScript port)
 * Logs permission request events to session directory.
 *
 * Usage: bun .claude/hooks-ts/permission_request.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";

    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "permission_request.json");

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

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
