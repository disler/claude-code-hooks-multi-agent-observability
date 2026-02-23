#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from utils.constants import ensure_session_log_dir

def main():
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)

        # Extract fields
        session_id = input_data.get('session_id', 'unknown')
        tool_name = input_data.get('tool_name', '')
        tool_use_id = input_data.get('tool_use_id', '')
        tool_input = input_data.get('tool_input', {})
        tool_response = input_data.get('tool_response', {})
        is_mcp_tool = tool_name.startswith('mcp__')

        # Ensure session log directory exists
        log_dir = ensure_session_log_dir(session_id)
        log_path = log_dir / 'post_tool_use.json'

        # Read existing log data or initialize empty list
        if log_path.exists():
            with open(log_path, 'r') as f:
                try:
                    log_data = json.load(f)
                except (json.JSONDecodeError, ValueError):
                    log_data = []
        else:
            log_data = []

        # Build log entry with tool_use_id
        log_entry = {
            "tool_name": tool_name,
            "tool_use_id": tool_use_id,
            "session_id": session_id,
            "hook_event_name": input_data.get("hook_event_name", "PostToolUse"),
            "is_mcp_tool": is_mcp_tool,
        }

        # For MCP tools, log the server and tool parts
        if is_mcp_tool:
            parts = tool_name.split('__')
            if len(parts) >= 3:
                log_entry["mcp_server"] = parts[1]
                log_entry["mcp_tool_name"] = '__'.join(parts[2:])
            log_entry["input_keys"] = list(tool_input.keys())[:10]

        # Append log entry
        log_data.append(log_entry)

        # Write back to file with formatting
        with open(log_path, 'w') as f:
            json.dump(log_data, f, indent=2)

        # Auto-detect learning signals from observability rules
        check_auto_detect_rules('PostToolUse', input_data)

        sys.exit(0)

    except json.JSONDecodeError:
        # Handle JSON decode errors gracefully
        sys.exit(0)
    except Exception:
        # Exit cleanly on any other error
        sys.exit(0)

def check_auto_detect_rules(event_type, input_data, server_url='http://localhost:4000'):
    """Check observability.json rules and auto-tag matching events."""
    try:
        import re
        config_path = Path('.claude/observability.json')
        if not config_path.exists():
            return

        with open(config_path, 'r') as f:
            config = json.load(f)

        rules = config.get('auto_detect', {}).get('rules', [])
        if not rules:
            return

        # Serialize payload for regex matching
        payload_str = json.dumps(input_data)

        for rule in rules:
            # Check if hook_event_type matches
            if rule.get('hook_event_type') != event_type:
                continue

            # Check payload_match regex
            pattern = rule.get('payload_match', '')
            if not pattern or not re.search(pattern, payload_str, re.IGNORECASE):
                continue

            # Match found - auto-tag via server API
            auto_tags = rule.get('auto_tag', [])
            if auto_tags:
                try:
                    tag_data = {
                        'tags': auto_tags,
                        'note': f'Auto-detected by rule: {rule.get("name", "unknown")}'
                    }
                    # Query the most recent event of this type to get its ID
                    query_url = f'{server_url}/events/query?type={event_type}&limit=1'
                    req = urllib.request.Request(query_url)
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        result = json.loads(resp.read())
                        events = result.get('events', [])
                        if events and len(events) > 0:
                            event_id = events[0].get('id')
                            if event_id:
                                tag_url = f'{server_url}/events/{event_id}/tag'
                                tag_req = urllib.request.Request(
                                    tag_url,
                                    data=json.dumps(tag_data).encode('utf-8'),
                                    headers={'Content-Type': 'application/json'}
                                )
                                urllib.request.urlopen(tag_req, timeout=3)
                except Exception:
                    pass  # Never block on auto-detection failure
    except Exception:
        pass  # Never block on any error


if __name__ == '__main__':
    main()