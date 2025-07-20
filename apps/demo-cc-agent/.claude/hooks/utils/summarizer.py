#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "anthropic",
#     "python-dotenv",
# ]
# ///

import json
from typing import Optional, Dict, Any
from .llm.anth import prompt_llm
from .localization import t, get_language


def generate_event_summary(event_data: Dict[str, Any]) -> Optional[str]:
    """
    Generate a concise one-sentence summary of a hook event for engineers.

    Args:
        event_data: The hook event data containing event_type, payload, etc.

    Returns:
        str: A one-sentence summary, or None if generation fails
    """
    event_type = event_data.get("hook_event_type", "Unknown")
    payload = event_data.get("payload", {})

    # Convert payload to string representation
    payload_str = json.dumps(payload, indent=2)
    if len(payload_str) > 1000:
        payload_str = payload_str[:1000] + "..."

    language_name = t(f"language_name_{get_language()}")
    prompt = t("summary_prompt", language_name=language_name, event_type=event_type, payload_str=payload_str)

    summary = prompt_llm(prompt)

    # Clean up the response
    if summary:
        summary = summary.strip().strip('"').strip("'").strip(".")
        # Take only the first line if multiple
        summary = summary.split("\n")[0].strip()
        # Ensure it's not too long
        if len(summary) > 100:
            summary = summary[:97] + "..."

    return summary
