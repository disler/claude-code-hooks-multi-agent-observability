/**
 * Summarizer Utility
 * Generates concise one-sentence summaries of hook events using Anthropic API.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Prompt the Anthropic LLM with a given text.
 */
async function promptLlm(promptText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      temperature: 0.3,
      messages: [{ role: "user", content: promptText }],
    });

    const block = message.content[0];
    if (block.type === "text") {
      return block.text.trim();
    }
    return null;
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

  const prompt = `Generate a one-sentence summary of this Claude Code hook event payload for an engineer monitoring the system.

Event Type: ${eventType}
Payload:
${payloadStr}

Requirements:
- ONE sentence only (no period at the end)
- Focus on the key action or information in the payload
- Be specific and technical
- Keep under 15 words
- Use present tense
- No quotes or formatting
- Return ONLY the summary text

Examples:
- Reads configuration file from project root
- Executes npm install to update dependencies
- Searches web for React documentation
- Edits database schema to add user table
- Agent responds with implementation plan

Generate the summary based on the payload:`;

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
