# Audio Announcements Testing Guide

Quick reference for testing the audio announcements plugin.

## Quick Start

```bash
cd .claude/hooks/plugins/audio_announcements

# Test a specific hook
./test.py --hook Stop

# Test all enabled hooks
./test.py

# Show what's configured
./test.py --config
```

## Test Commands Reference

### List Available Hooks

```bash
./test.py --list
```

**Output:**
```
Available Hook Types:
==================================================
 1. Notification
 2. PostToolUse
 3. PreCompact
 4. PreToolUse
 5. SessionEnd
 6. SessionStart
 7. Stop
 8. SubagentStop
 9. UserPromptSubmit
```

### Show Current Configuration

```bash
./test.py --config
```

**Shows:**
- Global settings (enabled, TTS provider, verbosity)
- Active TTS provider
- Hook status (total, enabled, disabled)
- List of enabled hooks with their templates and sound effects

### Test Individual Hooks

```bash
# Task completion
./test.py --hook Stop

# Tool completion
./test.py --hook PostToolUse

# User notification
./test.py --hook Notification

# Subagent completion
./test.py --hook SubagentStop

# Session events
./test.py --hook SessionStart
./test.py --hook SessionEnd

# Context management
./test.py --hook PreCompact

# Tool starting (usually disabled)
./test.py --hook PreToolUse

# User prompt
./test.py --hook UserPromptSubmit
```

### Test All Hooks

```bash
# Test only enabled hooks
./test.py

# Test all hooks (including disabled)
./test.py --all

# Test with detailed output
./test.py --verbose
./test.py --all --verbose
```

### Test TTS Providers

```bash
./test.py --providers
```

**Tests:**
- macOS Say (native)
- ElevenLabs (requires API key)
- OpenAI (requires API key)
- pyttsx3 (offline)

Shows which providers are available and tests each one.

## Test Output Examples

### Successful Test

```
============================================================
Testing: Stop [✓ ENABLED]
============================================================
📢 Announcement: "Done"
🔔 Sound Effect: Hero

🎙️  Playing...
✅ Success!
============================================================
```

### Disabled Hook

```
============================================================
Testing: PreToolUse [⚠ DISABLED]
============================================================
🔇 No announcement (hook disabled or no template)

🎙️  Playing...
⏭️  Skipped (hook disabled)
============================================================
```

### Failed Test

```
============================================================
Testing: Stop [✓ ENABLED]
============================================================
📢 Announcement: "Done"

🎙️  Playing...
❌ Failed (check TTS provider)
============================================================
```

## Testing Different Configurations

### Test Minimal Verbosity

```bash
# Edit config/audio_config.json
{
  "verbosity_level": "minimal"
}

# Test
./test.py --hook PostToolUse
# Says: "Read"
```

### Test Normal Verbosity

```bash
# Edit config/audio_config.json
{
  "verbosity_level": "normal"
}

# Test
./test.py --hook PostToolUse
# Says: "Read completed"
```

### Test Detailed Verbosity

```bash
# Edit config/audio_config.json
{
  "verbosity_level": "detailed"
}

# Test
./test.py --hook PostToolUse
# Says: "TestAgent completed Read"
```

### Test Different TTS Providers

**Test macOS Say:**
```bash
# Edit config/audio_config.json
{
  "tts_provider": "say",
  "say_settings": {
    "voice": "Samantha",
    "rate": 200
  }
}

./test.py --hook Stop
```

**Test ElevenLabs:**
```bash
# Add to .env
ELEVENLABS_API_KEY=your_key_here

# Edit config/audio_config.json
{
  "tts_provider": "elevenlabs"
}

./test.py --hook Stop
```

**Test OpenAI:**
```bash
# Add to .env
OPENAI_API_KEY=your_key_here

# Edit config/audio_config.json
{
  "tts_provider": "openai",
  "openai_settings": {
    "voice": "alloy"
  }
}

./test.py --hook Stop
```

### Test Sound Effects

```bash
# Edit config/audio_config.json
{
  "hooks": {
    "Stop": {
      "enabled": true,
      "template_category": "task_completion",
      "sound_effect": "Hero"
    }
  }
}

./test.py --hook Stop
# Plays Hero sound + announcement
```

**Available macOS Sounds:**
- `Basso`, `Blow`, `Bottle`, `Frog`, `Funk`
- `Glass`, `Hero`, `Morse`, `Ping`, `Pop`
- `Purr`, `Sosumi`, `Submarine`, `Tink`

## Troubleshooting Tests

### No Audio Output

1. Check global enabled flag:
   ```bash
   ./test.py --config
   # Should show: Enabled: True
   ```

2. Check hook is enabled:
   ```bash
   ./test.py --config
   # Hook should appear in "Enabled Hooks" list
   ```

3. Check TTS provider:
   ```bash
   ./test.py --providers
   # Should show at least one provider as available
   ```

### Wrong Voice

List available voices:
```bash
say -v "?"
```

Update config and test:
```bash
# Edit config/audio_config.json
{
  "say_settings": {
    "voice": "Alex"  # or any voice from the list
  }
}

./test.py --hook Stop
```

### Too Slow/Fast

Adjust speech rate:
```bash
# Edit config/audio_config.json
{
  "say_settings": {
    "rate": 250  # Increase for faster, decrease for slower
  }
}

./test.py --hook Stop
```

## Integration Testing

After installation, test with real hooks:

```bash
# 1. Install the plugin
./install.sh

# 2. Test manually
./test.py --hook PostToolUse

# 3. Trigger real hooks in your workflow
# (announcements should play as you work)

# 4. If needed, adjust config and test again
./test.py --hook Stop
```

## Continuous Testing

Create a test loop for rapid iteration:

```bash
# Test -> Edit -> Test cycle
while true; do
  ./test.py --hook Stop
  echo "Press Ctrl+C to stop, or Enter to test again..."
  read
done
```

## Advanced Testing

### Test Custom Templates

```bash
# Edit config/audio_templates.json
{
  "categories": {
    "custom_category": {
      "minimal": "Custom message",
      "normal": "Custom: {tool_name}",
      "detailed": "{source_app} says: {tool_name}"
    }
  }
}

# Edit config/audio_config.json
{
  "hooks": {
    "Stop": {
      "enabled": true,
      "template_category": "custom_category"
    }
  }
}

./test.py --hook Stop
```

### Test All Verbosity Levels

```bash
for level in minimal normal detailed; do
  echo "Testing verbosity: $level"
  # Edit config to set verbosity_level = $level
  ./test.py --hook PostToolUse
  sleep 2
done
```

## Summary

**Most Common Tests:**
- `./test.py --config` - See what's configured
- `./test.py --hook Stop` - Test task completion
- `./test.py` - Test all enabled hooks
- `./test.py --providers` - Check TTS providers

**When Things Don't Work:**
1. Check config: `./test.py --config`
2. Test providers: `./test.py --providers`
3. Test with verbose: `./test.py --hook Stop --verbose`
4. Check audio output is not muted
5. Verify Python dependencies are installed
