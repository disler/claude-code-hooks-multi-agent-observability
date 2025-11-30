#!/usr/bin/env python3
"""
Hook Integration Wrapper

Simple wrapper function for integrating audio announcements into existing hooks.
This is the only function that hook scripts need to call.
"""

import sys
import subprocess
from pathlib import Path
from typing import Dict, Any


def announce_hook(hook_type: str, input_data: Dict[str, Any]) -> None:
    """
    Make an audio announcement for a hook event.

    This function is designed to be called from existing hook scripts.
    It runs the audio announcement in a background subprocess to avoid
    blocking the main hook execution.

    Args:
        hook_type: Type of hook event (e.g., "PostToolUse", "Stop")
        input_data: Input data from the hook (must be JSON-serializable)

    Example:
        from plugins.audio_announcements.src.hook_integration import announce_hook
        announce_hook("PostToolUse", input_data)
    """
    try:
        # Get the plugin root directory
        plugin_root = Path(__file__).parent.parent
        announcer_script = plugin_root / "src" / "_announce_background.py"

        # Run announcement in background (non-blocking)
        subprocess.Popen(
            [sys.executable, str(announcer_script), hook_type],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True
        ).communicate(input=str(input_data), timeout=0.1)

    except:
        # Silently fail - never interrupt the hook
        pass


def announce_hook_sync(hook_type: str, input_data: Dict[str, Any]) -> bool:
    """
    Make a synchronous audio announcement (blocks until complete).

    Use this only when you need to ensure the announcement completes
    before the hook finishes (e.g., in stop hooks).

    Args:
        hook_type: Type of hook event
        input_data: Input data from the hook

    Returns:
        True if announcement was made successfully, False otherwise
    """
    try:
        try:
            from .audio_announcer import AudioAnnouncer
        except ImportError:
            from audio_announcer import AudioAnnouncer

        announcer = AudioAnnouncer()
        return announcer.announce(hook_type, input_data)

    except:
        # Silently fail - never interrupt the hook
        return False
