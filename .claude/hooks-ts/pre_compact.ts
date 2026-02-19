/**
 * Pre-Compact Hook (TypeScript port)
 * Backs up the transcript before compaction (manual or auto) and logs
 * the pre-compact event with trigger type and custom instructions.
 *
 * Usage: bun .claude/hooks-ts/pre_compact.ts [--backup] [--verbose]
 */

import { parseArgs } from "node:util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { copyFile } from "node:fs/promises";

const LOG_DIR = "logs";

async function logPreCompact(
  inputData: Record<string, unknown>,
  customInstructions: string,
) {
  await mkdir(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, "pre_compact.json");

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
      (inputData.hook_event_name as string) ?? "PreCompact",
    trigger: (inputData.trigger as string) ?? "unknown",
    custom_instructions: customInstructions,
  };

  logData.push(logEntry);
  await Bun.write(logPath, JSON.stringify(logData, null, 2));
}

async function backupTranscript(
  transcriptPath: string,
  trigger: string,
  customInstructions: string,
): Promise<string | null> {
  try {
    const tFile = Bun.file(transcriptPath);
    if (!(await tFile.exists())) return null;

    const backupDir = join(LOG_DIR, "transcript_backups");
    await mkdir(backupDir, { recursive: true });

    // Generate backup filename with timestamp and trigger
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:T]/g, (m) => (m === "T" ? "_" : ""))
      .slice(0, 15);

    // Extract session name from path (stem)
    const parts = transcriptPath.split("/");
    const fileName = parts[parts.length - 1];
    const sessionName = fileName.replace(/\.[^.]+$/, "");

    // Include sanitized custom instructions in filename if present
    let suffix = "";
    if (customInstructions) {
      const sanitized = customInstructions
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/^_+|_+$/g, "");
      if (sanitized) {
        suffix = `_${sanitized}`;
      }
    }

    const backupName = `${sessionName}_pre_compact_${trigger}${suffix}_${timestamp}.jsonl`;
    const backupPath = join(backupDir, backupName);

    await copyFile(transcriptPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        backup: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
      },
      strict: true,
    });

    const inputData = JSON.parse(await Bun.stdin.text());

    const sessionId = (inputData.session_id as string) ?? "unknown";
    const transcriptPath = (inputData.transcript_path as string) ?? "";
    const trigger = (inputData.trigger as string) ?? "unknown";
    const customInstructions =
      (inputData.custom_instructions as string) ?? "";

    // Log the pre-compact event
    await logPreCompact(inputData, customInstructions);

    // Create backup if requested
    let backupPath: string | null = null;
    if (values.backup && transcriptPath) {
      backupPath = await backupTranscript(
        transcriptPath,
        trigger,
        customInstructions,
      );
    }

    // Provide verbose feedback
    if (values.verbose) {
      let message: string;
      if (trigger === "manual") {
        message = `Preparing for manual compaction (session: ${sessionId.slice(0, 8)}...)`;
        if (customInstructions) {
          message += `\nCustom instructions: ${customInstructions.slice(0, 100)}...`;
        }
      } else {
        message = `Auto-compaction triggered due to full context window (session: ${sessionId.slice(0, 8)}...)`;
      }

      if (backupPath) {
        message += `\nTranscript backed up to: ${backupPath}`;
      }

      console.log(message);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

await main();
