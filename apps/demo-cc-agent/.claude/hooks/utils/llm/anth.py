#!/usr/bin/env python3
"""
Base LLM prompting via `claude --print` subprocess with Haiku.

Uses claude CLI instead of @anthropic-ai/sdk so:
- No pip dependency on anthropic package
- Inference covered by Max subscription (no API key cost)
- --setting-sources '' prevents hook recursion
- --tools '' disables tools for faster response

Pattern adapted from PAI's Inference.ts.
"""

import os
import sys
import subprocess

SYSTEM_PROMPT = (
    "You are a concise assistant. Follow the user's formatting instructions exactly. "
    "Return ONLY the requested output, no quotes, no formatting, no explanations."
)


def prompt_llm(prompt_text, system_prompt=None, timeout=10):
    """
    Prompt Haiku via claude --print subprocess.

    Args:
        prompt_text (str): The prompt to send to the model
        system_prompt (str): Optional system prompt override
        timeout (int): Timeout in seconds (default 10)

    Returns:
        str: The model's response text, or None if error
    """
    try:
        # Strip ANTHROPIC_API_KEY to force subscription auth (Max plan)
        # Strip CLAUDECODE to allow nested claude invocation from hooks
        env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "CLAUDECODE")}

        cmd = [
            "claude",
            "--print",
            "--model", "haiku",
            "--tools", "",
            "--output-format", "text",
            "--setting-sources", "",
            "--system-prompt", system_prompt or SYSTEM_PROMPT,
        ]

        result = subprocess.run(
            cmd,
            input=prompt_text,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )

        if result.returncode != 0:
            return None

        output = result.stdout.strip()
        return output if output else None

    except (subprocess.TimeoutExpired, Exception):
        return None


def generate_completion_message():
    """
    Generate a completion message using Haiku.

    Returns:
        str: A natural language completion message, or None if error
    """
    engineer_name = os.getenv("ENGINEER_NAME", "").strip()

    if engineer_name:
        name_instruction = f"Sometimes (about 30% of the time) include the engineer's name '{engineer_name}' in a natural way."
        examples = f"""Examples of the style:
- Standard: "Work complete!", "All done!", "Task finished!", "Ready for your next move!"
- Personalized: "{engineer_name}, all set!", "Ready for you, {engineer_name}!", "Complete, {engineer_name}!", "{engineer_name}, we're done!" """
    else:
        name_instruction = ""
        examples = """Examples of the style: "Work complete!", "All done!", "Task finished!", "Ready for your next move!" """

    prompt = f"""Generate a short, concise, friendly completion message for when an AI coding assistant finishes a task.

Requirements:
- Keep it under 10 words
- Make it positive and future focused
- Use natural, conversational language
- Focus on completion/readiness
- Do NOT include quotes, formatting, or explanations
- Return ONLY the completion message text
{name_instruction}

{examples}

Generate ONE completion message:"""

    response = prompt_llm(prompt)

    # Clean up response - remove quotes and extra formatting
    if response:
        response = response.strip().strip('"').strip("'").strip()
        # Take first line if multiple lines
        response = response.split("\n")[0].strip()

    return response


def main():
    """Command line interface for testing."""
    if len(sys.argv) > 1:
        if sys.argv[1] == "--completion":
            message = generate_completion_message()
            if message:
                print(message)
            else:
                print("Error generating completion message")
        else:
            prompt_text = " ".join(sys.argv[1:])
            response = prompt_llm(prompt_text)
            if response:
                print(response)
            else:
                print("Error calling claude CLI")
    else:
        print("Usage: ./anth.py 'your prompt here' or ./anth.py --completion")


if __name__ == "__main__":
    main()
