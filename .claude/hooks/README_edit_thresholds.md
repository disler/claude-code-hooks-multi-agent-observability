# Edit Threshold Hook Documentation

## Overview

The edit threshold hook is a pre-tool-use hook that monitors file editing operations and automatically manages commits when large changes are detected. This helps maintain clean git history by preventing massive commits and encourages incremental development.

## Features

- **Line Change Detection**: Monitors Edit, MultiEdit, and Write operations
- **Configurable Thresholds**: Customizable limits for lines added, removed, and total changes
- **Auto-commit**: Automatically commits existing changes before large edits
- **Non-blocking**: Warns about large edits but allows them to proceed
- **Multi-tool Support**: Works with Edit, MultiEdit, and Write tools

## Configuration

The edit threshold settings are configured in `.claude/settings.json`:

```json
{
  "edit_thresholds": {
    "max_lines_added": 50,
    "max_lines_removed": 50,
    "max_total_changes": 100,
    "enabled": true,
    "auto_commit": true,
    "commit_message_prefix": "Auto-commit: Large file changes detected - "
  }
}
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `max_lines_added` | integer | Maximum lines that can be added in a single operation | 50 |
| `max_lines_removed` | integer | Maximum lines that can be removed in a single operation | 50 |
| `max_total_changes` | integer | Maximum total lines changed (added + removed) | 100 |
| `enabled` | boolean | Enable/disable threshold checking | true |
| `auto_commit` | boolean | Automatically commit existing changes before large edits | true |
| `commit_message_prefix` | string | Prefix for auto-commit messages | "Auto-commit: Large file changes detected - " |

## How It Works

### 1. Pre-Tool Analysis

When a file editing tool is used (Edit, MultiEdit, Write), the hook:

- Analyzes the operation parameters
- Counts lines in old and new content
- Calculates lines added, removed, and total changes

### 2. Threshold Checking

The hook compares the calculated changes against configured thresholds:

- Lines added vs `max_lines_added`
- Lines removed vs `max_lines_removed`
- Total changes vs `max_total_changes`

### 3. Action on Threshold Exceeded

When thresholds are exceeded:

1. **Warning**: Displays detailed information about the large edit
1. **Auto-commit** (if enabled): Commits any existing staged changes
1. **Proceed**: Allows the large edit operation to continue

### 4. Logging

All threshold checks and actions are logged to stderr for visibility.

## Tool Support

### Edit Tool

```python
# Monitored parameters:
{
  "file_path": "/path/to/file.py",
  "old_string": "content to replace",
  "new_string": "replacement content"
}
```

### MultiEdit Tool

```python
# Monitored parameters:
{
  "file_path": "/path/to/file.py", 
  "edits": [
    {
      "old_string": "old content 1",
      "new_string": "new content 1"
    },
    {
      "old_string": "old content 2", 
      "new_string": "new content 2"
    }
  ]
}
```

### Write Tool

```python
# Monitored parameters:
{
  "file_path": "/path/to/file.py",
  "content": "entire file content"
}
```

## Example Output

When a large edit is detected:

```
LARGE EDIT DETECTED:
  File: /home/user/project/large_file.py
  Lines to add: 75 (max: 50)
  Lines to remove: 10 (max: 50)
  Total changes: 85 (max: 100)
AUTO-COMMIT: Will commit existing changes before proceeding
AUTO-COMMIT: Committed existing changes
PROCEEDING: Large edit operation will continue
```

## Testing

Use the test script to verify functionality:

```bash
pixi run python .claude/hooks/test_edit_thresholds.py
```

The test script will:

- Load and display current configuration
- Test line counting functionality
- Test edit change estimation
- Test threshold checking with various scenarios
- Simulate hook inputs

## Customization

### Adjusting Thresholds

Modify the values in `settings.json`:

```json
{
  "edit_thresholds": {
    "max_lines_added": 100,     // Allow larger additions
    "max_lines_removed": 25,    // Be more strict about removals
    "max_total_changes": 150,   // Allow larger total changes
    "enabled": true
  }
}
```

### Disabling Auto-commit

```json
{
  "edit_thresholds": {
    "auto_commit": false,  // Only warn, don't auto-commit
    "enabled": true
  }
}
```

### Custom Commit Messages

```json
{
  "edit_thresholds": {
    "commit_message_prefix": "🚨 LARGE EDIT - ",
    "auto_commit": true
  }
}
```

### Disabling Completely

```json
{
  "edit_thresholds": {
    "enabled": false  // Disable threshold checking entirely
  }
}
```

## Integration with Workflow

The edit threshold hook integrates seamlessly with existing Claude Code workflows:

1. **Development Flow**: Encourages smaller, focused commits
1. **Code Review**: Easier to review smaller changesets
1. **Git History**: Cleaner commit history with logical breakpoints
1. **Debugging**: Easier to track when issues were introduced

## Best Practices

1. **Set Appropriate Thresholds**: Based on your project size and coding style
1. **Review Auto-commits**: Check auto-committed changes before pushing
1. **Adjust for File Types**: Consider different thresholds for different file types
1. **Monitor Logs**: Review threshold warnings to understand editing patterns

## Troubleshooting

### Hook Not Working

- Check that `enabled: true` in configuration
- Verify hook is listed in `settings.json` hooks section
- Check pixi environment is working: `pixi run python --version`

### Auto-commit Failing

- Ensure git repository is initialized
- Check git user configuration: `git config user.name` and `git config user.email`
- Verify file permissions for git operations

### Threshold Not Triggering

- Test with `test_edit_thresholds.py` script
- Check configuration values are correct
- Verify file paths are accessible

### False Positives

- Adjust thresholds in configuration
- Consider file-specific patterns if needed
- Review line counting logic for edge cases

## Security Considerations

- The hook uses `subprocess` for git operations with safe parameters
- File operations use proper error handling and encoding
- No sensitive data is logged or committed automatically
- Git operations are limited to the current repository scope
