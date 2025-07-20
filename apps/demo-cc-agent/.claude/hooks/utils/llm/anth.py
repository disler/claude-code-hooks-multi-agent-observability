#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "anthropic",
#     "python-dotenv",
# ]
# ///

import os
import sys
from dotenv import load_dotenv
from ..localization import t, get_language

def prompt_llm(prompt_text):
    """
    Base Anthropic LLM prompting method using fastest model.

    Args:
        prompt_text (str): The prompt to send to the model

    Returns:
        str: The model's response text, or None if error
    """
    load_dotenv()

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        message = client.messages.create(
            model="claude-3-5-haiku-20241022",  # Fastest Anthropic model
            max_tokens=100,
            temperature=0.7,
            messages=[{"role": "user", "content": prompt_text}],
        )

        return message.content[0].text.strip()

    except Exception:
        return None


def generate_completion_message():
    """
    Generate a completion message using Anthropic LLM.

    Returns:
        str: A natural language completion message, or None if error
    """
    engineer_name = os.getenv("ENGINEER_NAME", "").strip()
    language_name = t(f"language_name_{get_language()}")

    if engineer_name:
        name_instruction = t("engineer_name_instruction", engineer_name=engineer_name)
        examples = t("examples_personalized", engineer_name=engineer_name)
    else:
        name_instruction = ""
        examples = t("examples_standard")

    prompt = t("anth_oai_completion_prompt", name_instruction=name_instruction, examples=examples, language_name=language_name)

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
                print(t("error_generating_completion"))
        else:
            prompt_text = " ".join(sys.argv[1:])
            response = prompt_llm(prompt_text)
            if response:
                print(response)
            else:
                print(t("error_calling_api", api_name="Anthropic"))
    else:
        script_name = os.path.basename(__file__)
        print(t("usage_prompt", script_name=script_name))


if __name__ == "__main__":
    main()
