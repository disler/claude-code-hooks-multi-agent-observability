#!/usr/bin/env python3
"""
Plugin Template - Test Suite

Run these tests to verify your plugin works correctly.

Usage:
    python3 test_plugin.py
"""

import sys
from pathlib import Path

# Add plugin to path
plugin_dir = Path(__file__).parent.parent
sys.path.insert(0, str(plugin_dir))

from src.plugin import handle_hook


def test_post_tool_use():
    """Test PostToolUse handling"""
    print("Testing PostToolUse...")

    input_data = {
        "session_id": "test-session-12345678",
        "source_app": "TestAgent",
        "tool_name": "Read",
        "args": {"file_path": "/test/file.txt"}
    }

    # Should not raise
    handle_hook("PostToolUse", input_data)
    print("✓ PostToolUse test passed")


def test_stop():
    """Test Stop handling"""
    print("\nTesting Stop...")

    input_data = {
        "session_id": "test-session-12345678",
        "source_app": "TestAgent"
    }

    handle_hook("Stop", input_data)
    print("✓ Stop test passed")


def test_notification():
    """Test Notification handling"""
    print("\nTesting Notification...")

    input_data = {
        "session_id": "test-session-12345678",
        "source_app": "TestAgent",
        "message": "User input needed"
    }

    handle_hook("Notification", input_data)
    print("✓ Notification test passed")


def test_session_start():
    """Test SessionStart handling"""
    print("\nTesting SessionStart...")

    input_data = {
        "session_id": "test-session-12345678",
        "source": "cli",
        "timestamp": "2025-01-01T00:00:00Z",
        "project_dir": "/test/project"
    }

    handle_hook("SessionStart", input_data)
    print("✓ SessionStart test passed")


def test_session_end():
    """Test SessionEnd handling"""
    print("\nTesting SessionEnd...")

    input_data = {
        "session_id": "test-session-12345678",
        "timestamp": "2025-01-01T01:00:00Z",
        "duration_seconds": 3600
    }

    handle_hook("SessionEnd", input_data)
    print("✓ SessionEnd test passed")


def test_error_handling():
    """Test error handling with malformed input"""
    print("\nTesting error handling...")

    # Missing required fields
    input_data = {}

    # Should not raise (fail gracefully)
    try:
        handle_hook("PostToolUse", input_data)
        print("✓ Error handling test passed")
    except Exception as e:
        print(f"✗ Error handling test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    print("Plugin Template - Test Suite")
    print("=" * 60)

    try:
        test_post_tool_use()
        test_stop()
        test_notification()
        test_session_start()
        test_session_end()
        test_error_handling()

        print("\n" + "=" * 60)
        print("✓ All tests passed!")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        sys.exit(1)
