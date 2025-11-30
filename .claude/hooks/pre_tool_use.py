#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

import json
import sys
import re
from pathlib import Path
from utils.constants import ensure_session_log_dir

# Allowed directories where rm -rf is permitted
ALLOWED_RM_DIRECTORIES = [
    'trees/',
]

def is_path_in_allowed_directory(command, allowed_dirs):
    """
    Check if the rm command targets paths exclusively within allowed directories.
    Returns True if all paths in the command are within allowed directories.
    """
    # Extract the path portion after rm and its flags
    # Pattern: rm [flags] path1 path2 ...
    path_pattern = r'rm\s+(?:-[\w]+\s+|--[\w-]+\s+)*(.+)$'
    match = re.search(path_pattern, command, re.IGNORECASE)

    if not match:
        return False

    path_str = match.group(1).strip()

    # Split by spaces to get individual paths (simple approach)
    # This might not handle all edge cases but works for common usage
    paths = path_str.split()

    if not paths:
        return False

    # Check if all paths are within allowed directories
    for path in paths:
        # Remove quotes
        path = path.strip('\'"')

        # Skip if empty
        if not path:
            continue

        # Check if this path is within any allowed directory
        is_allowed = False
        for allowed_dir in allowed_dirs:
            # Check various formats:
            # - trees/something
            # - ./trees/something
            if path.startswith(allowed_dir) or path.startswith('./' + allowed_dir):
                is_allowed = True
                break

        # If any path is not in allowed directories, return False
        if not is_allowed:
            return False

    # All paths are within allowed directories
    return True

def is_dangerous_rm_command(command, allowed_dirs=None):
    """
    Comprehensive detection of dangerous rm commands.
    Matches various forms of rm -rf and similar destructive patterns.
    Returns False if the command targets only allowed directories.

    Args:
        command: The bash command to check
        allowed_dirs: List of directory paths where rm -rf is permitted

    Returns:
        True if the command is dangerous and should be blocked, False otherwise
    """
    if allowed_dirs is None:
        allowed_dirs = []

    # Normalize command by removing extra spaces and converting to lowercase
    normalized = ' '.join(command.lower().split())

    # Pattern 1: Standard rm -rf variations
    patterns = [
        r'\brm\s+.*-[a-z]*r[a-z]*f',  # rm -rf, rm -fr, rm -Rf, etc.
        r'\brm\s+.*-[a-z]*f[a-z]*r',  # rm -fr variations
        r'\brm\s+--recursive\s+--force',  # rm --recursive --force
        r'\brm\s+--force\s+--recursive',  # rm --force --recursive
        r'\brm\s+-r\s+.*-f',  # rm -r ... -f
        r'\brm\s+-f\s+.*-r',  # rm -f ... -r
    ]

    # Check for dangerous patterns
    is_potentially_dangerous = False
    for pattern in patterns:
        if re.search(pattern, normalized):
            is_potentially_dangerous = True
            break

    # If not found in Pattern 1, check Pattern 2
    if not is_potentially_dangerous:
        # Pattern 2: Check for rm with recursive flag targeting dangerous paths
        dangerous_paths = [
            r'/',           # Root directory
            r'/\*',         # Root with wildcard
            r'~',           # Home directory
            r'~/',          # Home directory path
            r'\$HOME',      # Home environment variable
            r'\.\.',        # Parent directory references
            r'\*',          # Wildcards in general rm -rf context
            r'\.',          # Current directory
            r'\.\s*$',      # Current directory at end of command
        ]

        if re.search(r'\brm\s+.*-[a-z]*r', normalized):  # If rm has recursive flag
            for path in dangerous_paths:
                if re.search(path, normalized):
                    is_potentially_dangerous = True
                    break

    # If not potentially dangerous at all, it's safe
    if not is_potentially_dangerous:
        return False

    # It's potentially dangerous - check if targeting only allowed directories
    if allowed_dirs and is_path_in_allowed_directory(command, allowed_dirs):
        return False  # Allowed directory, so not dangerous

    # Dangerous and not in allowed directories
    return True

def is_env_file_access(tool_name, tool_input):
    """
    Check if any tool is trying to access .env files containing sensitive data.
    """
    if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write', 'Bash']:
        # Check file paths for file-based tools
        if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write']:
            file_path = tool_input.get('file_path', '')
            if '.env' in file_path and not file_path.endswith('.env.sample'):
                return True
        
        # Check bash commands for .env file access
        elif tool_name == 'Bash':
            command = tool_input.get('command', '')
            # Pattern to detect .env file access (but allow .env.sample)
            env_patterns = [
                r'\b\.env\b(?!\.sample)',  # .env but not .env.sample
                r'cat\s+.*\.env\b(?!\.sample)',  # cat .env
                r'echo\s+.*>\s*\.env\b(?!\.sample)',  # echo > .env
                r'touch\s+.*\.env\b(?!\.sample)',  # touch .env
                r'cp\s+.*\.env\b(?!\.sample)',  # cp .env
                r'mv\s+.*\.env\b(?!\.sample)',  # mv .env
            ]
            
            for pattern in env_patterns:
                if re.search(pattern, command):
                    return True
    
    return False

def main():
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        
        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})

        # Check for .env file access (blocks access to sensitive environment files)
        # COMMENTED OUT: Allows worktree command to create .env files automatically
        # if is_env_file_access(tool_name, tool_input):
        #     print("BLOCKED: Access to .env files containing sensitive data is prohibited", file=sys.stderr)
        #     print("Use .env.sample for template files instead", file=sys.stderr)
        #     sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude

        # Check for dangerous rm -rf commands
        if tool_name == 'Bash':
            command = tool_input.get('command', '')

            # Block rm -rf commands unless they target allowed directories
            if is_dangerous_rm_command(command, ALLOWED_RM_DIRECTORIES):
                print("BLOCKED: Dangerous rm command detected and prevented", file=sys.stderr)
                print(f"Tip: rm -rf is only allowed in these directories: {', '.join(ALLOWED_RM_DIRECTORIES)}", file=sys.stderr)
                sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude
        
        # Extract session_id
        session_id = input_data.get('session_id', 'unknown')
        
        # Ensure session log directory exists
        log_dir = ensure_session_log_dir(session_id)
        log_path = log_dir / 'pre_tool_use.json'
        
        # Read existing log data or initialize empty list
        if log_path.exists():
            with open(log_path, 'r') as f:
                try:
                    log_data = json.load(f)
                except (json.JSONDecodeError, ValueError):
                    log_data = []
        else:
            log_data = []
        
        # Append new data
        log_data.append(input_data)
        
        # Write back to file with formatting
        with open(log_path, 'w') as f:
            json.dump(log_data, f, indent=2)

        # Execute plugins
        try:
            from plugin_manager import execute_plugins
            execute_plugins("PreToolUse", input_data)
        except ImportError:
            pass

        sys.exit(0)
        
    except json.JSONDecodeError:
        # Gracefully handle JSON decode errors
        sys.exit(0)
    except Exception:
        # Handle any other errors gracefully
        sys.exit(0)

if __name__ == '__main__':
    main()