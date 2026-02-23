/**
 * Constants for Claude Code Hooks (TypeScript port).
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Base directory for all logs
// Default is 'logs' in the current working directory
export const LOG_BASE_DIR =
  process.env.CLAUDE_HOOKS_LOG_DIR ?? "logs";

/**
 * Get the log directory path for a specific session.
 */
export function getSessionLogDir(sessionId: string): string {
  return join(LOG_BASE_DIR, sessionId);
}

/**
 * Ensure the log directory for a session exists and return its path.
 */
export async function ensureSessionLogDir(
  sessionId: string,
): Promise<string> {
  const logDir = getSessionLogDir(sessionId);
  await mkdir(logDir, { recursive: true });
  return logDir;
}
