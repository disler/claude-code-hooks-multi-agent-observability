#!/usr/bin/env python3
"""Stop hook validator: checks that files in a directory contain required strings.

Usage:
    uv run .claude/hooks/validators/validate_file_contains.py \
        --directory specs --extension .md \
        --contains '## Task Description' \
        --contains '## Objective'

Reads the Stop hook JSON from stdin. Finds the most recently modified file
matching the extension in the directory, then checks it contains all
required strings. Exits 0 if all found, exits 2 with missing sections on stderr.
"""
import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Validate file contains required sections")
    parser.add_argument("--directory", required=True, help="Directory to check")
    parser.add_argument("--extension", required=True, help="File extension to look for")
    parser.add_argument("--contains", action="append", required=True, help="Required string (repeatable)")
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
    matching_files = sorted(search_dir.glob(f"*{ext}"), key=lambda f: f.stat().st_mtime, reverse=True)

    if not matching_files:
        print(f"No {ext} files found in '{args.directory}'", file=sys.stderr)
        sys.exit(2)

    # Check the most recently modified file
    target_file = matching_files[0]
    content = target_file.read_text(encoding="utf-8")

    missing = [s for s in args.contains if s not in content]

    if missing:
        print(f"File '{target_file.name}' is missing required sections:", file=sys.stderr)
        for section in missing:
            print(f"  - {section}", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
