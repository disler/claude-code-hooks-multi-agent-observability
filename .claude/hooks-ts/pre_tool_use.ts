/**
 * Pre-Tool-Use Hook (TypeScript port)
 * Validates tool calls before execution. Blocks dangerous rm -rf commands.
 * Logs tool usage summaries to session directory.
 *
 * Usage: bun .claude/hooks-ts/pre_tool_use.ts
 */

import { join } from "node:path";
import { ensureSessionLogDir } from "./utils/constants";

// Allowed directories where rm -rf is permitted
const ALLOWED_RM_DIRECTORIES = ["trees/"];

function isPathInAllowedDirectory(
  command: string,
  allowedDirs: string[],
): boolean {
  const pathPattern = /rm\s+(?:-[\w]+\s+|--[\w-]+\s+)*(.+)$/i;
  const match = command.match(pathPattern);
  if (!match) return false;

  const pathStr = match[1].trim();
  const paths = pathStr.split(/\s+/);
  if (paths.length === 0) return false;

  for (let p of paths) {
    p = p.replace(/^['"]|['"]$/g, "");
    if (!p) continue;

    let isAllowed = false;
    for (const allowedDir of allowedDirs) {
      if (p.startsWith(allowedDir) || p.startsWith("./" + allowedDir)) {
        isAllowed = true;
        break;
      }
    }
    if (!isAllowed) return false;
  }

  return true;
}

function isDangerousRmCommand(
  command: string,
  allowedDirs: string[] = [],
): boolean {
  const normalized = command.toLowerCase().replace(/\s+/g, " ").trim();

  const patterns = [
    /\brm\s+.*-[a-z]*r[a-z]*f/,
    /\brm\s+.*-[a-z]*f[a-z]*r/,
    /\brm\s+--recursive\s+--force/,
    /\brm\s+--force\s+--recursive/,
    /\brm\s+-r\s+.*-f/,
    /\brm\s+-f\s+.*-r/,
  ];

  let isPotentiallyDangerous = false;
  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      isPotentiallyDangerous = true;
      break;
    }
  }

  if (!isPotentiallyDangerous) {
    const dangerousPaths = [
      /\//,
      /\/\*/,
      /~/,
      /~\//,
      /\$HOME/,
      /\.\./,
      /\*/,
      /\./,
      /\.\s*$/,
    ];

    if (/\brm\s+.*-[a-z]*r/.test(normalized)) {
      for (const dp of dangerousPaths) {
        if (dp.test(normalized)) {
          isPotentiallyDangerous = true;
          break;
        }
      }
    }
  }

  if (!isPotentiallyDangerous) return false;

  if (allowedDirs.length > 0 && isPathInAllowedDirectory(command, allowedDirs)) {
    return false;
  }

  return true;
}

function denyTool(reason: string): never {
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = { tool_name: toolName };

  if (toolName === "Bash") {
    const cmd = (toolInput.command as string) ?? "";
    summary.command = cmd.slice(0, 200);
    if (toolInput.description)
      summary.description = (toolInput.description as string).slice(0, 100);
    if (toolInput.timeout) summary.timeout = toolInput.timeout;
    if (toolInput.run_in_background) summary.run_in_background = true;
  } else if (toolName === "Write") {
    summary.file_path = toolInput.file_path ?? "";
    summary.content_length = ((toolInput.content as string) ?? "").length;
  } else if (toolName === "Edit") {
    summary.file_path = toolInput.file_path ?? "";
    summary.replace_all = toolInput.replace_all ?? false;
  } else if (toolName === "Read") {
    summary.file_path = toolInput.file_path ?? "";
    if (toolInput.offset) summary.offset = toolInput.offset;
    if (toolInput.limit) summary.limit = toolInput.limit;
  } else if (toolName === "Glob") {
    summary.pattern = toolInput.pattern ?? "";
    if (toolInput.path) summary.path = toolInput.path;
  } else if (toolName === "Grep") {
    summary.pattern = toolInput.pattern ?? "";
    if (toolInput.path) summary.path = toolInput.path;
    if (toolInput.glob) summary.glob = toolInput.glob;
  } else if (toolName === "WebFetch") {
    summary.url = toolInput.url ?? "";
    summary.prompt = ((toolInput.prompt as string) ?? "").slice(0, 100);
  } else if (toolName === "WebSearch") {
    summary.query = toolInput.query ?? "";
    if (toolInput.allowed_domains)
      summary.allowed_domains = toolInput.allowed_domains;
    if (toolInput.blocked_domains)
      summary.blocked_domains = toolInput.blocked_domains;
  } else if (toolName === "Task") {
    summary.description = ((toolInput.description as string) ?? "").slice(0, 100);
    summary.subagent_type = toolInput.subagent_type ?? "";
    if (toolInput.model) summary.model = toolInput.model;
    if (toolInput.run_in_background) summary.run_in_background = true;
    if (toolInput.resume) summary.resume = toolInput.resume;
  } else if (toolName === "TaskOutput") {
    summary.task_id = toolInput.task_id ?? "";
    summary.block = toolInput.block ?? true;
    if (toolInput.timeout) summary.timeout = toolInput.timeout;
  } else if (toolName === "TaskStop") {
    summary.task_id = toolInput.task_id ?? "";
  } else if (toolName === "SendMessage") {
    summary.type = toolInput.type ?? "";
    if (toolInput.recipient) summary.recipient = toolInput.recipient;
    if (toolInput.summary) summary.summary = toolInput.summary;
  } else if (toolName === "TaskCreate") {
    summary.subject = ((toolInput.subject as string) ?? "").slice(0, 100);
    if (toolInput.activeForm) summary.activeForm = toolInput.activeForm;
  } else if (toolName === "TaskGet") {
    summary.taskId = toolInput.taskId ?? "";
  } else if (toolName === "TaskUpdate") {
    summary.taskId = toolInput.taskId ?? "";
    if (toolInput.status) summary.status = toolInput.status;
    if (toolInput.owner) summary.owner = toolInput.owner;
  } else if (toolName === "TaskList") {
    // No params
  } else if (toolName === "TeamCreate") {
    summary.team_name = toolInput.team_name ?? "";
    if (toolInput.description)
      summary.description = (toolInput.description as string).slice(0, 100);
  } else if (toolName === "TeamDelete") {
    // No params
  } else if (toolName === "NotebookEdit") {
    summary.notebook_path = toolInput.notebook_path ?? "";
    if (toolInput.cell_type) summary.cell_type = toolInput.cell_type;
    if (toolInput.edit_mode) summary.edit_mode = toolInput.edit_mode;
  } else if (toolName === "EnterPlanMode") {
    // No params
  } else if (toolName === "ExitPlanMode") {
    if (toolInput.allowedPrompts)
      summary.allowedPrompts_count = (toolInput.allowedPrompts as unknown[]).length;
  } else if (toolName === "AskUserQuestion") {
    if (toolInput.questions)
      summary.questions_count = (toolInput.questions as unknown[]).length;
  } else if (toolName === "Skill") {
    summary.skill = toolInput.skill ?? "";
    if (toolInput.args)
      summary.args = (toolInput.args as string).slice(0, 100);
  } else if (toolName.startsWith("mcp__")) {
    summary.mcp_tool = toolName;
    summary.input_keys = Object.keys(toolInput).slice(0, 10);
  }

  return summary;
}

async function main() {
  try {
    const inputData = JSON.parse(await Bun.stdin.text());

    const toolName = (inputData.tool_name as string) ?? "";
    const toolInput = (inputData.tool_input as Record<string, unknown>) ?? {};
    const toolUseId = (inputData.tool_use_id as string) ?? "";

    // Check for dangerous rm -rf commands
    if (toolName === "Bash") {
      const command = (toolInput.command as string) ?? "";
      if (isDangerousRmCommand(command, ALLOWED_RM_DIRECTORIES)) {
        denyTool(
          `Dangerous rm command detected and prevented. rm -rf is only allowed in these directories: ${ALLOWED_RM_DIRECTORIES.join(", ")}`,
        );
      }
    }

    // Extract session_id
    const sessionId = (inputData.session_id as string) ?? "unknown";

    // Ensure session log directory exists
    const logDir = await ensureSessionLogDir(sessionId);
    const logPath = join(logDir, "pre_tool_use.json");

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

    // Build log entry with tool_use_id and tool summary
    const logEntry = {
      tool_name: toolName,
      tool_use_id: toolUseId,
      session_id: sessionId,
      hook_event_name: (inputData.hook_event_name as string) ?? "PreToolUse",
      tool_summary: summarizeToolInput(toolName, toolInput),
    };

    logData.push(logEntry);

    await Bun.write(logPath, JSON.stringify(logData, null, 2));

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
