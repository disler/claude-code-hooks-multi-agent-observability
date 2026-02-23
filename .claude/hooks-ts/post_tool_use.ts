/**
 * Post-Tool-Use Hook (TypeScript port)
 * Logs tool usage results to session directory.
 *
 * Usage: bun .claude/hooks-ts/post_tool_use.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";
    const toolName = (inputData.tool_name as string) ?? "";
    const toolUseId = (inputData.tool_use_id as string) ?? "";
    const toolInput = (inputData.tool_input as Record<string, unknown>) ?? {};
    const isMcpTool = toolName.startsWith("mcp__");

    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "post_tool_use.json");

    let logData: unknown[] = [];
    const logFile = Bun.file(logPath);
    if (await logFile.exists()) {
      try {
        logData = JSON.parse(await logFile.text());
      } catch {
        logData = [];
      }
    }

    const logEntry: Record<string, unknown> = {
      tool_name: toolName,
      tool_use_id: toolUseId,
      session_id: sessionId,
      hook_event_name: (inputData.hook_event_name as string) ?? "PostToolUse",
      is_mcp_tool: isMcpTool,
    };

    if (isMcpTool) {
      const parts = toolName.split("__");
      if (parts.length >= 3) {
        logEntry.mcp_server = parts[1];
        logEntry.mcp_tool_name = parts.slice(2).join("__");
      }
      logEntry.input_keys = Object.keys(toolInput).slice(0, 10);
    }

    logData.push(logEntry);

    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
