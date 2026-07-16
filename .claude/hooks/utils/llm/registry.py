"""Provider selection for hook-generated text."""

import os

from .minimax import PROVIDER_REGISTRY, PROVIDER_KEY, prompt_llm as minimax_prompt_llm


def selected_provider():
    return os.getenv("LLM_PROVIDER", "").strip().lower()


def prompt_llm(prompt_text):
    if selected_provider() == PROVIDER_KEY:
        return minimax_prompt_llm(prompt_text)

    from .anth import prompt_llm as default_prompt_llm

    return default_prompt_llm(prompt_text)
