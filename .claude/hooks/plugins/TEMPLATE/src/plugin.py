#!/usr/bin/env python3
"""
Plugin Template - Entry Point

This is a template for creating Claude Code Hooks plugins.
Replace this docstring with your plugin's description.

Usage:
    1. Copy the TEMPLATE directory to a new plugin name
    2. Update plugin.json with your plugin metadata
    3. Implement your plugin logic in this file
    4. Add configuration in config/config.json
    5. Test using: python3 ../../plugin_manager.py --test <HookType>
"""

from pathlib import Path
from typing import Dict, Any
import json
import sys

# Plugin configuration (lazy-loaded)
_config = None


def load_config() -> Dict[str, Any]:
    """
    Load plugin configuration from config/config.json

    Returns:
        Configuration dictionary
    """
    global _config

    if _config is None:
        config_path = Path(__file__).parent.parent / "config" / "config.json"

        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    _config = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Plugin config error: {e}", file=sys.stderr)
                _config = {}
        else:
            _config = {}

    return _config


def handle_hook(hook_type: str, input_data: Dict[str, Any]) -> None:
    """
    Main entry point called by plugin manager for each hook event.

    This function is called for every hook event. Implement your plugin
    logic here or delegate to specific handler functions.

    Args:
        hook_type: Hook event type (e.g., "PostToolUse", "Stop", "Notification")
        input_data: Hook input data dictionary containing:
            - session_id: Session identifier
            - source_app: Agent name
            - ... hook-specific fields

    Returns:
        None

    Note:
        - This function should return quickly (< 100ms ideal)
        - Use threading for long-running operations
        - Always catch and log exceptions (never raise)
        - Plugin errors won't crash the hook (fail-safe)
    """

    try:
        # Load configuration
        config = load_config()

        # Check if plugin is enabled for this hook
        hook_config = config.get("hooks", {}).get(hook_type, {})
        if not hook_config.get("enabled", True):
            return

        # Delegate to specific handlers based on hook type
        if hook_type == "SessionStart":
            handle_session_start(input_data, hook_config)

        elif hook_type == "SessionEnd":
            handle_session_end(input_data, hook_config)

        elif hook_type == "PreToolUse":
            handle_pre_tool_use(input_data, hook_config)

        elif hook_type == "PostToolUse":
            handle_post_tool_use(input_data, hook_config)

        elif hook_type == "Stop":
            handle_stop(input_data, hook_config)

        elif hook_type == "SubagentStop":
            handle_subagent_stop(input_data, hook_config)

        elif hook_type == "Notification":
            handle_notification(input_data, hook_config)

        elif hook_type == "PreCompact":
            handle_pre_compact(input_data, hook_config)

        elif hook_type == "UserPromptSubmit":
            handle_user_prompt_submit(input_data, hook_config)

    except Exception as e:
        # Never let plugin errors crash the hook
        print(f"Plugin error in {hook_type}: {e}", file=sys.stderr)


# Hook-specific handlers
# Implement your logic in these functions

def handle_session_start(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle SessionStart events"""
    session_id = input_data.get("session_id", "unknown")
    source = input_data.get("source", "unknown")

    print(f"[Plugin] Session started: {session_id[:8]}... from {source}")

    # TODO: Implement your logic here


def handle_session_end(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle SessionEnd events"""
    session_id = input_data.get("session_id", "unknown")
    duration = input_data.get("duration_seconds", 0)

    print(f"[Plugin] Session ended: {session_id[:8]}... (duration: {duration}s)")

    # TODO: Implement your logic here


def handle_pre_tool_use(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle PreToolUse events"""
    tool_name = input_data.get("tool_name", "unknown")
    source_app = input_data.get("source_app", "unknown")

    print(f"[Plugin] {source_app} about to use: {tool_name}")

    # TODO: Implement your logic here


def handle_post_tool_use(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle PostToolUse events"""
    tool_name = input_data.get("tool_name", "unknown")
    source_app = input_data.get("source_app", "unknown")

    print(f"[Plugin] {source_app} used tool: {tool_name}")

    # TODO: Implement your logic here


def handle_stop(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle Stop events"""
    source_app = input_data.get("source_app", "unknown")
    session_id = input_data.get("session_id", "unknown")

    print(f"[Plugin] {source_app} completed all tasks (session: {session_id[:8]}...)")

    # TODO: Implement your logic here


def handle_subagent_stop(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle SubagentStop events"""
    source_app = input_data.get("source_app", "unknown")
    parent_session = input_data.get("parent_session_id", "unknown")

    print(f"[Plugin] Subagent {source_app} finished (parent: {parent_session[:8]}...)")

    # TODO: Implement your logic here


def handle_notification(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle Notification events"""
    source_app = input_data.get("source_app", "unknown")
    message = input_data.get("message", "")

    print(f"[Plugin] {source_app} notification: {message}")

    # TODO: Implement your logic here


def handle_pre_compact(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle PreCompact events"""
    session_id = input_data.get("session_id", "unknown")
    trigger = input_data.get("trigger", "unknown")

    print(f"[Plugin] Compaction starting for {session_id[:8]}... (trigger: {trigger})")

    # TODO: Implement your logic here


def handle_user_prompt_submit(input_data: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Handle UserPromptSubmit events"""
    session_id = input_data.get("session_id", "unknown")
    prompt = input_data.get("prompt", "")

    print(f"[Plugin] User submitted prompt in {session_id[:8]}...")

    # TODO: Implement your logic here


# For testing: Allow running this module directly
if __name__ == "__main__":
    print("Plugin Template - Manual Test")
    print("=" * 60)

    # Test data for different hook types
    test_cases = {
        "PostToolUse": {
            "session_id": "test-session-12345678",
            "source_app": "TestAgent",
            "tool_name": "Read",
            "args": {"file_path": "/test/file.txt"}
        },
        "Stop": {
            "session_id": "test-session-12345678",
            "source_app": "TestAgent"
        },
        "Notification": {
            "session_id": "test-session-12345678",
            "source_app": "TestAgent",
            "message": "User input needed"
        }
    }

    # Run tests
    for hook_type, input_data in test_cases.items():
        print(f"\nTesting hook: {hook_type}")
        print(f"Input data: {json.dumps(input_data, indent=2)}")
        print("-" * 60)
        handle_hook(hook_type, input_data)
        print("✓ Test complete")

    print("\n" + "=" * 60)
    print("All tests complete")
