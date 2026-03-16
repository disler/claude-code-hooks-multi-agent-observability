#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv",
# ]
# ///

import argparse
import json
import os
import sys
import threading
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional

from utils.constants import LOG_BASE_DIR


def log_pre_compact(input_data, custom_instructions):
    """Log pre-compact event to logs directory."""
    # Ensure logs directory exists
    log_dir = Path(LOG_BASE_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / 'pre_compact.json'

    # Read existing log data or initialize empty list
    if log_file.exists():
        with open(log_file, 'r') as f:
            try:
                log_data = json.load(f)
            except (json.JSONDecodeError, ValueError):
                log_data = []
    else:
        log_data = []

    # Build log entry with custom_instructions
    log_entry = {
        "session_id": input_data.get("session_id", "unknown"),
        "hook_event_name": input_data.get("hook_event_name", "PreCompact"),
        "trigger": input_data.get("trigger", "unknown"),
        "custom_instructions": custom_instructions,
    }
    log_data.append(log_entry)

    # Write back to file with formatting
    with open(log_file, 'w') as f:
        json.dump(log_data, f, indent=2)


def push_transcript_to_server(session_id: str, content: bytes):
    """Upload pre-read transcript content to the observability server.

    Accepts already-read bytes so the file is not accessed after the hook
    returns (compaction may overwrite it immediately on exit).
    Best-effort: errors are silently ignored so compaction always proceeds.
    """
    try:
        container_id = os.environ.get('HOSTNAME', 'unknown')
        server_base = os.environ.get('OBSERVABILITY_SERVER_URL', 'http://172.30.0.1:4000')
        # Convert ws(s):// to http(s):// if needed
        server_base = server_base.replace('wss://', 'https://').replace('ws://', 'http://')
        # Strip trailing path components to get base URL
        from urllib.parse import urlparse
        parsed = urlparse(server_base)
        base = f"{parsed.scheme}://{parsed.netloc}"
        url = f"{base}/container/{container_id}/session-log/{session_id}"
        req = urllib.request.Request(
            url,
            data=content,
            headers={'Content-Type': 'text/plain'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass  # success
    except Exception:
        pass  # silently ignore — compaction must not be blocked


def backup_transcript(transcript_path, trigger, custom_instructions=""):
    """Create a backup of the transcript before compaction."""
    try:
        if not os.path.exists(transcript_path):
            return

        # Create backup directory
        backup_dir = Path(LOG_BASE_DIR) / "transcript_backups"
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Generate backup filename with timestamp, trigger type, and custom_instructions
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_name = Path(transcript_path).stem
        # Include sanitized custom_instructions in filename if present
        suffix = ""
        if custom_instructions:
            # Sanitize for filename: take first 30 chars, replace non-alphanum with underscore
            import re
            sanitized = re.sub(r'[^a-zA-Z0-9]', '_', custom_instructions[:30]).strip('_')
            if sanitized:
                suffix = f"_{sanitized}"
        backup_name = f"{session_name}_pre_compact_{trigger}{suffix}_{timestamp}.jsonl"
        backup_path = backup_dir / backup_name

        # Copy transcript to backup
        import shutil
        shutil.copy2(transcript_path, backup_path)

        return str(backup_path)
    except Exception:
        return None


def main():
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser()
        parser.add_argument('--backup', action='store_true',
                          help='Create backup of transcript before compaction')
        parser.add_argument('--verbose', action='store_true',
                          help='Print verbose output')
        args = parser.parse_args()
        
        # Read JSON input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Extract fields
        session_id = input_data.get('session_id', 'unknown')
        transcript_path = input_data.get('transcript_path', '')
        trigger = input_data.get('trigger', 'unknown')  # "manual" or "auto"
        custom_instructions = input_data.get('custom_instructions', '')
        
        # Log the pre-compact event with custom_instructions
        log_pre_compact(input_data, custom_instructions)

        # Push transcript to observability server before compaction.
        # Read the file on the main thread NOW — compaction will overwrite it
        # as soon as this hook exits, so we must not defer the read to a thread.
        if transcript_path and session_id != 'unknown':
            try:
                with open(transcript_path, 'rb') as f:
                    transcript_content = f.read()
            except OSError:
                transcript_content = b''
            if transcript_content.strip():
                t = threading.Thread(
                    target=push_transcript_to_server,
                    args=(session_id, transcript_content),
                    daemon=True,
                )
                t.start()
                t.join(timeout=8)  # wait up to 8s but don't block compaction indefinitely

        # Create backup if requested (pass custom_instructions for naming)
        backup_path = None
        if args.backup and transcript_path:
            backup_path = backup_transcript(transcript_path, trigger, custom_instructions)
        
        # Provide feedback based on trigger type
        if args.verbose:
            if trigger == "manual":
                message = f"Preparing for manual compaction (session: {session_id[:8]}...)"
                if custom_instructions:
                    message += f"\nCustom instructions: {custom_instructions[:100]}..."
            else:  # auto
                message = f"Auto-compaction triggered due to full context window (session: {session_id[:8]}...)"
            
            if backup_path:
                message += f"\nTranscript backed up to: {backup_path}"
            
            print(message)
        
        # Success - compaction will proceed
        sys.exit(0)
        
    except json.JSONDecodeError:
        # Handle JSON decode errors gracefully
        sys.exit(0)
    except Exception:
        # Handle any other errors gracefully
        sys.exit(0)


if __name__ == '__main__':
    main()