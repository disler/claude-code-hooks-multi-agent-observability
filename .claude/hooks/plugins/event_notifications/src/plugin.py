#!/usr/bin/env python3
"""
Audio Announcements Plugin Entry Point

This module serves as the entry point for the audio announcements plugin.
It's called by the plugin manager for each hook event.

Plugin Manager Interface:
    The plugin manager calls: handle_hook(hook_type, input_data)

    Args:
        hook_type (str): Hook event type (e.g., "PostToolUse", "Stop", "Notification")
        input_data (dict): Hook input data containing:
            - source_app: Agent name
            - session_id: Session identifier
            - tool_name: Name of tool (for tool-related hooks)
            - event: Event type (for session hooks)
            - ... other hook-specific data

Usage:
    This module is automatically loaded by the plugin manager.
    No direct usage required - just configure config/audio_config.json
"""

from pathlib import Path
from typing import Dict, Any
import sys

# Add plugin src to path for imports
plugin_root = Path(__file__).parent.parent
src_path = plugin_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

# Import the existing audio announcer
try:
    from audio_announcer import AudioAnnouncer
except ImportError:
    # Fallback for different import contexts
    try:
        from .audio_announcer import AudioAnnouncer
    except ImportError:
        # If we can't import, create a dummy class
        class AudioAnnouncer:
            def __init__(self):
                pass

            def announce(self, hook_type, input_data):
                print(f"Audio announcer not available for {hook_type}", file=sys.stderr)


# Singleton announcer instance (lazy initialization)
_announcer = None


def handle_hook(hook_type: str, input_data: Dict[str, Any]) -> None:
    """
    Main entry point called by plugin manager for each hook event.

    This function is called for every hook event. It initializes the audio
    announcer (if needed) and delegates to the existing announcement logic.

    Args:
        hook_type: Hook event type (e.g., "PostToolUse", "Stop", "Notification")
        input_data: Hook input data dictionary

    Returns:
        None

    Note:
        This function executes in a background thread/process, so it won't
        block the main hook execution. Errors are caught and logged but
        never propagate to crash the hook.
    """
    global _announcer

    try:
        # Lazy initialization of announcer (only create once)
        if _announcer is None:
            _announcer = AudioAnnouncer()

        # Make announcement (existing logic handles background execution)
        _announcer.announce(hook_type, input_data)

    except Exception as e:
        # Never let plugin errors crash the hook
        # Errors are logged to stderr for debugging
        print(f"Audio announcements plugin error: {e}", file=sys.stderr)


# For testing: Allow running this module directly
if __name__ == "__main__":
    import json

    # Test data
    test_cases = {
        "PostToolUse": {
            "source_app": "TestPlugin",
            "session_id": "test-12345678",
            "tool_name": "Read",
            "args": {"file_path": "/test/file.txt"}
        },
        "Stop": {
            "source_app": "TestPlugin",
            "session_id": "test-12345678"
        },
        "Notification": {
            "source_app": "TestPlugin",
            "session_id": "test-12345678",
            "message": "User input needed"
        }
    }

    print("Testing Audio Announcements Plugin")
    print("=" * 60)

    for hook_type, input_data in test_cases.items():
        print(f"\nTesting hook: {hook_type}")
        print(f"Input data: {json.dumps(input_data, indent=2)}")
        print("-" * 60)
        handle_hook(hook_type, input_data)
        print("✓ Test complete")

    print("\n" + "=" * 60)
    print("All tests complete")
