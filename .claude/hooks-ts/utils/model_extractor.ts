/**
 * Model Extractor Utility
 * Extracts model name from Claude Code transcript with optional caching.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";

// Set to false to disable caching and always read from transcript
const ENABLE_CACHING = false;

/**
 * Extract model name from transcript with file-based caching.
 */
export async function getModelFromTranscript(
  sessionId: string,
  transcriptPath: string,
  ttl = 60,
): Promise<string> {
  const cacheDir = join(homedir(), ".claude", "data", "claude-model-cache");
  await mkdir(cacheDir, { recursive: true });

  const cacheFile = join(cacheDir, `${sessionId}.json`);
  const currentTime = Date.now() / 1000;

  // Try to read from cache (only if caching is enabled)
  if (ENABLE_CACHING) {
    const file = Bun.file(cacheFile);
    if (await file.exists()) {
      try {
        const cacheData = JSON.parse(await file.text());
        const cacheAge = currentTime - (cacheData.timestamp ?? 0);
        if (cacheAge < ttl) {
          return cacheData.model ?? "";
        }
      } catch {
        // Cache file corrupted or unreadable, will regenerate
      }
    }
  }

  // Cache miss or stale - extract from transcript
  const modelName = await extractModelFromTranscript(transcriptPath);

  // Save to cache (only if caching is enabled)
  if (ENABLE_CACHING) {
    try {
      const cacheData = {
        model: modelName,
        timestamp: currentTime,
        ttl,
      };
      await Bun.write(cacheFile, JSON.stringify(cacheData));
    } catch {
      // Cache write failed, not critical
    }
  }

  return modelName;
}

/**
 * Extract model name from transcript by finding most recent assistant message.
 */
async function extractModelFromTranscript(
  transcriptPath: string,
): Promise<string> {
  const file = Bun.file(transcriptPath);
  if (!(await file.exists())) {
    return "";
  }

  try {
    const content = await file.text();
    const lines = content.split("\n");

    // Iterate in reverse to find most recent assistant message with model
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (
          entry.type === "assistant" &&
          entry.message &&
          entry.message.model
        ) {
          return entry.message.model;
        }
      } catch {
        // Skip invalid JSON lines
        continue;
      }
    }
  } catch {
    // File read error
    return "";
  }

  return "";
}
