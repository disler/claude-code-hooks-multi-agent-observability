#!/usr/bin/env bash
# planq-setup.sh — Container build-time setup for planq.
# Called from the Dockerfile; installs the `planq` command wrapper on PATH.
# Any future planq container setup should be added here rather than to the Dockerfile.

# Install a `planq` wrapper at ~/.local/bin so it is available anywhere in the shell.
mkdir -p /home/node/.local/bin
printf '%s\n' '#!/bin/bash' 'exec /workspace/.claude/planq.sh "$@"' \
  > /home/node/.local/bin/planq
chmod +x /home/node/.local/bin/planq

# Set up the .claude/.venv virtual environment and install requirements.
if [ -f /workspace/.claude/requirements.txt ]; then
  python3 -m venv /workspace/.claude/.venv
  /workspace/.claude/.venv/bin/pip install --quiet -r /workspace/.claude/requirements.txt
fi
