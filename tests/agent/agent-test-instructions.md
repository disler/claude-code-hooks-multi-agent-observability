# Agent Testing — Observability + Planq-Daemon

This directory provides a self-contained test environment for an LLM agent to drive
functional and interoperability testing of the observability server and planq-daemon,
running entirely within a devcontainer.

## Prerequisites

- `bun` installed (for the observability server)
- Python 3 available (for planq-daemon, ideally the planq venv at
  `~/.local/devcontainer-sandbox/planq-venv/bin/python3`)
- `curl` available

## Quick Start

```bash
cd observability/tests/agent

# 1. Start the test environment (server + 3 planq-daemon instances)
./setup.sh

# 2. Verify the server is responding
curl -s http://127.0.0.1:4100/planq | head -30

# 3. Run your tests (see "Test Scenarios" below)

# 4. Stop everything when done
./teardown.sh
```

## What Gets Started

| Service | Port | Log |
|---|---|---|
| Observability server | 4100 (HTTP + WS) | `test-data/logs/server.log` |
| planq-daemon: container-alpha | — | `test-data/logs/daemon-alpha.log` |
| planq-daemon: container-alpha.feat | — | `test-data/logs/daemon-alpha-wt.log` |
| planq-daemon: container-beta | — | `test-data/logs/daemon-beta.log` |

## Simulated Topology

```
test-host1
  └── container-alpha          (main branch, 3 commits)
  └── container-alpha.feat     (feature/new-thing worktree)
test-host2
  └── container-beta           (feature/beta-improvement branch)
```

Each container has:
- A git repo with a few commits
- A `plans/planq-order.txt` with sample tasks
- A `.claude/logs/` directory with a sample session log

## API Endpoints (Test Server)

```
GET  http://127.0.0.1:4100/planq                        # all containers + tasks
GET  http://127.0.0.1:4100/planq/:containerId           # single container
GET  http://127.0.0.1:4100/planq/:containerId/tasks     # task list
POST http://127.0.0.1:4100/planq/:containerId/tasks     # add a task
PUT  http://127.0.0.1:4100/planq/:containerId/tasks/:id # update a task
GET  http://127.0.0.1:4100/git/:containerId             # git info
WS   ws://127.0.0.1:4100/stream                         # live event stream
WS   ws://127.0.0.1:4100/container-heartbeat            # planq-daemon connects here
```

## Test Scenarios

### 1. Container Discovery
After setup.sh, daemons send heartbeats every 5 seconds. Verify containers appear:
```bash
curl -s http://127.0.0.1:4100/planq | python3 -m json.tool
```
Expect: three container entries with source_repo, machine_hostname, planq_order, git fields.

### 2. Task Queue Synchronisation
Modify a planq-order.txt and verify the server sees the update within ~10 seconds:
```bash
echo "unnamed-task: a new test task" >> test-data/host1/container-alpha/plans/planq-order.txt
sleep 10
curl -s http://127.0.0.1:4100/planq | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('containers', []):
    if 'alpha' in c.get('id', ''):
        for t in c.get('planq_tasks', []):
            print(t.get('description') or t.get('filename'))
"
```

### 3. Dashboard UI (if Playwright available)
The dashboard is built separately but can be tested against the test server.
Point the dashboard at `http://127.0.0.1:4100` and verify:
- Three containers appear (container-alpha, container-alpha.feat, container-beta)
- Each has the correct hostname (test-host1 or test-host2)
- Task queues match the planq-order.txt files
- Git branches/commits are shown correctly

### 4. Adding Tasks via API
```bash
# Get the container ID first
CONTAINER_ID=$(curl -s http://127.0.0.1:4100/planq | python3 -c "
import sys, json
data = json.load(sys.stdin)
containers = data.get('containers', [])
if containers:
    print(containers[0]['id'])
" )

# Add a task
curl -s -X POST "http://127.0.0.1:4100/planq/$CONTAINER_ID/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"task_type":"unnamed-task","description":"test task from agent"}'
```

### 5. Git Commit Tracking
Add a git commit to a test repo and verify it appears in the server:
```bash
echo "change" >> test-data/host1/container-alpha/feature.txt
git -C test-data/host1/container-alpha add feature.txt
git -C test-data/host1/container-alpha commit -m "Test commit from agent test"
sleep 10
curl -s "http://127.0.0.1:4100/git/container-alpha" | python3 -m json.tool | head -30
```

## Resetting

To recreate test data from scratch (e.g. after adding test commits):
```bash
./teardown.sh --clean
./setup.sh
```

Or, to reset data only without restarting services:
```bash
./teardown.sh --clean
./populate-data.sh
# Then restart daemons pointing at the new data
./setup.sh
```

## Source Reporter (Optional)

A `host-source-reporter.py` instance can be added to report host-level devcontainer
data. This is only needed if tests specifically cover host-level status reporting.
To run one per simulated host:

```bash
PYTHON=~/.local/devcontainer-sandbox/planq-venv/bin/python3
REPORTER=/workspace/host-source-reporter.py

# Simulate host1's reporter
env OBSERVABILITY_SERVER_URL=ws://127.0.0.1:4100/container-heartbeat \
    MACHINE_HOSTNAME=test-host1 \
    "$PYTHON" "$REPORTER" &
```
