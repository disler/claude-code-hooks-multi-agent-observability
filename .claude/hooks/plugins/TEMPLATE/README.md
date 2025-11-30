# Plugin Template

Template for creating Claude Code Hooks plugins.

## Quick Start

1. **Copy this template**:
   ```bash
   cd .claude/hooks/plugins
   cp -r TEMPLATE my_plugin
   cd my_plugin
   ```

2. **Update plugin.json**:
   - Change `name` to your plugin name
   - Update `description`, `author`, `version`
   - Set which `hooks` you want to handle
   - Adjust `priority` if needed (1-100, lower = higher priority)

3. **Implement your logic**:
   - Edit `src/plugin.py`
   - Implement the handler functions for your chosen hooks
   - Add any additional modules you need in `src/`

4. **Configure**:
   - Edit `config/config.json` to set your plugin options
   - Enable/disable specific hooks

5. **Test**:
   ```bash
   cd ../..  # Back to hooks directory
   python3 plugin_manager.py --list
   python3 plugin_manager.py --test PostToolUse
   ```

6. **Use**:
   - Plugin is automatically discovered and loaded
   - No installation required!

## Plugin Structure

```
my_plugin/
  plugin.json          # Plugin metadata (REQUIRED)
  src/
    plugin.py          # Entry point (REQUIRED)
    my_module.py       # Additional modules (optional)
  config/
    config.json        # Plugin configuration (optional)
  README.md            # Documentation (recommended)
  LICENSE              # License file (recommended)
  tests/
    test_plugin.py     # Tests (recommended)
```

## Configuration

Edit `config/config.json` to control plugin behavior:

```json
{
  "enabled": true,
  "hooks": {
    "PostToolUse": {
      "enabled": true
    },
    "Stop": {
      "enabled": true
    }
  }
}
```

## Available Hooks

- `SessionStart` - Session begins
- `SessionEnd` - Session ends
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool execution
- `Stop` - Agent completes tasks
- `SubagentStop` - Subagent completes
- `Notification` - User input needed
- `PreCompact` - Before context compaction
- `UserPromptSubmit` - User submits prompt

## Documentation

See [PLUGIN_DEVELOPMENT.md](../../PLUGIN_DEVELOPMENT.md) for comprehensive plugin development guide.

## License

[Your License]
