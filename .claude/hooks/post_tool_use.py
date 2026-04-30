#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

import json
import os
import sys
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
            with open(log_path, 'r', encoding="utf-8", errors="replace") as f:
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

        sys.exit(0)

    except json.JSONDecodeError:
        # Handle JSON decode errors gracefully
        sys.exit(0)
    except Exception:
        # Exit cleanly on any other error
        sys.exit(0)

if __name__ == '__main__':
    main()