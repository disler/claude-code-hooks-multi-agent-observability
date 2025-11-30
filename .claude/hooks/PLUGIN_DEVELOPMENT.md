# Plugin Development Guide

Complete guide for developing plugins for the Claude Code Hooks system.

## Table of Contents

1. [Plugin System Overview](#plugin-system-overview)
2. [Quick Start](#quick-start)
3. [Plugin Structure](#plugin-structure)
4. [Plugin Metadata](#plugin-metadata)
5. [Plugin Entry Point](#plugin-entry-point)
6. [Hook Types](#hook-types)
7. [Input Data Reference](#input-data-reference)
8. [Best Practices](#best-practices)
9. [Testing](#testing)
10. [Distribution](#distribution)

---

## Plugin System Overview

The Claude Code Hooks plugin system provides a clean, modular way to extend hook functionality without modifying core hook files.

### Key Features

- **Auto-discovery**: Plugins are automatically discovered from the `plugins/` directory
- **Zero installation**: Just drop a plugin directory into `plugins/` and it works
- **Fail-safe**: Plugin errors never crash hooks
- **Multi-plugin support**: Multiple plugins can handle the same hook event
- **Priority ordering**: Control plugin execution order
- **Configuration-driven**: Enable/disable plugins via JSON metadata

### How It Works

1. Each hook calls `execute_plugins(hook_type, input_data)` before exiting
2. Plugin manager scans `plugins/` directory for valid plugins
3. Plugins are loaded based on their `plugin.json` metadata
4. Enabled plugins that support the hook type are executed in priority order
5. Plugins run in fail-safe mode (errors are caught and logged)

---

## Quick Start

### Create Your First Plugin

1. **Create plugin directory**:
   ```bash
   cd .claude/hooks/plugins
   mkdir my_plugin
   cd my_plugin
   ```

2. **Create plugin.json**:
   ```json
   {
     "name": "my_plugin",
     "version": "1.0.0",
     "description": "My awesome plugin",
     "enabled": true,
     "priority": 50,
     "hooks": ["PostToolUse", "Stop"],
     "entry_point": "src.plugin:handle_hook"
   }
   ```

3. **Create entry point** (`src/plugin.py`):
   ```python
   #!/usr/bin/env python3

   def handle_hook(hook_type, input_data):
       """Handle hook events"""
       print(f"Plugin received {hook_type} event!")

       if hook_type == "PostToolUse":
           tool_name = input_data.get("tool_name", "unknown")
           print(f"Tool {tool_name} was used")

       elif hook_type == "Stop":
           print("Task completed!")
   ```

4. **Test your plugin**:
   ```bash
   cd ..  # Back to hooks directory
   python3 plugin_manager.py --list
   python3 plugin_manager.py --test PostToolUse
   ```

That's it! Your plugin is now active and will be called for `PostToolUse` and `Stop` events.

---

## Plugin Structure

### Recommended Directory Layout

```
plugins/
  my_plugin/
    plugin.json              # Plugin metadata (required)
    src/
      plugin.py              # Entry point (required)
      my_module.py           # Additional modules (optional)
    config/
      config.json            # Plugin configuration (optional)
    README.md                # Plugin documentation (recommended)
    LICENSE                  # License file (recommended)
    examples/
      example_config.json    # Example configuration
    tests/
      test_plugin.py         # Plugin tests
```

### Minimal Plugin Structure

The absolute minimum for a working plugin:

```
plugins/
  minimal_plugin/
    plugin.json       # Metadata
    src/
      plugin.py       # Entry point
```

---

## Plugin Metadata

The `plugin.json` file defines your plugin's metadata and behavior.

### Schema

```json
{
  "name": "string (required)",
  "version": "string (required)",
  "description": "string (optional)",
  "author": "string (optional)",
  "enabled": "boolean (optional, default: true)",
  "priority": "number (optional, default: 50)",
  "hooks": "array of strings (optional, default: all hooks)",
  "entry_point": "string (required, format: 'module.path:function_name')",
  "config_file": "string (optional)",
  "dependencies": "object (optional)"
}
```

### Field Descriptions

#### name (required)
Unique identifier for your plugin. Use lowercase with underscores.

```json
"name": "audio_announcements"
```

#### version (required)
Semantic version number.

```json
"version": "1.0.0"
```

#### description (optional)
Brief description of what your plugin does.

```json
"description": "Audio announcements for hook events via TTS"
```

#### author (optional)
Plugin author name or organization.

```json
"author": "Your Name <you@example.com>"
```

#### enabled (optional, default: true)
Whether the plugin is active.

```json
"enabled": true
```

#### priority (optional, default: 50)
Execution priority (lower number = higher priority). Range: 1-100.

```json
"priority": 50
```

**Priority Guidelines**:
- 1-25: Critical plugins that must run first
- 26-50: Normal priority plugins
- 51-75: Lower priority plugins
- 76-100: Plugins that should run last

#### hooks (optional, default: all hooks)
List of hook types this plugin handles. If omitted, plugin receives all hooks.

```json
"hooks": [
  "PostToolUse",
  "Stop",
  "Notification"
]
```

#### entry_point (required)
Python module path and function name to call.

Format: `"module.path:function_name"`

```json
"entry_point": "src.plugin:handle_hook"
```

This means:
- Module file: `src/plugin.py`
- Function: `handle_hook(hook_type, input_data)`

#### config_file (optional)
Path to plugin configuration file (relative to plugin directory).

```json
"config_file": "config/my_config.json"
```

#### dependencies (optional)
Plugin dependencies (for documentation/validation).

```json
"dependencies": {
  "python": ">=3.8",
  "packages": ["requests", "beautifulsoup4"],
  "optional_packages": ["elevenlabs", "openai"]
}
```

---

## Plugin Entry Point

Your entry point function receives hook events and performs plugin logic.

### Function Signature

```python
def handle_hook(hook_type: str, input_data: dict) -> None:
    """
    Handle hook events.

    Args:
        hook_type: Hook event type (e.g., "PostToolUse", "Stop")
        input_data: Hook input data dictionary

    Returns:
        None
    """
    pass
```

### Complete Example

```python
#!/usr/bin/env python3
"""
Example Plugin Entry Point
"""

from pathlib import Path
from typing import Dict, Any
import json

# Plugin configuration
_config = None

def load_config():
    """Load plugin configuration"""
    global _config
    if _config is None:
        config_path = Path(__file__).parent.parent / "config" / "config.json"
        if config_path.exists():
            with open(config_path) as f:
                _config = json.load(f)
        else:
            _config = {}
    return _config

def handle_hook(hook_type: str, input_data: Dict[str, Any]) -> None:
    """Main entry point called by plugin manager"""

    # Load configuration
    config = load_config()

    # Check if this hook is enabled
    hook_config = config.get("hooks", {}).get(hook_type, {})
    if not hook_config.get("enabled", True):
        return

    # Handle different hook types
    if hook_type == "PostToolUse":
        handle_post_tool_use(input_data)

    elif hook_type == "Stop":
        handle_stop(input_data)

    elif hook_type == "Notification":
        handle_notification(input_data)

    # Add more hooks as needed

def handle_post_tool_use(input_data: Dict[str, Any]) -> None:
    """Handle PostToolUse events"""
    tool_name = input_data.get("tool_name", "unknown")
    source_app = input_data.get("source_app", "unknown")

    print(f"[Plugin] {source_app} used tool: {tool_name}")

def handle_stop(input_data: Dict[str, Any]) -> None:
    """Handle Stop events"""
    source_app = input_data.get("source_app", "unknown")

    print(f"[Plugin] {source_app} completed all tasks")

def handle_notification(input_data: Dict[str, Any]) -> None:
    """Handle Notification events"""
    source_app = input_data.get("source_app", "unknown")
    message = input_data.get("message", "")

    print(f"[Plugin] {source_app} needs attention: {message}")
```

### Important Notes

1. **Never crash**: Wrap risky code in try/except
2. **Fast execution**: Keep plugin logic quick (< 100ms ideal)
3. **Non-blocking**: Use threads/processes for long-running operations
4. **Silent failures**: Log errors but don't raise exceptions
5. **Import safety**: Handle missing dependencies gracefully

### Non-Blocking Example

For long-running operations, use background execution:

```python
import threading

def handle_hook(hook_type: str, input_data: dict) -> None:
    """Non-blocking entry point"""

    # Launch background task
    thread = threading.Thread(
        target=background_task,
        args=(hook_type, input_data),
        daemon=True
    )
    thread.start()

    # Return immediately

def background_task(hook_type: str, input_data: dict) -> None:
    """Actual work happens here"""
    try:
        # Long-running operation
        process_data(input_data)
    except Exception as e:
        print(f"Background task error: {e}")
```

---

## Hook Types

Available hook types and when they're triggered.

### SessionStart
Triggered when a new Claude Code session begins.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source": "cli" | "vscode",
    "timestamp": "ISO-8601 timestamp",
    "project_dir": "/path/to/project"
}
```

### SessionEnd
Triggered when a Claude Code session ends.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "timestamp": "ISO-8601 timestamp",
    "duration_seconds": 123.45
}
```

### PreToolUse
Triggered before a tool is executed.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source_app": "agent-name",
    "tool_name": "Read" | "Write" | "Bash" | etc,
    "args": {/* tool arguments */},
    "timestamp": "ISO-8601 timestamp"
}
```

### PostToolUse
Triggered after a tool is executed.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source_app": "agent-name",
    "tool_name": "Read" | "Write" | "Bash" | etc,
    "args": {/* tool arguments */},
    "result": {/* tool result */},
    "timestamp": "ISO-8601 timestamp"
}
```

### Stop
Triggered when an agent completes all tasks.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source_app": "agent-name",
    "timestamp": "ISO-8601 timestamp",
    "stop_hook_active": true
}
```

### SubagentStop
Triggered when a subagent completes its task.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source_app": "subagent-name",
    "parent_session_id": "parent-uuid",
    "timestamp": "ISO-8601 timestamp"
}
```

### Notification
Triggered when agent needs user input or attention.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "source_app": "agent-name",
    "message": "notification message",
    "timestamp": "ISO-8601 timestamp"
}
```

### PreCompact
Triggered before context compaction occurs.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "trigger": "manual" | "auto",
    "transcript_path": "/path/to/transcript.jsonl",
    "timestamp": "ISO-8601 timestamp"
}
```

### UserPromptSubmit
Triggered when user submits a prompt.

**Input Data**:
```python
{
    "session_id": "uuid-string",
    "prompt": "user prompt text",
    "timestamp": "ISO-8601 timestamp"
}
```

---

## Input Data Reference

### Common Fields

All hooks receive these common fields:

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique session identifier (UUID) |
| `source_app` | string | Agent name (e.g., "GeneralPurpose", "CodeReviewer") |
| `timestamp` | string | ISO-8601 timestamp of event |

### Hook-Specific Fields

#### PostToolUse / PreToolUse
| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | string | Name of tool ("Read", "Write", "Bash", etc.) |
| `args` | object | Tool arguments |
| `result` | object | Tool result (PostToolUse only) |

#### Stop / SubagentStop
| Field | Type | Description |
|-------|------|-------------|
| `stop_hook_active` | boolean | Whether stop hook is enabled |
| `parent_session_id` | string | Parent session ID (SubagentStop only) |

#### Notification
| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Notification message |

#### SessionStart
| Field | Type | Description |
|-------|------|-------------|
| `source` | string | "cli" or "vscode" |
| `project_dir` | string | Project directory path |

#### SessionEnd
| Field | Type | Description |
|-------|------|-------------|
| `duration_seconds` | number | Session duration |

#### PreCompact
| Field | Type | Description |
|-------|------|-------------|
| `trigger` | string | "manual" or "auto" |
| `transcript_path` | string | Path to transcript file |

#### UserPromptSubmit
| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | User's prompt text |

---

## Best Practices

### 1. Error Handling

Always wrap your code in try/except:

```python
def handle_hook(hook_type, input_data):
    try:
        # Your code here
        process_hook(hook_type, input_data)
    except Exception as e:
        # Log but don't raise
        print(f"Plugin error: {e}", file=sys.stderr)
```

### 2. Configuration

Use configuration files for flexibility:

```python
# Load once, cache forever
_config = None

def get_config():
    global _config
    if _config is None:
        config_path = Path(__file__).parent.parent / "config" / "config.json"
        with open(config_path) as f:
            _config = json.load(f)
    return _config
```

### 3. Performance

Keep plugins fast:

```python
# ✅ Good: Quick execution
def handle_hook(hook_type, input_data):
    log_event(hook_type)

# ❌ Bad: Slow blocking operation
def handle_hook(hook_type, input_data):
    time.sleep(5)  # Blocks hook for 5 seconds!

# ✅ Good: Background execution
def handle_hook(hook_type, input_data):
    threading.Thread(
        target=slow_operation,
        args=(input_data,),
        daemon=True
    ).start()
```

### 4. Dependency Management

Handle missing dependencies gracefully:

```python
# Try to import optional dependencies
try:
    import elevenlabs
    HAS_ELEVENLABS = True
except ImportError:
    HAS_ELEVENLABS = False

def handle_hook(hook_type, input_data):
    if HAS_ELEVENLABS:
        use_elevenlabs()
    else:
        use_fallback()
```

### 5. Resource Cleanup

Clean up resources properly:

```python
class MyPlugin:
    def __init__(self):
        self.resources = []

    def __del__(self):
        # Clean up resources
        for resource in self.resources:
            resource.close()

# Or use context managers
def handle_hook(hook_type, input_data):
    with open(log_file, 'a') as f:
        f.write(f"{hook_type}\n")
```

### 6. Testing

Always test your plugin:

```python
if __name__ == "__main__":
    # Test data
    test_input = {
        "session_id": "test-session",
        "source_app": "TestAgent",
        "tool_name": "Read"
    }

    # Test plugin
    handle_hook("PostToolUse", test_input)
    print("Test passed!")
```

---

## Testing

### Manual Testing

Test your plugin manually:

```bash
# List all plugins
python3 plugin_manager.py --list

# Test specific hook
python3 plugin_manager.py --test PostToolUse
```

### Unit Testing

Create tests in `tests/test_plugin.py`:

```python
#!/usr/bin/env python3
import sys
from pathlib import Path

# Add plugin to path
plugin_dir = Path(__file__).parent.parent
sys.path.insert(0, str(plugin_dir))

from src.plugin import handle_hook

def test_post_tool_use():
    """Test PostToolUse handling"""
    input_data = {
        "session_id": "test",
        "source_app": "TestAgent",
        "tool_name": "Read"
    }

    # Should not raise
    handle_hook("PostToolUse", input_data)
    print("✓ PostToolUse test passed")

def test_stop():
    """Test Stop handling"""
    input_data = {
        "session_id": "test",
        "source_app": "TestAgent"
    }

    handle_hook("Stop", input_data)
    print("✓ Stop test passed")

if __name__ == "__main__":
    test_post_tool_use()
    test_stop()
    print("\nAll tests passed!")
```

Run tests:

```bash
python3 tests/test_plugin.py
```

---

## Distribution

### As Standalone Plugin

1. **Create GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial plugin release"
   git remote add origin https://github.com/user/my-plugin.git
   git push -u origin main
   ```

2. **Installation for users**:
   ```bash
   cd .claude/hooks/plugins
   git clone https://github.com/user/my-plugin.git
   ```

3. **Updates**:
   ```bash
   cd .claude/hooks/plugins/my-plugin
   git pull
   ```

### As Part of Project

Include in the main project's `plugins/` directory.

### Via Package Manager (Advanced)

Publish to PyPI and install globally:

```bash
pip install my-claude-plugin
my-claude-plugin install /path/to/project/.claude/hooks
```

---

## Example Plugins

### Minimal Logger Plugin

```python
# plugins/logger/plugin.json
{
  "name": "logger",
  "version": "1.0.0",
  "entry_point": "src.plugin:handle_hook"
}

# plugins/logger/src/plugin.py
from pathlib import Path
import json

def handle_hook(hook_type, input_data):
    log_file = Path(__file__).parent.parent / "logs.jsonl"

    with open(log_file, 'a') as f:
        log_entry = {
            "hook_type": hook_type,
            **input_data
        }
        f.write(json.dumps(log_entry) + "\n")
```

### Slack Notification Plugin

```python
# plugins/slack_notifications/src/plugin.py
import requests
import threading

SLACK_WEBHOOK = "https://hooks.slack.com/your/webhook"

def handle_hook(hook_type, input_data):
    if hook_type == "Notification":
        threading.Thread(
            target=send_slack_notification,
            args=(input_data,),
            daemon=True
        ).start()

def send_slack_notification(input_data):
    try:
        message = input_data.get("message", "No message")
        source = input_data.get("source_app", "Unknown")

        payload = {
            "text": f"🔔 *{source}*: {message}"
        }

        requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
    except Exception as e:
        print(f"Slack notification error: {e}")
```

---

## Getting Help

- **Issues**: Report bugs or request features
- **Discussions**: Ask questions or share ideas
- **Examples**: Check `plugins/audio_announcements/` for reference implementation

## Contributing

Contributions welcome! Please:

1. Follow the plugin structure guidelines
2. Include tests
3. Add documentation
4. Update PLUGIN_DEVELOPMENT.md if needed

---

**Happy Plugin Development!** 🎉
