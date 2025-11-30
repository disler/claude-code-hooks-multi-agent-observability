#!/usr/bin/env python3
"""
Background Announcement Script

This script is called by hook_integration.py to make announcements
in a background process without blocking the main hook execution.
"""

import sys
import json
from pathlib import Path

# Add plugin src to path
plugin_src = Path(__file__).parent
sys.path.insert(0, str(plugin_src))

from audio_announcer import AudioAnnouncer


def main():
    """Run announcement in background"""
    if len(sys.argv) < 2:
        sys.exit(1)

    hook_type = sys.argv[1]

    # Read input data from stdin
    try:
        input_data = json.load(sys.stdin)
    except:
        # If JSON parsing fails, try eval (for compatibility)
        try:
            input_text = sys.stdin.read()
            input_data = eval(input_text)
        except:
            sys.exit(1)

    # Make announcement
    try:
        announcer = AudioAnnouncer()
        announcer.announce(hook_type, input_data)
    except:
        pass  # Silently fail


if __name__ == "__main__":
    main()
