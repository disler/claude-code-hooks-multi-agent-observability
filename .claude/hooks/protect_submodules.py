#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///
#
# PreToolUse hook — prevents Claude from staging or committing submodule
# pointer updates in a git repository.
#
# Usage (in settings.json hook command):
#   protect_submodules.py [--all] [submodule ...]
#
#   --all        Detect all submodules from .gitmodules and protect them all.
#                This is the default when no arguments are given.
#   submodule    One or more submodule paths to protect (e.g. "observability").
#
# Canonical source: observability/.claude/hooks/protect_submodules.py
# Copied into projects by install-project-devcontainer-sandbox.sh.

import argparse
import json
import sys
import re
import subprocess
import os


def _git_run(*args):
    """Run a git command in the project root, returning stdout. Returns '' on error."""
    try:
        result = subprocess.run(
            ['git'] + list(args),
            capture_output=True, text=True, timeout=5,
            cwd=os.environ.get('CLAUDE_PROJECT_DIR', '.')
        )
        return result.stdout
    except Exception:
        return ''


def get_all_submodules():
    """Return list of submodule paths by parsing .gitmodules."""
    gitmodules = os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), '.gitmodules')
    paths = []
    try:
        with open(gitmodules) as f:
            for line in f:
                m = re.match(r'\s*path\s*=\s*(.+)', line)
                if m:
                    paths.append(m.group(1).strip())
    except FileNotFoundError:
        pass
    return paths


def is_pointer_modified(submodule):
    """True if the submodule pointer has uncommitted changes (staged or unstaged)."""
    return bool(_git_run('status', '--porcelain', submodule).strip())


def is_pointer_staged(submodule):
    """True if the submodule pointer is currently in the index."""
    return submodule in _git_run('diff', '--cached', '--name-only').splitlines()


def _unquote_command(command):
    """
    Replace the content inside single and double quotes with spaces,
    keeping quote delimiters.  This lets statement-splitting ignore
    git commands that appear only inside string arguments to other
    programs (e.g. python3 -c "git add observability").
    Handles simple cases; does not parse escape sequences or heredocs.
    """
    result = []
    in_single = False
    in_double = False
    for ch in command:
        if ch == "'" and not in_double:
            in_single = not in_single
            result.append(ch)
        elif ch == '"' and not in_single:
            in_double = not in_double
            result.append(ch)
        elif in_single or in_double:
            result.append(' ')  # blank out quoted content
        else:
            result.append(ch)
    return ''.join(result)


def _get_shell_statements(command):
    """
    Return individual top-level shell statements from *command*,
    ignoring content inside quotes (so git commands embedded in
    string literals are not returned).
    """
    unquoted = _unquote_command(command)
    parts = re.split(r'&&|\|\||[;|\n]', unquoted)
    return [p.strip() for p in parts if p.strip()]


def check_submodule_staging(command, submodules):
    """
    Return a denial reason string if the command would stage any protected
    submodule pointer in the parent repo, or None if it is safe.

    Only examines shell statements that begin directly with 'git' to avoid
    false positives from git commands embedded as string arguments to other
    programs (e.g. python3 -c "...git add observability...").
    """
    if not submodules:
        return None

    for stmt in _get_shell_statements(command):
        # Only check statements that actually invoke git directly
        if not re.match(r'^git\s+', stmt):
            continue

        # Explicit: git add <path matching a protected submodule>
        if re.match(r'^git\s+add\b', stmt):
            for sub in submodules:
                if re.search(r'\b' + re.escape(sub) + r'\b', stmt):
                    return (
                        f"Staging the '{sub}' submodule pointer in the parent repo is "
                        f"prohibited. Commit inside {sub}/ directly instead."
                    )

        # Broad add (. / -A / --all) when any protected pointer is modified
        # Match bare '.' (current dir) but not dotfiles like '.gitignore'
        if re.match(r'^git\s+add\s+(?:\.(?:\s|$)|(?:-A|--all)\b)', stmt):
            for sub in submodules:
                if is_pointer_modified(sub):
                    return (
                        f"This broad 'git add' would include the '{sub}' submodule pointer, "
                        f"which is prohibited. Stage specific files instead, or commit inside "
                        f"{sub}/ first so the pointer is no longer modified."
                    )

        # Commit when any protected pointer is already staged
        if re.match(r'^git\s+commit\b', stmt):
            for sub in submodules:
                if is_pointer_staged(sub):
                    return (
                        f"The '{sub}' submodule pointer is staged and would be included in "
                        f"this commit, which is prohibited. "
                        f"Run 'git restore --staged {sub}' first."
                    )

    return None


def deny_tool(reason):
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--all', dest='protect_all', action='store_true')
    parser.add_argument('submodules', nargs='*')
    # Unknown args (e.g. future flags) are silently ignored so the hook
    # never hard-fails on an unknown option.
    args, _ = parser.parse_known_args()
    return args


def main():
    args = parse_args()

    if args.protect_all or not args.submodules:
        submodules = get_all_submodules()
    else:
        submodules = args.submodules

    try:
        input_data = json.load(sys.stdin)
        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})

        if tool_name == 'Bash':
            command = tool_input.get('command', '')
            reason = check_submodule_staging(command, submodules)
            if reason:
                deny_tool(reason)

        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception:
        sys.exit(0)


if __name__ == '__main__':
    main()
