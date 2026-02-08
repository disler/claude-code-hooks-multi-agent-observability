#!/usr/bin/env python3
"""Stop hook validator: checks that a new file was created in a directory.

Usage:
    uv run .claude/hooks/validators/validate_new_file.py --directory specs --extension .md

Reads the Stop hook JSON from stdin. Scans the directory for files matching
the extension. If at least one file exists, exits 0 (allow stop). If none
found, exits 2 with an error on stderr (block stop).
"""
import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Validate a new file was created")
    parser.add_argument("--directory", required=True, help="Directory to check")
    parser.add_argument("--extension", required=True, help="File extension to look for")
    args = parser.parse_args()

    # Read stdin (Stop hook input) but we only need the cwd
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        hook_input = {}

    cwd = hook_input.get("cwd", ".")
    search_dir = Path(cwd) / args.directory

    if not search_dir.exists():
        # Directory doesn't exist — this validator is a no-op outside of /plan_w_team
        sys.exit(0)

    ext = args.extension if args.extension.startswith(".") else f".{args.extension}"
    matching_files = list(search_dir.glob(f"*{ext}"))

    if not matching_files:
        print(f"No {ext} files found in '{args.directory}'", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
