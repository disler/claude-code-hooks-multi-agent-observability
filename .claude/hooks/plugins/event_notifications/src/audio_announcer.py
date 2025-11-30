#!/usr/bin/env python3
"""
Audio Announcer Core

Main class for handling audio announcements based on hook events.
Loads configuration, manages templates, and coordinates TTS providers.
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, Any, Optional

# Handle imports for both package and direct execution
try:
    from .tts_providers import TTSProviderFactory, play_sound_effect, send_os_notification
except ImportError:
    from tts_providers import TTSProviderFactory, play_sound_effect, send_os_notification


class AudioAnnouncer:
    """Core audio announcement system"""

    def __init__(self, config_dir: Optional[Path] = None):
        """
        Initialize the audio announcer.

        Args:
            config_dir: Path to config directory. If None, uses plugin's config directory.
        """
        if config_dir is None:
            # Default to plugin's config directory
            plugin_root = Path(__file__).parent.parent
            config_dir = plugin_root / "config"

        self.config_dir = config_dir
        self.config = self._load_config()
        self.templates = self._load_templates()
        self.tts_provider = None

        # Initialize TTS provider if enabled
        if self.config.get("enabled", False):
            self.tts_provider = TTSProviderFactory.get_best_available_provider(self.config)

    def _load_config(self) -> Dict[str, Any]:
        """Load audio configuration from JSON file"""
        config_path = self.config_dir / "audio_config.json"

        # If config doesn't exist, try to load from examples
        if not config_path.exists():
            example_path = self.config_dir.parent / "examples" / "audio_config.example.json"
            if example_path.exists():
                # Return default config based on example
                with open(example_path) as f:
                    return json.load(f)
            else:
                # Return minimal default config
                return self._get_default_config()

        with open(config_path) as f:
            return json.load(f)

    def _load_templates(self) -> Dict[str, Any]:
        """Load audio templates from JSON file"""
        templates_path = self.config_dir / "audio_templates.json"

        if not templates_path.exists():
            return {"categories": {}}

        with open(templates_path) as f:
            return json.load(f)

    def _get_default_config(self) -> Dict[str, Any]:
        """Return minimal default configuration"""
        return {
            "enabled": True,
            "tts_provider": "say",
            "verbosity_level": "minimal",
            "say_settings": {"voice": "Samantha", "rate": 200},
            "hooks": {}
        }

    def _format_template(self, template: str, context: Dict[str, Any]) -> str:
        """
        Format a template string with context variables.

        Args:
            template: Template string with {variable} placeholders
            context: Dictionary of variable values

        Returns:
            Formatted string
        """
        def replacer(match):
            key = match.group(1)
            return str(context.get(key, f"{{{key}}}"))

        return re.sub(r'\{(\w+)\}', replacer, template)

    def _is_hook_enabled(self, hook_type: str, feature: str) -> bool:
        """
        Check if a specific feature is enabled for a hook based on active profile.

        Args:
            hook_type: Type of hook event (e.g., "PostToolUse", "Stop")
            feature: Feature to check ('audio', 'notification', 'sound')

        Returns:
            True if feature is enabled for this hook in active profile
        """
        # Get active profile
        active_profile_name = self.config.get("active_profile", "default")
        profiles = self.config.get("profiles", {})
        active_profile = profiles.get(active_profile_name, {})

        # Check if hook is in the enabled list for this feature
        enabled_key = f"{feature}_enabled_hooks"
        enabled_hooks = active_profile.get(enabled_key, [])

        return hook_type in enabled_hooks

    def _get_announcement_text(self, hook_type: str, context: Dict[str, Any]) -> Optional[str]:
        """
        Get the announcement text for a hook event.

        Args:
            hook_type: Type of hook event (e.g., "PostToolUse", "Stop")
            context: Context variables for template formatting

        Returns:
            Formatted announcement text or None
        """
        # Check if audio is enabled for this hook (via profile)
        if not self._is_hook_enabled(hook_type, "audio"):
            return None

        # Get hook configuration
        hook_config = self.config.get("hooks", {}).get(hook_type, {})

        # Get template category
        template_category = hook_config.get("template_category")
        if not template_category:
            return None

        # Get verbosity level
        verbosity = self.config.get("verbosity_level", "minimal")

        # Get template from category
        category_templates = self.templates.get("categories", {}).get(template_category, {})
        template = category_templates.get(verbosity, "")

        if not template:
            return None

        # Format template with context
        return self._format_template(template, context)

    def _prepare_context(self, hook_type: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare context variables for template formatting.

        Args:
            hook_type: Type of hook event
            input_data: Raw input data from hook

        Returns:
            Context dictionary with formatted variables
        """
        context = {
            "hook_type": hook_type,
            "source_app": input_data.get("source_app", "Agent"),
            "session_id": input_data.get("session_id", "unknown")[:8],  # Truncate to 8 chars
            "tool_name": input_data.get("tool_name", "Unknown"),
        }

        # Add event-specific context
        if hook_type in ["SessionStart", "SessionEnd"]:
            context["event"] = "started" if hook_type == "SessionStart" else "ended"

        # Add any additional payload data
        payload = input_data.get("payload", {})
        if isinstance(payload, dict):
            context.update(payload)

        return context

    def announce(self, hook_type: str, input_data: Dict[str, Any]) -> bool:
        """
        Make an audio announcement for a hook event.

        Uses active profile to determine which features (audio/notification/sound)
        are enabled for this hook.

        Args:
            hook_type: Type of hook event (e.g., "PostToolUse", "Stop")
            input_data: Input data from the hook

        Returns:
            True if announcement was made, False otherwise
        """
        try:
            # Check if announcements are enabled globally
            if not self.config.get("enabled", False):
                return False

            # Get hook configuration for settings (volume, templates, etc.)
            hook_config = self.config.get("hooks", {}).get(hook_type, {})

            # Prepare context
            context = self._prepare_context(hook_type, input_data)

            # Get volume (hook-specific or global)
            hook_volume = hook_config.get("volume")
            global_volume = self.config.get("global_volume", 0.3)
            volume = hook_volume if hook_volume is not None else global_volume

            # Send OS notification (if enabled in profile AND configured for hook)
            if self._is_hook_enabled(hook_type, "notification"):
                os_notif_config = hook_config.get("os_notification")
                if os_notif_config and isinstance(os_notif_config, dict):
                    if os_notif_config.get("enabled", False):
                        title = self._format_template(os_notif_config.get("title", ""), context)
                        message = self._format_template(os_notif_config.get("message", ""), context)
                        notif_type = os_notif_config.get("type", "banner")
                        send_os_notification(title, message, notif_type)

            # Play sound effect (if enabled in profile AND configured for hook)
            if self._is_hook_enabled(hook_type, "sound"):
                sound_effect = hook_config.get("sound_effect")
                if sound_effect:
                    play_sound_effect(sound_effect, volume)

            # Get announcement text (checks if audio enabled in profile internally)
            announcement_text = self._get_announcement_text(hook_type, context)
            if not announcement_text:
                return False

            # Speak announcement with volume
            if self.tts_provider:
                return self.tts_provider.speak(announcement_text, volume)

            return False

        except Exception as e:
            # Silently fail - never interrupt the hook
            return False

    def test_announcement(self, hook_type: str = "Stop") -> bool:
        """
        Test the audio announcement system.

        Args:
            hook_type: Hook type to test (default: "Stop")

        Returns:
            True if test successful, False otherwise
        """
        test_data = {
            "source_app": "TestAgent",
            "session_id": "test1234",
            "tool_name": "TestTool",
            "payload": {}
        }

        print(f"Testing audio announcement for {hook_type}...")
        result = self.announce(hook_type, test_data)

        if result:
            print("✅ Test announcement successful!")
        else:
            print("❌ Test announcement failed")
            print(f"   Enabled: {self.config.get('enabled')}")
            print(f"   Hook enabled: {self.config.get('hooks', {}).get(hook_type, {}).get('enabled')}")
            print(f"   TTS Provider: {self.tts_provider.__class__.__name__ if self.tts_provider else 'None'}")

        return result


def main():
    """CLI entry point for testing"""
    announcer = AudioAnnouncer()

    if len(sys.argv) > 1:
        hook_type = sys.argv[1]
        announcer.test_announcement(hook_type)
    else:
        # Test all enabled hooks
        print("Testing all enabled hooks...")
        for hook_type in announcer.config.get("hooks", {}).keys():
            if announcer.config["hooks"][hook_type].get("enabled"):
                announcer.test_announcement(hook_type)
                print()


if __name__ == "__main__":
    main()
