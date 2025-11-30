# Audio Announcements Plugin

A self-contained plugin for the Claude Code Multi-Agent Observability system that adds audio announcements using text-to-speech (TTS) for hook events.

## Features

- 🔊 **Multiple TTS Providers**: macOS `say`, ElevenLabs, OpenAI, pyttsx3
- 🎵 **Sound Effects**: macOS system sounds for event notifications
- 📝 **Template-Based**: Customizable announcement formats via templates
- 🎚️ **Verbosity Levels**: Minimal, normal, and detailed announcements
- 🎭 **Profile System**: Quick-switch between notification profiles (default, verbose, silent, quiet)
- 🔊 **Relative Volume**: Audio plays at percentage of current system volume (doesn't interfere with music/Zoom)
- 🔌 **Plugin Architecture**: Self-contained, easy to install/uninstall
- ⚡ **Non-Blocking**: Background execution doesn't slow down hooks
- 🎯 **Per-Hook Control**: Enable/disable announcements for specific hooks

## Installation

### Automatic (Plugin Manager)

No installation required! The plugin is automatically discovered and loaded.

1. **Configure** (optional):
   ```bash
   cd .claude/hooks/plugins/audio_announcements/config
   cp ../examples/audio_config.example.json audio_config.json
   vim audio_config.json  # Edit to your preferences
   ```

2. **Verify**:
   ```bash
   cd .claude/hooks
   python3 plugin_manager.py --list
   ```

That's it! The plugin manager will automatically load and execute the plugin.

### Manual Installation (Standalone)

If you want to add this plugin to a different project:

```bash
cd /path/to/project/.claude/hooks/plugins
git clone https://github.com/user/audio_announcements.git
# Or copy the plugin directory
cp -r /path/to/audio_announcements .
```

The plugin will be automatically discovered on next hook execution.

### Prerequisites

- **Python 3.8+** (required)
- **macOS** (for native `say` command - recommended)
- **Optional**: API keys for ElevenLabs or OpenAI TTS

## Configuration

### Main Config File

Edit `.claude/hooks/plugins/audio_announcements/config/audio_config.json`:

```json
{
  "enabled": true,
  "tts_provider": "say",
  "verbosity_level": "minimal",

  "say_settings": {
    "voice": "Samantha",
    "rate": 200
  },

  "hooks": {
    "PostToolUse": {
      "enabled": true,
      "template_category": "tool_usage",
      "sound_effect": null
    },
    "Stop": {
      "enabled": true,
      "template_category": "task_completion",
      "sound_effect": "Hero"
    }
  }
}
```

### Configuration Options

#### Global Settings

- `enabled` (boolean): Master switch for all announcements
- `tts_provider` (string): TTS provider to use (`"say"`, `"elevenlabs"`, `"openai"`, `"pyttsx3"`)
- `verbosity_level` (string): Default verbosity (`"minimal"`, `"normal"`, `"detailed"`)
- `global_volume` (number): Default volume (0.0-1.0, relative to current system volume)
- `active_profile` (string): Active profile name (`"default"`, `"verbose"`, `"silent"`, `"quiet"`)

#### Profile System

Profiles let you quickly switch between different notification setups:

```json
{
  "profiles": {
    "default": {
      "description": "Minimal notifications - only critical events",
      "audio_enabled_hooks": ["Stop", "Notification", "PreCompact"],
      "notification_enabled_hooks": ["Stop", "Notification"],
      "sound_enabled_hooks": ["Stop", "Notification"]
    },
    "verbose": {
      "description": "All events with audio",
      "audio_enabled_hooks": ["PostToolUse", "Stop", "SubagentStop", "Notification"],
      "notification_enabled_hooks": ["Stop", "Notification"],
      "sound_enabled_hooks": ["Stop", "SubagentStop", "Notification"]
    },
    "silent": {
      "description": "OS notifications only, no audio",
      "audio_enabled_hooks": [],
      "notification_enabled_hooks": ["Stop", "Notification"],
      "sound_enabled_hooks": []
    },
    "quiet": {
      "description": "Sounds only, no TTS",
      "audio_enabled_hooks": [],
      "notification_enabled_hooks": [],
      "sound_enabled_hooks": ["Stop", "Notification", "PreCompact"]
    }
  },
  "active_profile": "default"
}
```

**Switch profiles**: Just change `"active_profile"` to switch between notification modes.

#### TTS Provider Settings

**macOS Say** (`say_settings`):
```json
{
  "voice": "Samantha",  // Voice name (e.g., "Alex", "Samantha", "Victoria")
  "rate": 200           // Speech rate (words per minute)
}
```

**ElevenLabs** (`elevenlabs_settings`):
```json
{
  "voice": "Dan",
  "model": "eleven_flash_v2_5"
}
```
Requires: `ELEVENLABS_API_KEY` in `.env`

**OpenAI** (`openai_settings`):
```json
{
  "voice": "alloy",    // Options: alloy, echo, fable, onyx, nova, shimmer
  "model": "tts-1"     // or "tts-1-hd" for higher quality
}
```
Requires: `OPENAI_API_KEY` in `.env`

**pyttsx3** (`pyttsx3_settings`):
```json
{
  "rate": 180,
  "volume": 0.8
}
```
No API key required (offline)

#### Per-Hook Configuration

Each hook can be individually configured:

```json
{
  "hooks": {
    "HookName": {
      "enabled": true,                    // Enable/disable this hook
      "template_category": "tool_usage",  // Template category to use
      "sound_effect": "Glass"             // Optional sound effect (macOS only)
    }
  }
}
```

**Available Hooks**:
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool execution
- `Stop` - Agent task completion
- `SubagentStop` - Subagent completion
- `Notification` - User notifications
- `SessionStart` - Session started
- `SessionEnd` - Session ended
- `PreCompact` - Context compaction
- `UserPromptSubmit` - User prompt submitted

**macOS Sound Effects**:
- `Basso`, `Blow`, `Bottle`, `Frog`, `Funk`, `Glass`, `Hero`, `Morse`, `Ping`, `Pop`, `Purr`, `Sosumi`, `Submarine`, `Tink`

### Templates

Edit `.claude/hooks/plugins/audio_announcements/config/audio_templates.json`:

```json
{
  "categories": {
    "tool_usage": {
      "minimal": "{tool_name}",
      "normal": "{tool_name} completed",
      "detailed": "{source_app} completed {tool_name}"
    },
    "task_completion": {
      "minimal": "Done",
      "normal": "Task complete",
      "detailed": "{source_app} finished"
    }
  }
}
```

**Available Template Variables**:
- `{source_app}` - Agent name
- `{session_id}` - Session ID (truncated to 8 chars)
- `{tool_name}` - Tool name
- `{hook_type}` - Hook event type
- `{event}` - Session event (started/ended)

## Usage Examples

### Minimal Setup (macOS Native TTS)

```json
{
  "enabled": true,
  "tts_provider": "say",
  "verbosity_level": "minimal",
  "hooks": {
    "PostToolUse": {"enabled": true, "template_category": "tool_usage"},
    "Stop": {"enabled": true, "template_category": "task_completion"}
  }
}
```

**Announcements**:
- Tool completes → "Read"
- Task finishes → "Done"

### Sound Effects Only

```json
{
  "enabled": true,
  "verbosity_level": "minimal",
  "hooks": {
    "PostToolUse": {
      "enabled": true,
      "template_category": "tool_usage",
      "sound_effect": "Tink"
    },
    "Stop": {
      "enabled": true,
      "template_category": "task_completion",
      "sound_effect": "Hero"
    }
  }
}
```

**Result**: Subtle sound effects without voice announcements (if minimal template is empty)

### Detailed Announcements

```json
{
  "enabled": true,
  "tts_provider": "say",
  "verbosity_level": "detailed",
  "hooks": {
    "PostToolUse": {"enabled": true, "template_category": "tool_usage"},
    "Stop": {"enabled": true, "template_category": "task_completion"}
  }
}
```

**Announcements**:
- Tool completes → "General purpose agent completed Read"
- Task finishes → "General purpose agent finished"

### ElevenLabs Ultra-Low Latency

```json
{
  "enabled": true,
  "tts_provider": "elevenlabs",
  "elevenlabs_settings": {
    "voice": "Dan",
    "model": "eleven_flash_v2_5"
  }
}
```

Add to `.env`:
```
ELEVENLABS_API_KEY=your_api_key_here
```

## Testing

The plugin includes a comprehensive test script for testing announcements.

### Quick Test

```bash
cd .claude/hooks/plugins/audio_announcements
./test.py --hook Stop
```

### Test Commands

**List all available hooks:**
```bash
./test.py --list
```

**Show current configuration:**
```bash
./test.py --config
```

**Test specific hook:**
```bash
./test.py --hook Stop           # Test task completion
./test.py --hook PostToolUse    # Test tool completion
./test.py --hook Notification   # Test user notification
```

**Test all enabled hooks:**
```bash
./test.py
```

**Test all hooks (including disabled):**
```bash
./test.py --all
```

**Test with verbose output:**
```bash
./test.py --hook Stop --verbose
```

**Test all TTS providers:**
```bash
./test.py --providers
```

This will test each provider (macOS Say, ElevenLabs, OpenAI, pyttsx3) and show which ones are available.

## Disabling/Uninstallation

### Disable Plugin

To temporarily disable the plugin, edit `plugin.json`:

```json
{
  "enabled": false
}
```

Or disable specific hooks in `config/audio_config.json`:

```json
{
  "hooks": {
    "PostToolUse": {
      "enabled": false
    }
  }
}
```

### Remove Plugin

To completely remove the plugin:

```bash
cd .claude/hooks/plugins
rm -r audio_announcements
```

The plugin manager will automatically stop loading it

## Architecture

### Directory Structure

```
.claude/hooks/plugins/audio_announcements/
├── README.md                           # This file
├── install.sh                          # Installation script
├── uninstall.sh                        # Uninstallation script
├── config/
│   ├── audio_templates.json            # Announcement templates
│   └── audio_config.json               # User configuration
├── src/
│   ├── audio_announcer.py              # Core announcer class
│   ├── tts_providers.py                # TTS provider abstractions
│   ├── hook_integration.py             # Hook wrapper functions
│   └── _announce_background.py         # Background execution script
└── examples/
    └── audio_config.example.json       # Example configuration
```

### How It Works

1. **Hook Execution**: When a hook is triggered, it calls `announce_hook()`
2. **Background Process**: Announcement runs in a non-blocking subprocess
3. **Config Loading**: Loads templates and settings from JSON files
4. **Template Resolution**: Selects appropriate template based on hook type and verbosity
5. **TTS Execution**: Calls configured TTS provider
6. **Sound Effects**: Optionally plays macOS system sound

### Integration

The installer adds this code to each hook file:

```python
# BEGIN AUDIO_ANNOUNCEMENTS_PLUGIN
import sys
from pathlib import Path
plugin_path = Path(__file__).parent / "plugins" / "audio_announcements" / "src"
if plugin_path.exists():
    sys.path.insert(0, str(plugin_path))
    try:
        from hook_integration import announce_hook
        _AUDIO_PLUGIN_ENABLED = True
    except:
        _AUDIO_PLUGIN_ENABLED = False
else:
    _AUDIO_PLUGIN_ENABLED = False
# END AUDIO_ANNOUNCEMENTS_PLUGIN

# ... existing hook code ...

# Audio announcement (plugin)
if _AUDIO_PLUGIN_ENABLED:
    try:
        announce_hook("HookType", input_data)
    except:
        pass
```

## Troubleshooting

### No Audio Output

1. Check `enabled: true` in config
2. Check hook is enabled in config
3. Verify TTS provider is available:
   ```bash
   # For macOS say
   say "test"

   # For ElevenLabs/OpenAI
   echo $ELEVENLABS_API_KEY
   echo $OPENAI_API_KEY
   ```

### Announcements Too Verbose

Change `verbosity_level` to `"minimal"`:

```json
{
  "verbosity_level": "minimal"
}
```

### Announcements Too Slow

1. Use macOS `say` (fastest)
2. Use ElevenLabs Flash v2.5 (75ms latency)
3. Increase speech rate in config

### Wrong Voice

macOS `say` voices:
```bash
say -v "?"  # List all available voices
```

Update config:
```json
{
  "say_settings": {
    "voice": "Alex"  // Change to desired voice
  }
}
```

## Contributing

This plugin is designed to be upstreamed to the main repository. To contribute:

1. Fork the repository
2. Make changes in the plugin directory
3. Test installation/uninstallation
4. Submit PR with only the plugin directory changes

## License

Same license as the parent project (Claude Code Multi-Agent Observability).

## Support

For issues or questions:
1. Check configuration in `audio_config.json`
2. Run test announcements
3. Check hook file patches
4. Review backup files in `.backups/`
