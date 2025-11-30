# macOS Notification Setup Guide

How to configure macOS to show persistent banner notifications (like in screenshots) without intrusive modal dialogs.

## The Problem

By default, macOS banner notifications disappear after ~5 seconds. Modal alerts are intrusive and block your workflow.

## The Solution

Configure macOS System Settings to make banner notifications more persistent.

## Step-by-Step Setup

### 1. Open System Settings

```
System Settings → Notifications
```

### 2. Find Script Editor (or osascript)

Scroll down to find either:
- **Script Editor**
- **osascript**

This is how our notifications appear in the system.

### 3. Configure Notification Style

Click on "Script Editor" or "osascript" and configure:

**Alert Style:**
- ✅ **Banners** (Recommended) - Appears top-right, dismisses automatically
- ❌ **Alerts** - Stays on screen until dismissed (more persistent but annoying)
- ❌ **None** - Disables notifications

**Additional Options:**
- ✅ **Allow Notifications** - Enable this
- ✅ **Show in Notification Center** - Enable to review later
- ✅ **Badge app icon** - Optional
- ✅ **Play sound for notifications** - Enable if using notification sounds

### 4. Adjust Banner Time (Optional)

Unfortunately, macOS doesn't allow customizing how long banners stay visible. However, you can:

1. **Use Alert style** (from step 3) to keep notifications until dismissed
2. **Keep Notification Center open** to see all notifications
3. **Use Focus modes** to control when notifications appear

## Recommended Configuration

### For Maximum Awareness (Non-Intrusive)

```
System Settings → Notifications → Script Editor:
- Alert Style: Banners
- Allow Notifications: ✅
- Show in Notification Center: ✅
- Play sound: ✅
```

**Plugin config:**
```json
{
  "os_notification": {
    "enabled": true,
    "title": "⚠️ Response Needed",
    "message": "{source_app} needs input",
    "type": "banner"
  }
}
```

**Result:** Nice top-right notifications with sound, visible in Notification Center

### For True Persistence (Intrusive)

```
System Settings → Notifications → Script Editor:
- Alert Style: Alerts
- Allow Notifications: ✅
```

**Plugin config:**
```json
{
  "os_notification": {
    "type": "banner"
  }
}
```

**Result:** Notifications stay on screen until you dismiss them (but not modal dialogs)

## Notification Type Comparison

| Config Type | System Setting | Result |
|------------|----------------|---------|
| `banner` | Banners | Top-right, auto-dismiss (~5s) |
| `banner` | Alerts | Top-right, stays until dismissed |
| `alert` | Any | Center-screen modal dialog (blocks) |
| `dialog` | Any | Center-screen dialog (blocks) |

## Recommended Approach

**Use `type: "banner"` everywhere** and control persistence via System Settings:

1. **Non-Critical** (Progress, completions):
   - System Setting: **Banners** (auto-dismiss)
   - Config: `"type": "banner"`

2. **Important** (User input needed):
   - System Setting: **Alerts** (persistent banner)
   - Config: `"type": "banner"`
   - Add emoji: `"title": "⚠️ Response Needed"`

3. **Critical** (Errors, must see):
   - System Setting: **Alerts**
   - Config: `"type": "alert"` (modal dialog)
   - Use sparingly!

## Visual Examples

### Banner Notification (Recommended)
```
┌─────────────────────────────────┐
│ 🔔 Script Editor          [×]   │  ← Top-right of screen
├─────────────────────────────────┤
│ ⚠️ Response Needed              │
│ TestAgent needs your input      │
└─────────────────────────────────┘
```
- Appears top-right
- Auto-dismisses or stays (based on System Settings)
- Non-intrusive
- Can click for details

### Alert Dialog (Use Sparingly)
```
        ┌─────────────────────┐
        │  ⚠️  Response Needed │  ← Center of screen
        ├─────────────────────┤
        │ TestAgent needs     │
        │ your input          │
        │                     │
        │          ┌────┐     │
        │          │ OK │     │
        │          └────┘     │
        └─────────────────────┘
```
- Appears center-screen
- Blocks until dismissed
- Intrusive
- Use only for critical errors

## Making Notifications Stand Out

### Use Emojis

```json
{
  "title": "⚠️ Response Needed",
  "title": "✅ Task Complete",
  "title": "❌ Error Occurred",
  "title": "🎯 Action Required"
}
```

### Use Notification Sounds

```json
{
  "os_notification": {
    "title": "Response Needed",
    "type": "banner"
  },
  "sound_effect": "Purr"  // Plays along with notification
}
```

### Increase Volume

```json
{
  "volume": 1.0,  // Full volume
  "os_notification": {
    "enabled": true,
    "title": "⚠️ URGENT: Response Needed"
  }
}
```

## Troubleshooting

### Notifications Not Appearing

1. **Check System Settings**:
   ```
   System Settings → Notifications → Script Editor
   Ensure "Allow Notifications" is enabled
   ```

2. **Check Focus Mode**:
   ```
   Click Control Center (top-right)
   Disable "Do Not Disturb" or "Focus"
   ```

3. **Test Manually**:
   ```bash
   osascript -e 'display notification "Test" with title "Test Title"'
   ```

### Notifications Disappear Too Fast

- Change System Settings → Notifications → Script Editor → **Alerts** style
- This keeps banners visible until dismissed

### Want Less Intrusive

- Use `"type": "banner"` in config
- Set System Settings to **Banners** style
- Notifications auto-dismiss

## Best Practices

1. **Default to `banner` type** - Less intrusive
2. **Use System Settings for persistence** - Not modal dialogs
3. **Add emojis for visibility** - Quick recognition
4. **Use sounds for critical events** - Audio + visual
5. **Reserve `alert` type for true emergencies** - Rarely needed

## Example Configurations

### Minimal Interruption
```json
{
  "Stop": {
    "os_notification": {
      "title": "✅ Complete",
      "type": "banner"
    }
  }
}
```
System Settings: **Banners** → Auto-dismiss

### Balanced Awareness
```json
{
  "Notification": {
    "os_notification": {
      "title": "⚠️ Response Needed",
      "type": "banner"
    },
    "sound_effect": "Purr"
  }
}
```
System Settings: **Alerts** → Persistent banner

### Maximum Attention (Emergency)
```json
{
  "CriticalError": {
    "os_notification": {
      "title": "❌ CRITICAL ERROR",
      "type": "alert"
    },
    "sound_effect": "Basso",
    "volume": 1.0
  }
}
```
System Settings: Any → Modal dialog

## Summary

**For notifications like your screenshot:**
1. Use `"type": "banner"` in config
2. Set System Settings → Script Editor → **Alerts** style
3. Add emojis to titles for visibility
4. Use sound effects for important events

This gives you persistent, visible, non-intrusive notifications in the top-right corner! 🎉
