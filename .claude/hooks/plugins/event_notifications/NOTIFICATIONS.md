# OS Notifications Guide

Complete guide to macOS system notifications in the audio announcements plugin.

## Notification Types

The plugin supports three types of macOS notifications:

### 1. **banner** (Default)
Non-intrusive notification that appears in Notification Center.

**Behavior:**
- Appears in top-right corner of screen
- Disappears automatically after a few seconds
- Stored in Notification Center for later viewing
- Does NOT block or interrupt work
- Best for: Progress updates, completions, non-critical events

**Example:**
```json
{
  "os_notification": {
    "enabled": true,
    "title": "Task Complete",
    "message": "{source_app} finished",
    "type": "banner"
  }
}
```

### 2. **alert**
Modal alert dialog that requires user action.

**Behavior:**
- Appears as a modal dialog window
- Blocks until user clicks "OK"
- Makes a sound when it appears
- Cannot be dismissed without interaction
- Best for: Critical notifications, user input needed, errors

**Example:**
```json
{
  "os_notification": {
    "enabled": true,
    "title": "Response Needed",
    "message": "{source_app} needs your input",
    "type": "alert"
  }
}
```

**Visual:**
```
┌─────────────────────────────────┐
│  ⚠️  Response Needed            │
├─────────────────────────────────┤
│                                 │
│  TestAgent needs your input     │
│                                 │
│                    ┌──────┐     │
│                    │  OK  │     │
│                    └──────┘     │
└─────────────────────────────────┘
```

### 3. **dialog**
Dialog box with OK button (similar to alert).

**Behavior:**
- Appears as a dialog window
- Blocks until user clicks "OK"
- Similar to alert but different styling
- Message appears larger
- Best for: Important messages that need acknowledgment

**Example:**
```json
{
  "os_notification": {
    "enabled": true,
    "title": "Important",
    "message": "Critical error occurred",
    "type": "dialog"
  }
}
```

## Configuration

### Basic Setup

```json
{
  "hooks": {
    "HookName": {
      "os_notification": {
        "enabled": true,
        "title": "Notification Title",
        "message": "Notification message",
        "type": "banner"
      }
    }
  }
}
```

### Disable Notifications

```json
{
  "hooks": {
    "HookName": {
      "os_notification": false
    }
  }
}
```

### Template Variables

All notification titles and messages support template variables:

**Available Variables:**
- `{source_app}` - Agent name (e.g., "GeneralPurpose", "CodeReviewer")
- `{session_id}` - Session ID (truncated to 8 chars)
- `{tool_name}` - Tool that was executed
- `{hook_type}` - Type of hook event
- `{event}` - Session event type (for SessionStart/End)

**Example:**
```json
{
  "title": "🎯 {source_app}",
  "message": "Completed {tool_name} successfully"
}
```

Result: "🎯 GeneralPurpose" / "Completed Read successfully"

## Use Case Examples

### Non-Critical Progress (banner)

```json
{
  "PostToolUse": {
    "enabled": true,
    "template_category": "tool_usage",
    "os_notification": {
      "enabled": true,
      "title": "Progress",
      "message": "{tool_name} completed",
      "type": "banner"
    }
  }
}
```

**When to use:** Tool completions, session events, background progress

### Critical User Attention (alert)

```json
{
  "Notification": {
    "enabled": true,
    "template_category": "feedback_needed",
    "os_notification": {
      "enabled": true,
      "title": "⚠️ Attention Required",
      "message": "{source_app} needs your response",
      "type": "alert"
    }
  }
}
```

**When to use:** User input required, errors, critical events

### Task Completion (banner)

```json
{
  "Stop": {
    "enabled": true,
    "template_category": "task_completion",
    "os_notification": {
      "enabled": true,
      "title": "✅ Done",
      "message": "{source_app} completed all tasks",
      "type": "banner"
    }
  }
}
```

**When to use:** Work finished, long-running tasks complete

### Error Handling (alert)

```json
{
  "CustomHook": {
    "enabled": true,
    "os_notification": {
      "enabled": true,
      "title": "❌ Error",
      "message": "Operation failed - check logs",
      "type": "alert"
    }
  }
}
```

**When to use:** Errors, failures, problems requiring attention

## Recommended Configurations

### Minimal Interruption

Use banner notifications for everything:

```json
{
  "Stop": {"os_notification": {"type": "banner"}},
  "Notification": {"os_notification": {"type": "banner"}},
  "SubagentStop": {"os_notification": false}
}
```

### Maximum Awareness

Use alerts for important events:

```json
{
  "Stop": {"os_notification": {"type": "alert"}},
  "Notification": {"os_notification": {"type": "alert"}},
  "SubagentStop": {"os_notification": {"type": "banner"}}
}
```

### Balanced Approach (Recommended)

```json
{
  "hooks": {
    "PreToolUse": {
      "os_notification": false
    },
    "PostToolUse": {
      "os_notification": false
    },
    "Stop": {
      "os_notification": {
        "enabled": true,
        "title": "Task Complete",
        "message": "Work finished",
        "type": "banner"
      }
    },
    "Notification": {
      "os_notification": {
        "enabled": true,
        "title": "Response Needed",
        "message": "{source_app} needs input",
        "type": "alert"
      }
    }
  }
}
```

## Notification Behavior Notes

### Banner Notifications
- Appear for ~5 seconds
- Don't interrupt workflow
- Stored in Notification Center
- Can be clicked to view details
- System-controlled persistence (via System Preferences)

### Alert/Dialog Notifications
- **Block execution** until dismissed
- Show modal dialog window
- Make system alert sound
- Cannot be ignored
- **Use sparingly** to avoid workflow interruption

### Best Practices

1. **Use banners by default** - Less intrusive
2. **Use alerts for critical events** - User input needed, errors
3. **Keep messages short** - Notifications have limited space
4. **Use emojis for quick recognition** - 🎯 ✅ ⚠️ ❌
5. **Test notification types** - See what works for your workflow

### Testing

Test each notification type:

```bash
# Test banner (non-intrusive)
./test.py --hook Stop

# Test alert (modal dialog)
./test.py --hook Notification

# Compare the difference!
```

## Troubleshooting

### Notifications Not Appearing

1. **Check System Preferences**:
   - System Preferences → Notifications
   - Find "osascript" or "Script Editor"
   - Ensure notifications are allowed

2. **Check Focus Mode**:
   - Disable Focus/Do Not Disturb
   - Check notification settings for current Focus mode

3. **Test Directly**:
   ```bash
   osascript -e 'display notification "Test" with title "Test"'
   ```

### Alert Dialogs Not Blocking

This is expected behavior - alerts will block the Python script execution but not your entire system. The dialog appears and waits for user input.

### Banners Disappearing Too Quickly

This is controlled by macOS System Preferences:
- System Preferences → Notifications → osascript
- Change "Banner" to "Alert" style for persistent notifications

## Advanced: Custom Notification Logic

You can customize notification logic in `audio_announcer.py`:

```python
# Example: Only notify if task took > 5 minutes
if hook_type == "Stop":
    duration = context.get("duration_seconds", 0)
    if duration > 300:  # 5 minutes
        send_os_notification(title, message, "alert")
```

## Summary

**Type Comparison:**

| Type     | Persistent | Blocking | Use Case                  |
|----------|-----------|----------|---------------------------|
| banner   | No        | No       | Progress, completions     |
| alert    | Yes       | Yes      | Critical, user needed     |
| dialog   | Yes       | Yes      | Important acknowledgment  |

**Recommendation:** Start with `banner` for everything, then upgrade specific hooks to `alert` as needed.
