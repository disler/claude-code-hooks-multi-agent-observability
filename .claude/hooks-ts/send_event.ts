/**
 * Multi-Agent Observability Hook Script (TypeScript port)
 * Sends Claude Code hook events to the observability server.
 *
 * Supported event types (12 total):
 *   SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse,
 *   PostToolUseFailure, PermissionRequest, Notification, SubagentStart,
 *   SubagentStop, Stop, PreCompact
 *
 * Usage: bun .claude/hooks-ts/send_event.ts --source-app <app> --event-type <type> [options]
 */

import { parseArgs } from "node:util";
import { getModelFromTranscript } from "./utils/model_extractor";
import { generateEventSummary } from "./utils/summarizer";

async function sendEventToServer(
  eventData: Record<string, unknown>,
  serverUrl = "http://localhost:4000/events",
): Promise<boolean> {
  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Claude-Code-Hook/1.0",
      },
      body: JSON.stringify(eventData),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return true;
    }
    console.error(`Server returned status: ${response.status}`);
    return false;
  } catch (e) {
    console.error(`Failed to send event: ${e}`);
    return false;
  }
}

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "source-app": { type: "string" },
      "event-type": { type: "string" },
      "server-url": { type: "string", default: "http://localhost:4000/events" },
      "add-chat": { type: "boolean", default: false },
      summarize: { type: "boolean", default: false },
    },
    strict: true,
  });

  const sourceApp = values["source-app"];
  const eventType = values["event-type"];
  const serverUrl = values["server-url"]!;
  const addChat = values["add-chat"]!;
  const summarize = values["summarize"]!;

  if (!sourceApp || !eventType) {
    console.error("--source-app and --event-type are required");
    process.exit(0);
  }

  let inputData: Record<string, unknown>;
  try {
    inputData = JSON.parse(await Bun.stdin.text());
  } catch (e) {
    console.error(`Failed to parse JSON input: ${e}`);
    process.exit(0);
  }

  // Extract model name from transcript (with caching)
  const sessionId = (inputData.session_id as string) ?? "unknown";
  const transcriptPath = (inputData.transcript_path as string) ?? "";
  let modelName = "";
  if (transcriptPath) {
    modelName = await getModelFromTranscript(sessionId, transcriptPath);
  }

  // Prepare event data for server
  const eventData: Record<string, unknown> = {
    source_app: sourceApp,
    session_id: sessionId,
    hook_event_type: eventType,
    payload: inputData,
    timestamp: Date.now(),
    model_name: modelName,
  };

  // Forward event-specific fields as top-level properties for easier querying.

  // tool_name: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest
  if ("tool_name" in inputData) {
    eventData.tool_name = inputData.tool_name;
  }

  // tool_use_id: PreToolUse, PostToolUse, PostToolUseFailure
  if ("tool_use_id" in inputData) {
    eventData.tool_use_id = inputData.tool_use_id;
  }

  // error, is_interrupt: PostToolUseFailure
  if ("error" in inputData) {
    eventData.error = inputData.error;
  }
  if ("is_interrupt" in inputData) {
    eventData.is_interrupt = inputData.is_interrupt;
  }

  // permission_suggestions: PermissionRequest
  if ("permission_suggestions" in inputData) {
    eventData.permission_suggestions = inputData.permission_suggestions;
  }

  // agent_id: SubagentStart, SubagentStop
  if ("agent_id" in inputData) {
    eventData.agent_id = inputData.agent_id;
  }

  // agent_type: SessionStart, SubagentStart, SubagentStop
  if ("agent_type" in inputData) {
    eventData.agent_type = inputData.agent_type;
  }

  // agent_transcript_path: SubagentStop
  if ("agent_transcript_path" in inputData) {
    eventData.agent_transcript_path = inputData.agent_transcript_path;
  }

  // stop_hook_active: Stop, SubagentStop
  if ("stop_hook_active" in inputData) {
    eventData.stop_hook_active = inputData.stop_hook_active;
  }

  // notification_type: Notification
  if ("notification_type" in inputData) {
    eventData.notification_type = inputData.notification_type;
  }

  // custom_instructions: PreCompact
  if ("custom_instructions" in inputData) {
    eventData.custom_instructions = inputData.custom_instructions;
  }

  // source: SessionStart
  if ("source" in inputData) {
    eventData.source = inputData.source;
  }

  // reason: SessionEnd
  if ("reason" in inputData) {
    eventData.reason = inputData.reason;
  }

  // Handle --add-chat option
  if (addChat && inputData.transcript_path) {
    const tPath = inputData.transcript_path as string;
    const tFile = Bun.file(tPath);
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
        eventData.chat = chatData;
      } catch (e) {
        console.error(`Failed to read transcript: ${e}`);
      }
    }
  }

  // Generate summary if requested
  if (summarize) {
    const summary = await generateEventSummary(eventData);
    if (summary) {
      eventData.summary = summary;
    }
    // Continue even if summary generation fails
  }

  // Send to server
  await sendEventToServer(eventData, serverUrl);

  // Always exit with 0 to not block Claude Code operations
  process.exit(0);
}

try {
  await main();
} catch {
  // Always exit 0 to never block Claude
  process.exit(0);
}
