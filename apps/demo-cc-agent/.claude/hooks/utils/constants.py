#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

"""
Constants for Claude Code Hooks.
"""

import os
import re
from pathlib import Path

# Base directory for all logs
# Default is 'logs' in the current working directory
LOG_BASE_DIR = os.environ.get("CLAUDE_HOOKS_LOG_DIR", "logs")

# Only allow safe characters in session IDs to prevent path traversal
_SAFE_SESSION_ID_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


def _sanitize_session_id(session_id: str) -> str:
    """
    Sanitize session_id to prevent path traversal attacks.

    Rejects any session_id containing path separators, dots, or other
    characters that could escape the log directory.
    """
    if not session_id or not _SAFE_SESSION_ID_RE.match(session_id):
        return "invalid-session"
    return session_id


def get_session_log_dir(session_id: str) -> Path:
    """
    Get the log directory for a specific session.

    Args:
        session_id: The Claude session ID

    Returns:
        Path object for the session's log directory
    """
    safe_id = _sanitize_session_id(session_id)
    log_dir = (Path(LOG_BASE_DIR) / safe_id).resolve()
    base = Path(LOG_BASE_DIR).resolve()
    # Final guard: ensure resolved path is under the base log directory
    if not str(log_dir).startswith(str(base) + os.sep) and log_dir != base:
        return base / "invalid-session"
    return log_dir


def ensure_session_log_dir(session_id: str) -> Path:
    """
    Ensure the log directory for a session exists.

    Args:
        session_id: The Claude session ID

    Returns:
        Path object for the session's log directory
    """
    log_dir = get_session_log_dir(session_id)
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def validate_transcript_path(transcript_path: str) -> bool:
    """
    Validate that a transcript path points to a legitimate Claude transcript.

    Only allows reading from known Claude data directories to prevent
    arbitrary file reads via crafted transcript_path values.
    """
    if not transcript_path:
        return False
    resolved = Path(transcript_path).resolve()
    home = Path.home()
    allowed_prefixes = [
        home / ".claude",
        Path("/tmp"),
    ]
    return any(
        str(resolved).startswith(str(prefix) + os.sep) or resolved == prefix
        for prefix in allowed_prefixes
    )