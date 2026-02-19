/**
 * Summarizer Utility
 * Generates concise one-sentence summaries of hook events using claude -p with Haiku.
 *
 * Uses `claude --print` subprocess instead of @anthropic-ai/sdk so:
 * - No npm dependency needed (zero package.json)
 * - Inference covered by Max subscription (no API key cost)
 * - --setting-sources '' prevents hook recursion
 * - --tools '' disables tools for faster response
 *
 * Pattern adapted from PAI's Inference.ts (proven in 4+ production hooks).
 */

const SYSTEM_PROMPT = `You generate one-sentence summaries of Claude Code hook events for engineers.
Rules: ONE sentence, under 15 words, present tense, no quotes, no period at end, no formatting.
Return ONLY the summary text.`;

/**
 * Prompt Haiku via claude --print subprocess.
 */
async function promptLlm(promptText: string): Promise<string | null> {
  try {
    // Strip ANTHROPIC_API_KEY to force subscription auth (Max plan)
    // Strip CLAUDECODE to allow nested claude invocation from hooks
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.CLAUDECODE;

    const proc = Bun.spawn(
      [
        "claude",
        "--print",
        "--model", "haiku",
        "--tools", "",
        "--output-format", "text",
        "--setting-sources", "",
        "--system-prompt", SYSTEM_PROMPT,
      ],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env,
      },
    );

    // Write prompt via stdin to avoid ARG_MAX limits
    proc.stdin.write(promptText);
    proc.stdin.end();

    // 10s timeout — summaries are simple, Haiku is fast
    const timeout = setTimeout(() => proc.kill(), 10000);

    const output = await new Response(proc.stdout).text();
    clearTimeout(timeout);

    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;

    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate a concise one-sentence summary of a hook event for engineers.
 */
export async function generateEventSummary(
  eventData: Record<string, unknown>,
): Promise<string | null> {
  const eventType = (eventData.hook_event_type as string) ?? "Unknown";
  const payload = eventData.payload ?? {};

  let payloadStr = JSON.stringify(payload, null, 2);
  if (payloadStr.length > 1000) {
    payloadStr = payloadStr.slice(0, 1000) + "...";
  }

  const prompt = `Event Type: ${eventType}
Payload:
${payloadStr}

Examples:
- Reads configuration file from project root
- Executes npm install to update dependencies
- Searches web for React documentation
- Edits database schema to add user table
- Agent responds with implementation plan

Generate the summary:`;

  let summary = await promptLlm(prompt);

  if (summary) {
    summary = summary.replace(/^["']|["']$/g, "").replace(/\.$/, "");
    // Take only the first line if multiple
    summary = summary.split("\n")[0].trim();
    // Ensure it's not too long
    if (summary.length > 100) {
      summary = summary.slice(0, 97) + "...";
    }
  }

  return summary;
}
