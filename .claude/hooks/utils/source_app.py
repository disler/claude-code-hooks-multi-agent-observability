#!/usr/bin/env python3
"""
Source App Detection Utility

Detects the source application name using a fallback chain:
1. CLAUDE_SOURCE_APP environment variable
2. .claude/hooks/config.json file
3. Project directory name (auto-detection)

Usage:
    from utils.source_app import get_source_app

    source_app = get_source_app()
"""

import os
import json
from pathlib import Path
from typing import Optional


def get_source_app() -> str:
    """
    Get source application name using fallback chain.

    Priority order:
    1. CLAUDE_SOURCE_APP environment variable
    2. source_app in .claude/hooks/config.json
    3. Project directory name (from CLAUDE_PROJECT_DIR or cwd)

    Returns:
        Source application name as string
    """

    # 1. Check environment variable first
    env_source = os.environ.get('CLAUDE_SOURCE_APP')
    if env_source:
        return env_source.strip()

    # 2. Check config file
    config_source = _get_from_config()
    if config_source:
        return config_source

    # 3. Fall back to project directory name
    return _get_from_project_dir()


def _get_from_config() -> Optional[str]:
    """
    Read source_app from .claude/hooks/config.json

    Returns:
        Source app name or None if not found/invalid
    """
    try:
        # Find hooks directory
        hooks_dir = Path(__file__).parent.parent
        config_path = hooks_dir / 'config.json'

        if not config_path.exists():
            return None

        with open(config_path, 'r') as f:
            config = json.load(f)

        source_app = config.get('source_app')
        if source_app and isinstance(source_app, str):
            return source_app.strip()

        return None

    except (json.JSONDecodeError, IOError, KeyError):
        return None


def _get_from_project_dir() -> str:
    """
    Auto-detect source app from project directory name.

    Returns:
        Project directory name
    """
    # Try CLAUDE_PROJECT_DIR first
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR')

    if not project_dir:
        # Fall back to current working directory
        project_dir = os.getcwd()

    # Get directory name
    dir_name = Path(project_dir).name

    # Return as-is (preserve original case and format)
    return dir_name if dir_name else 'unknown'


# For testing
if __name__ == '__main__':
    import sys

    print("Source App Detection Test")
    print("=" * 60)
    print()

    # Show detection method
    env_val = os.environ.get('CLAUDE_SOURCE_APP')
    if env_val:
        print(f"✓ Environment variable: CLAUDE_SOURCE_APP={env_val}")
    else:
        print("✗ Environment variable: CLAUDE_SOURCE_APP not set")

    config_val = _get_from_config()
    if config_val:
        print(f"✓ Config file: source_app={config_val}")
    else:
        print("✗ Config file: .claude/hooks/config.json not found or no source_app")

    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())
    print(f"→ Project directory: {project_dir}")
    print(f"→ Directory name: {_get_from_project_dir()}")

    print()
    print("-" * 60)
    result = get_source_app()
    print(f"Final result: {result}")
    print("=" * 60)
