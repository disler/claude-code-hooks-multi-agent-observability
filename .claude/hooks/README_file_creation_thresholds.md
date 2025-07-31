# File Creation Threshold Hook

This document describes the file creation threshold monitoring system that automatically tracks and manages new file creation in Claude Code sessions.

## Overview

The file creation threshold hook monitors when new files are created using the `Write` tool and can automatically commit them based on configurable thresholds. This helps maintain organized git history and prevents too many uncommitted files from accumulating.

## Configuration

The file creation thresholds are configured in `.claude/settings.json` under the `file_creation_thresholds` section:

```json
{
  "file_creation_thresholds": {
    "max_new_file_lines": 100,
    "max_files_per_session": 5,
    "enabled": true,
    "auto_commit": true,
    "commit_message_prefix": "Auto-commit: New file created - ",
    "exclude_patterns": [
      "*.tmp",
      "*.log",
      "*.cache",
      ".DS_Store",
      "Thumbs.db"
    ],
    "include_patterns": [
      "*.py",
      "*.md",
      "*.yaml",
      "*.yml",
      "*.json",
      "*.toml",
      "*.txt"
    ]
  }
}
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_new_file_lines` | number | 100 | Maximum number of lines in a new file before triggering auto-commit |
| `max_files_per_session` | number | 5 | Maximum number of files that can be created in a session before auto-commit |
| `enabled` | boolean | true | Whether file creation monitoring is enabled |
| `auto_commit` | boolean | true | Whether to automatically commit when thresholds are exceeded |
| `commit_message_prefix` | string | "Auto-commit: New file created - " | Prefix for auto-commit messages |
| `exclude_patterns` | array | See above | File patterns to exclude from monitoring |
| `include_patterns` | array | See above | File patterns to include in monitoring (empty = all files) |

## How It Works

### 1. File Creation Detection

- Monitors `Write` tool usage for new file creation
- Determines if a file is new by checking if it exists before the write operation
- Only tracks files that match the include/exclude pattern rules

### 2. Threshold Checking

The hook checks two thresholds:

- **File Size Threshold**: If a new file exceeds `max_new_file_lines`
- **Session File Count**: If the number of files created in the current session exceeds `max_files_per_session`

### 3. Auto-commit Behavior

When thresholds are exceeded:

1. The hook logs the file creation event
1. Stages all current changes (`git add .`)
1. Creates a commit with a descriptive message
1. Includes file name and line count in the commit message

### 4. Session Tracking

- File creation events are logged to `logs/current/file_creations.log`
- Each entry includes timestamp and file path
- Session data persists across tool calls

## File Pattern Matching

### Include Patterns

- If `include_patterns` is empty, all files are included (except those matching exclude patterns)
- If `include_patterns` has values, only files matching these patterns are tracked
- Uses shell-style wildcards (e.g., `*.py`, `config.*`)

### Exclude Patterns

- Files matching exclude patterns are never tracked
- Exclude patterns take precedence over include patterns
- Useful for ignoring temporary files, logs, caches, etc.

## Example Workflows

### Scenario 1: Large File Creation

```
User creates: comprehensive_analysis.py (150 lines)
Threshold: max_new_file_lines = 100
Result: Auto-commit triggered
Commit: "Auto-commit: New file created - comprehensive_analysis.py (150 lines)"
```

### Scenario 2: Multiple File Creation

```
Session files created: 
1. config.yaml
2. utils.py  
3. tests.py
4. docs.md
5. example.py
6. main.py ← triggers threshold

Threshold: max_files_per_session = 5
Result: Auto-commit triggered when 6th file is created
Commit: "Auto-commit: New file created - main.py (25 lines)"
```

### Scenario 3: Excluded File

```
User creates: debug.log (200 lines)
Pattern: "*.log" in exclude_patterns
Result: File ignored, no auto-commit
```

## Benefits

1. **Organized Git History**: Automatic commits prevent large accumulations of uncommitted files
1. **Threshold Management**: Prevents sessions from creating too many files without commits
1. **Selective Tracking**: Include/exclude patterns allow fine-tuned control
1. **Session Awareness**: Tracks file creation across the entire Claude session
1. **Non-blocking**: File creation is never blocked, only managed through commits

## Monitoring and Logs

### File Creation Log

Location: `logs/current/file_creations.log`

Format:

```
2025-07-25T10:30:15.123456: /path/to/new/file1.py
2025-07-25T10:35:22.789012: /path/to/new/file2.md
```

### Hook Output

The hook provides detailed output to stderr:

```
NEW FILE CREATION THRESHOLD EXCEEDED:
  File: /home/user/project/large_file.py
  Lines in new file: 150 (max: 100)
  Files created this session: 3 (max: 5)
AUTO-COMMIT: Will commit new file creation
AUTO-COMMIT: Staging changes for commit
AUTO-COMMIT: Creating commit: Auto-commit: New file created - large_file.py (150 lines)
AUTO-COMMIT: Commit completed successfully
```

## Customization

### Adjusting Thresholds

Edit `.claude/settings.json` to modify thresholds:

```json
{
  "file_creation_thresholds": {
    "max_new_file_lines": 200,     // Allow larger files
    "max_files_per_session": 10    // Allow more files per session
  }
}
```

### Custom File Patterns

Add your own patterns:

```json
{
  "file_creation_thresholds": {
    "include_patterns": [
      "*.py", "*.js", "*.ts",      // Code files
      "*.md", "*.rst",             // Documentation
      "config.*", "*.env.sample"   // Configuration
    ],
    "exclude_patterns": [
      "*.tmp", "*.backup",         // Temporary files
      "node_modules/*",            // Dependencies
      "*.pyc", "__pycache__/*"     // Compiled files
    ]
  }
}
```

### Disabling Auto-commit

To track but not auto-commit:

```json
{
  "file_creation_thresholds": {
    "enabled": true,       // Still track files
    "auto_commit": false   // But don't auto-commit
  }
}
```

## Integration with Edit Thresholds

The file creation hook works alongside the existing edit threshold hook:

- Edit thresholds monitor changes to existing files
- File creation thresholds monitor new file creation
- Both can trigger auto-commits independently
- Both respect their own enable/disable settings

## Best Practices

1. **Set Reasonable Thresholds**: Balance between too frequent and too infrequent commits
1. **Use Appropriate Patterns**: Include only files you want to track in git
1. **Monitor Session Logs**: Check `file_creations.log` to understand file creation patterns
1. **Coordinate with Team**: Ensure consistent settings across team members
1. **Regular Review**: Periodically review and adjust thresholds based on usage patterns

## Troubleshooting

### Hook Not Triggering

- Check `enabled: true` in configuration
- Verify file matches include patterns and doesn't match exclude patterns
- Ensure file is truly new (doesn't exist before Write operation)

### Auto-commit Failing

- Check git repository status and permissions
- Verify working directory is a git repository
- Check for git configuration issues

### Pattern Matching Issues

- Test patterns using shell wildcards
- Remember exclude patterns take precedence
- Check file names match exactly (case-sensitive on Unix systems)

### Session Tracking Problems

- Verify `logs/current/` directory is writable
- Check for permissions issues
- Clear old session logs if needed

This file creation threshold system provides flexible, automated management of new file creation while maintaining full control through configuration options.
