#!/usr/bin/env python3
"""
Audio Announcements Test Script

Test audio announcements for different hook scenarios.

Usage:
    ./test.py                          # Test all enabled hooks
    ./test.py --hook Stop              # Test specific hook
    ./test.py --hook PostToolUse       # Test tool completion
    ./test.py --all                    # Test all hooks (even disabled ones)
    ./test.py --list                   # List all available hooks
    ./test.py --providers              # Test all TTS providers
"""

import sys
import json
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from audio_announcer import AudioAnnouncer


# Test data templates for each hook type
HOOK_TEST_DATA = {
    "PreToolUse": {
        "source_app": "TestAgent",
        "session_id": "test1234-5678-90ab-cdef",
        "tool_name": "Read",
        "payload": {
            "file_path": "/path/to/test.py"
        }
    },
    "PostToolUse": {
        "source_app": "TestAgent",
        "session_id": "test1234-5678-90ab-cdef",
        "tool_name": "Read",
        "payload": {
            "file_path": "/path/to/test.py",
            "success": True
        }
    },
    "Stop": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "tool_name": "Task",
        "payload": {
            "task_completed": True
        }
    },
    "SubagentStop": {
        "source_app": "CodeReviewer",
        "session_id": "subagent-5678-90ab-cdef",
        "tool_name": "Task",
        "payload": {
            "parent_session": "test1234",
            "task_completed": True
        }
    },
    "Notification": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "payload": {
            "message": "User input needed",
            "priority": "high"
        }
    },
    "SessionStart": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "payload": {
            "model": "claude-sonnet-4-5",
            "timestamp": "2025-01-30T12:00:00Z"
        }
    },
    "SessionEnd": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "payload": {
            "duration": "5m 30s",
            "tools_used": 15
        }
    },
    "PreCompact": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "payload": {
            "context_size": 150000,
            "threshold": 180000
        }
    },
    "UserPromptSubmit": {
        "source_app": "GeneralPurpose",
        "session_id": "test1234-5678-90ab-cdef",
        "payload": {
            "prompt_length": 250,
            "has_attachments": False
        }
    }
}


def list_hooks():
    """List all available hook types"""
    print("\nAvailable Hook Types:")
    print("=" * 50)
    for i, hook_type in enumerate(sorted(HOOK_TEST_DATA.keys()), 1):
        print(f"{i:2}. {hook_type}")
    print()


def test_hook(announcer, hook_type, verbose=False):
    """Test a specific hook type"""
    if hook_type not in HOOK_TEST_DATA:
        print(f"❌ Unknown hook type: {hook_type}")
        print(f"   Use --list to see available hooks")
        return False

    test_data = HOOK_TEST_DATA[hook_type]

    # Check if hook is enabled
    hook_config = announcer.config.get("hooks", {}).get(hook_type, {})
    is_enabled = hook_config.get("enabled", False)

    status = "✓ ENABLED" if is_enabled else "⚠ DISABLED"

    print(f"\n{'='*60}")
    print(f"Testing: {hook_type} [{status}]")
    print(f"{'='*60}")

    if verbose:
        print(f"\nTest Data:")
        print(json.dumps(test_data, indent=2))
        print()

    # Get expected announcement
    context = announcer._prepare_context(hook_type, test_data)
    announcement_text = announcer._get_announcement_text(hook_type, context)

    if announcement_text:
        print(f"📢 Announcement: \"{announcement_text}\"")
    else:
        print(f"🔇 No announcement (hook disabled or no template)")

    # Check for sound effect
    sound_effect = hook_config.get("sound_effect")
    if sound_effect:
        print(f"🔔 Sound Effect: {sound_effect}")

    # Make the announcement
    print(f"\n🎙️  Playing...")
    result = announcer.announce(hook_type, test_data)

    if result:
        print(f"✅ Success!")
    elif is_enabled:
        print(f"❌ Failed (check TTS provider)")
    else:
        print(f"⏭️  Skipped (hook disabled)")

    print(f"{'='*60}")

    return result


def test_all_hooks(announcer, include_disabled=False, verbose=False):
    """Test all hooks"""
    print("\n" + "="*60)
    print("Testing All Hooks")
    print("="*60)

    results = {}

    for hook_type in sorted(HOOK_TEST_DATA.keys()):
        hook_config = announcer.config.get("hooks", {}).get(hook_type, {})
        is_enabled = hook_config.get("enabled", False)

        if not is_enabled and not include_disabled:
            print(f"\n⏭️  Skipping {hook_type} (disabled)")
            continue

        result = test_hook(announcer, hook_type, verbose=verbose)
        results[hook_type] = result

        # Pause between announcements
        if result:
            import time
            time.sleep(1.5)

    # Print summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)

    success_count = sum(1 for r in results.values() if r)
    total_count = len(results)

    print(f"\nTotal: {total_count} hooks tested")
    print(f"Success: {success_count}")
    print(f"Failed: {total_count - success_count}")
    print()

    for hook_type, result in results.items():
        status = "✅" if result else "❌"
        print(f"  {status} {hook_type}")

    print()


def test_providers(announcer):
    """Test all available TTS providers"""
    from tts_providers import (
        MacOSSayProvider,
        ElevenLabsProvider,
        OpenAIProvider,
        Pyttsx3Provider
    )

    print("\n" + "="*60)
    print("Testing TTS Providers")
    print("="*60)

    providers = [
        ("macOS Say", MacOSSayProvider(voice="Samantha", rate=200)),
        ("ElevenLabs", ElevenLabsProvider(voice="Dan")),
        ("OpenAI", OpenAIProvider(voice="alloy")),
        ("pyttsx3", Pyttsx3Provider(rate=180))
    ]

    test_text = "Testing text to speech provider"

    for name, provider in providers:
        print(f"\n{'─'*60}")
        print(f"Provider: {name}")
        print(f"{'─'*60}")

        available = provider.is_available()
        print(f"Available: {'✅ Yes' if available else '❌ No'}")

        if available:
            print(f"Text: \"{test_text}\"")
            print(f"Playing...")
            result = provider.speak(test_text)
            print(f"Result: {'✅ Success' if result else '❌ Failed'}")

            # Pause between providers
            import time
            time.sleep(2)
        else:
            print(f"Reason: Missing API key or dependencies")

    print(f"\n{'='*60}\n")


def show_config(announcer):
    """Show current configuration"""
    print("\n" + "="*60)
    print("Current Configuration")
    print("="*60)

    print(f"\nGlobal Settings:")
    print(f"  Enabled: {announcer.config.get('enabled', False)}")
    print(f"  TTS Provider: {announcer.config.get('tts_provider', 'none')}")
    print(f"  Verbosity: {announcer.config.get('verbosity_level', 'minimal')}")

    if announcer.tts_provider:
        print(f"  Active Provider: {announcer.tts_provider.__class__.__name__}")
    else:
        print(f"  Active Provider: None (check configuration)")

    print(f"\nHook Status:")
    hooks = announcer.config.get("hooks", {})

    enabled_count = sum(1 for h in hooks.values() if h.get("enabled", False))
    total_count = len(hooks)

    print(f"  Total: {total_count}")
    print(f"  Enabled: {enabled_count}")
    print(f"  Disabled: {total_count - enabled_count}")

    print(f"\nEnabled Hooks:")
    for hook_type, hook_config in sorted(hooks.items()):
        if hook_config.get("enabled", False):
            category = hook_config.get("template_category", "none")
            sound = hook_config.get("sound_effect", "none")
            print(f"  • {hook_type:20} → {category:20} (sound: {sound})")

    print()


def main():
    parser = argparse.ArgumentParser(
        description="Test audio announcements for different hook scenarios",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                         # Test all enabled hooks
  %(prog)s --hook Stop             # Test Stop hook
  %(prog)s --hook PostToolUse      # Test PostToolUse hook
  %(prog)s --all                   # Test all hooks (including disabled)
  %(prog)s --list                  # List available hooks
  %(prog)s --providers             # Test all TTS providers
  %(prog)s --config                # Show current configuration
  %(prog)s --verbose --hook Stop   # Test with detailed output
        """
    )

    parser.add_argument(
        "--hook",
        type=str,
        help="Test specific hook type (e.g., Stop, PostToolUse)"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Test all hooks (including disabled ones)"
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available hook types"
    )

    parser.add_argument(
        "--providers",
        action="store_true",
        help="Test all TTS providers"
    )

    parser.add_argument(
        "--config",
        action="store_true",
        help="Show current configuration"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed test data"
    )

    args = parser.parse_args()

    # Handle list command
    if args.list:
        list_hooks()
        return 0

    # Initialize announcer
    try:
        announcer = AudioAnnouncer()
    except Exception as e:
        print(f"❌ Failed to initialize announcer: {e}")
        return 1

    # Handle config command
    if args.config:
        show_config(announcer)
        return 0

    # Handle providers command
    if args.providers:
        test_providers(announcer)
        return 0

    # Handle specific hook test
    if args.hook:
        result = test_hook(announcer, args.hook, verbose=args.verbose)
        return 0 if result else 1

    # Default: test all enabled hooks (or all if --all flag)
    test_all_hooks(announcer, include_disabled=args.all, verbose=args.verbose)
    return 0


if __name__ == "__main__":
    sys.exit(main())
