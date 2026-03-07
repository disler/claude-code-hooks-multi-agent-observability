#!/usr/bin/env bash
# planq-setup.sh — Container build-time setup for planq.
# Called from the Dockerfile; installs the `planq` command wrapper on PATH.
# Any future planq container setup should be added here rather than to the Dockerfile.

# Install a `planq` wrapper at ~/.local/bin so it is available anywhere in the shell.
mkdir -p /home/node/.local/bin
printf '%s\n' '#!/bin/bash' 'exec /workspace/.claude/planq.sh "$@"' \
  > /home/node/.local/bin/planq
chmod +x /home/node/.local/bin/planq

# Set up the planq daemon venv and keep requirements up to date.
# The venv is pre-built in the Dockerfile at this path; this step updates it
# if requirements.txt has changed since the image was built.
PLANQ_VENV="${HOME}/.local/devcontainer-sandbox/planq-venv"
if [ -f /workspace/.claude/requirements.txt ]; then
    if [ ! -x "${PLANQ_VENV}/bin/python3" ]; then
        python3 -m venv "${PLANQ_VENV}"
    fi
    "${PLANQ_VENV}/bin/pip" install --quiet -r /workspace/.claude/requirements.txt || { 
        echo Error installing requirements for $PLANQ_VENV - may need to rerun $0 >&2
    }
fi
