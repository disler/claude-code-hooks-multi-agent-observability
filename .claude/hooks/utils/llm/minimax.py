#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "python-dotenv",
# ]
# ///

"""MiniMax provider adapter for hook-generated text."""

import json
import os
import sys
import urllib.error
import urllib.request

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv():
        return False


PROVIDER_KEY = "minimax"
PROVIDER_DISPLAY_NAME = "MiniMax"
DEFAULT_REGION = "global_en"
DEFAULT_PROTOCOL = "anthropic"
DEFAULT_MODEL = "MiniMax-M3"

MODEL_REGISTRY = {
    "MiniMax-M3": {
        "context_window": 1000000,
        "pricing_usd_per_million_tokens": {
            "input": 0.3,
            "output": 1.2,
            "cache_read": 0.06,
            "cache_write": None,
        },
        "input_modalities": ["text", "image", "video"],
        "thinking": ["adaptive", "disabled"],
    },
    "MiniMax-M2.7": {
        "context_window": 204800,
        "pricing_usd_per_million_tokens": {
            "input": 0.3,
            "output": 1.2,
            "cache_read": 0.06,
            "cache_write": 0.375,
        },
        "input_modalities": ["text"],
        "thinking": ["always_on"],
    },
}

ENDPOINT_REGISTRY = {
    "global_en": {
        "openai_base_url": "https://api.minimax.io/v1",
        "anthropic_base_url": "https://api.minimax.io/anthropic",
    },
    "cn_zh": {
        "openai_base_url": "https://api.minimaxi.com/v1",
        "anthropic_base_url": "https://api.minimaxi.com/anthropic",
    },
}

PROVIDER_REGISTRY = {
    PROVIDER_KEY: {
        "display_name": PROVIDER_DISPLAY_NAME,
        "aliases": [PROVIDER_KEY],
        "models": MODEL_REGISTRY,
        "endpoints": ENDPOINT_REGISTRY,
    }
}


def _join_url(base_url, path):
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def get_provider_config():
    """Return the validated user-facing provider configuration."""
    load_dotenv()

    api_key = os.getenv("MINIMAX_API_KEY", "").strip()
    region = os.getenv("MINIMAX_REGION", DEFAULT_REGION).strip()
    protocol = os.getenv("MINIMAX_PROTOCOL", DEFAULT_PROTOCOL).strip().lower()
    model = os.getenv("MINIMAX_MODEL", DEFAULT_MODEL).strip()

    if not api_key or region not in ENDPOINT_REGISTRY:
        return None
    if protocol not in {"openai", "anthropic"} or model not in MODEL_REGISTRY:
        return None

    endpoint = ENDPOINT_REGISTRY[region]
    base_url = endpoint[f"{protocol}_base_url"]
    return {
        "api_key": api_key,
        "region": region,
        "protocol": protocol,
        "model": model,
        "base_url": base_url,
    }


def build_request(prompt_text, config):
    """Build a protocol request while keeping public base URLs unchanged."""
    protocol = config["protocol"]
    if protocol == "openai":
        url = _join_url(config["base_url"], "chat/completions")
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config["model"],
            "messages": [{"role": "user", "content": prompt_text}],
            "max_tokens": 100,
        }
    else:
        url = _join_url(config["base_url"], "v1/messages")
        headers = {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": config["api_key"],
        }
        payload = {
            "model": config["model"],
            "max_tokens": 100,
            "messages": [{"role": "user", "content": prompt_text}],
        }

    return urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )


def _extract_text(payload, protocol):
    if protocol == "openai":
        choices = payload.get("choices", [])
        if not choices:
            return None
        content = choices[0].get("message", {}).get("content")
        if isinstance(content, str):
            return content.strip()
        return None

    content_blocks = payload.get("content", [])
    text_parts = [
        block.get("text", "")
        for block in content_blocks
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    text = "".join(text_parts).strip()
    return text or None


def request_completion(prompt_text, config=None, opener=None):
    """Send a single text request and return its text content."""
    config = config or get_provider_config()
    if not config:
        return None

    opener = opener or urllib.request.urlopen
    try:
        request = build_request(prompt_text, config)
        with opener(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return _extract_text(payload, config["protocol"])
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError):
        return None


def prompt_llm(prompt_text):
    return request_completion(prompt_text)


def _clean_response(response):
    if not response:
        return None
    response = response.strip().strip('"').strip("'").strip()
    return response.split("\n", 1)[0].strip()


def generate_completion_message():
    response = prompt_llm(
        "Generate a short, concise, friendly completion message for an AI coding assistant. "
        "Keep it under 10 words. Return only the message text."
    )
    return _clean_response(response)


def generate_agent_name():
    response = _clean_response(
        prompt_llm(
            "Generate one memorable alphanumeric name for a coding assistant. "
            "Use 4-12 characters and return only the name."
        )
    )
    if response and response.isalnum() and 4 <= len(response) <= 12:
        return response
    return None


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--completion":
            response = generate_completion_message()
        elif sys.argv[1] == "--agent-name":
            response = generate_agent_name()
        else:
            response = prompt_llm(" ".join(sys.argv[1:]))
        print(response or "Error calling MiniMax API")
    else:
        print("Usage: ./minimax.py 'your prompt here' or ./minimax.py --completion")


if __name__ == "__main__":
    main()
