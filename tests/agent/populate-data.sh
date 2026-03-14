#!/usr/bin/env bash
# populate-data.sh — Create sample git repos, plans, and session logs for agent testing.
# Run once from setup.sh (or manually to reset test data).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/test-data"

die() { echo "ERROR: $*" >&2; exit 1; }

echo "Creating test data at $DATA_DIR..."
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR/server" "$DATA_DIR/pids" "$DATA_DIR/logs"

# ── Helper: create a simulated devcontainer workspace ─────────────────────────
#
# Usage: make_workspace <data-dir-path> <hostname> <source-repo> <branch>
make_workspace() {
    local wspath="$1" hostname="$2" source_repo="$3" branch="${4:-main}"

    mkdir -p "$wspath/.devcontainer/versions" "$wspath/plans/archive" "$wspath/.claude/logs"

    # .sandbox-host-machine so planq-daemon reports correct hostname
    echo "$hostname" > "$wspath/.devcontainer/.sandbox-host-machine"
    echo "$source_repo" > "$wspath/.devcontainer/.sandbox-project"

    # Initialize git repo
    git -C "$wspath" init -q -b "$branch"
    git -C "$wspath" config user.email "test@example.com"
    git -C "$wspath" config user.name "Test"

    # Add a few commits
    echo "# $source_repo" > "$wspath/README.md"
    git -C "$wspath" add README.md
    git -C "$wspath" commit -q -m "Initial commit"

    echo "first feature" > "$wspath/feature.txt"
    git -C "$wspath" add feature.txt
    git -C "$wspath" commit -q -m "Add first feature"

    echo "second feature" >> "$wspath/feature.txt"
    git -C "$wspath" add feature.txt
    git -C "$wspath" commit -q -m "Extend feature"
}

# ── Helper: write a planq queue file ─────────────────────────────────────────
write_planq() {
    local plans_dir="$1"
    # Include parent/child tasks for subtask filter dimming tests.
    # Subtasks use "- " prefix (depth 1); nested subtasks use "  - " (depth 2).
    cat > "$plans_dir/planq-order.txt" << 'PLANQ'
# planq-order.txt — test task queue
task: task-example.md +auto-commit
- unnamed-task: subtask of example
- unnamed-task: another subtask
# done: unnamed-task: write the initial README
manual-task: Review the output and approve
unnamed-task: standalone filter target
PLANQ
    echo "implement the example feature described in README.md" > "$plans_dir/task-example.md"
}

# ── Helper: write sample session logs ────────────────────────────────────────
# Session logs reference task filenames so the server can create task-session links.
write_session_logs() {
    local logs_dir="$1" source_app="$2" label="$3"
    local session_id="test-session-$(echo "$label" | tr ' ' '-')-0000"
    local ts
    ts=$(date +%s)

    # A minimal JSONL session log (matches what Claude Code writes).
    # The user message references task-example.md so the server will create a
    # task_session_link between this session and that task.
    cat > "$logs_dir/${session_id}.jsonl" << EOF
{"type":"user","message":{"role":"user","content":"Run /planq run task-example.md"},"timestamp":$ts}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Running task-example.md now"}]},"timestamp":$((ts+1))}
{"type":"user","message":{"role":"user","content":"Check plans/task-example.md"},"timestamp":$((ts+2))}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{"command":"bash .claude/planq.sh run task-example.md"}}]},"timestamp":$((ts+3))}
EOF

    # Write the source_app hook-style event to show up in agent swim lane
    mkdir -p "$(dirname "$logs_dir")/.claude"
}

# ── Create simulated hosts and containers ─────────────────────────────────────

# host1 / container-alpha
ALPHA_DIR="$DATA_DIR/host1/container-alpha"
make_workspace "$ALPHA_DIR" "test-host1" "container-alpha" "main"
write_planq "$ALPHA_DIR/plans"
write_session_logs "$ALPHA_DIR/.claude/logs" "container-alpha" "alpha session"

# Create a git worktree of container-alpha for worktree simulation
# Linked worktrees get a .1, .2, etc. suffix (matching the devcontainer naming convention)
ALPHA_WT_DIR="$DATA_DIR/host1/container-alpha.1"
git -C "$ALPHA_DIR" worktree add -q -b "feature/new-thing" "$ALPHA_WT_DIR"
mkdir -p "$ALPHA_WT_DIR/.devcontainer/versions" "$ALPHA_WT_DIR/plans/archive" "$ALPHA_WT_DIR/.claude/logs"
echo "test-host1" > "$ALPHA_WT_DIR/.devcontainer/.sandbox-host-machine"
echo "container-alpha.1" > "$ALPHA_WT_DIR/.devcontainer/.sandbox-project"
cat > "$ALPHA_WT_DIR/plans/planq-order.txt" << 'PLANQ'
unnamed-task: implement the new-thing feature on this branch
PLANQ
write_session_logs "$ALPHA_WT_DIR/.claude/logs" "container-alpha" "alpha-worktree session"

# host2 / container-beta
BETA_DIR="$DATA_DIR/host2/container-beta"
make_workspace "$BETA_DIR" "test-host2" "container-beta" "develop"
write_planq "$BETA_DIR/plans"
write_session_logs "$BETA_DIR/.claude/logs" "container-beta" "beta session"

# Add an extra commit on a feature branch for beta
git -C "$BETA_DIR" checkout -q -b "feature/beta-improvement"
echo "beta improvement" > "$BETA_DIR/improvement.txt"
git -C "$BETA_DIR" add improvement.txt
git -C "$BETA_DIR" commit -q -m "Add beta improvement"

echo "Test data created:"
echo "  $ALPHA_DIR       (host1 / container-alpha, main branch)"
echo "  $ALPHA_WT_DIR    (host1 / container-alpha worktree, feature/new-thing)"
echo "  $BETA_DIR        (host2 / container-beta, feature/beta-improvement)"
