#!/usr/bin/env python3
"""
Container Planq Daemon
Maintains a persistent WebSocket connection to the observability server,
sending heartbeats with git/session state and relaying file read/write
requests from the server to the local workspace.
"""

import json
import os
import re
import subprocess
import sys
import time
import threading
from pathlib import Path

# ── Helpers needed before config ──────────────────────────────────────────────

def _run(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=5, cwd=cwd)
        return r.stdout.strip() if r.returncode == 0 else ''
    except Exception:
        return ''

def _get_machine_hostname():
    # Prefer the file written by setup_git_worktree_on_host.py, which records
    # the actual host machine name regardless of what localEnv:HOSTNAME resolves to
    # (localEnv:HOSTNAME is often empty on macOS or Linux hosts).
    try:
        host_file = Path(os.environ.get('WORKSPACE_PATH', str(Path.cwd()))) / '.devcontainer' / '.sandbox-host-machine'
        if host_file.exists():
            name = host_file.read_text().strip()
            if name:
                return name
    except Exception:
        pass
    return _run(['hostname']) or 'unknown'

# ── Config ────────────────────────────────────────────────────────────────────

SERVER_URL = os.environ.get('OBSERVABILITY_SERVER_URL', 'ws://172.30.0.1:4000/container-heartbeat')
SOURCE_REPO = os.environ.get('SOURCE_REPO', Path.cwd().name)
# WORKSPACE_ROOT is the in-container path used for git and file operations.
# WORKSPACE_HOST_PATH is the host-side path sent to the server for display only.
WORKSPACE_ROOT = Path(os.environ.get('WORKSPACE_PATH', str(Path.cwd())))
WORKSPACE_HOST_PATH = os.environ.get('WORKSPACE_HOST_PATH', str(WORKSPACE_ROOT))
MACHINE_HOSTNAME = os.environ.get('DEVCONTAINER_HOST', '') or _get_machine_hostname()
CONTAINER_HOSTNAME = os.environ.get('HOSTNAME', '')
HEARTBEAT_INTERVAL = int(os.environ.get('OBSERVABILITY_HEARTBEAT_INTERVAL', '15'))

# ── Filename security ─────────────────────────────────────────────────────────

ALLOWED_FILENAME = re.compile(
    r'^(?:planq-order(?:-[A-Za-z0-9._-]+)?\.txt'
    r'|(?:plan|task)-[0-9]+(?:-[a-z0-9-]+)?\.md)$'
)

def _validate_filename(filename: str) -> bool:
    """Return True iff filename is safe to read/write under plans/."""
    if not filename or not ALLOWED_FILENAME.match(filename):
        return False
    if '/' in filename or '\\' in filename or '\x00' in filename:
        return False
    plans_dir = str((WORKSPACE_ROOT / 'plans').resolve())
    target = os.path.realpath(os.path.join(plans_dir, filename))
    # Target must be strictly inside plans_dir (not equal to it, not a sibling)
    if not target.startswith(plans_dir + os.sep):
        return False
    return True

# ── Git helpers ───────────────────────────────────────────────────────────────

def _git_info():
    ws = str(WORKSPACE_ROOT)
    branch = _run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=ws)
    raw_log = _run(['git', 'log', '-1', '--format=%h|||%s'], cwd=ws)
    if '|||' in raw_log:
        commit_hash, commit_msg = raw_log.split('|||', 1)
    else:
        commit_hash, commit_msg = raw_log, ''

    staged_count = len([l for l in _run(['git', 'diff', '--cached', '--name-only'], cwd=ws).splitlines() if l])
    staged_diffstat = _run(['git', 'diff', '--cached', '--stat'], cwd=ws)
    unstaged_count = len([l for l in _run(['git', 'diff', '--name-only'], cwd=ws).splitlines() if l])
    unstaged_diffstat = _run(['git', 'diff', '--stat'], cwd=ws)

    # Determine worktree path
    worktree = ''
    wt_list = _run(['git', 'worktree', 'list', '--porcelain'], cwd=ws)
    lines = wt_list.splitlines()
    workspace_str = str(WORKSPACE_ROOT)
    for i, line in enumerate(lines):
        if line.startswith('worktree ') and line != f'worktree {workspace_str}':
            if any(f'worktree {workspace_str}' == l for l in lines):
                worktree = line.split(' ', 1)[1].strip()
                # Make relative to workspace parent if possible
                try:
                    wt_path = Path(worktree)
                    worktree = str(wt_path.relative_to(WORKSPACE_ROOT.parent))
                except ValueError:
                    pass
            break

    submodules = _git_submodule_info(ws)

    return {
        'git_branch': branch,
        'git_worktree': worktree,
        'git_commit_hash': commit_hash,
        'git_commit_message': commit_msg,
        'git_staged_count': staged_count,
        'git_staged_diffstat': staged_diffstat,
        'git_unstaged_count': unstaged_count,
        'git_unstaged_diffstat': unstaged_diffstat,
        'git_submodules': submodules,
    }


def _git_submodule_info(ws):
    status_out = _run(['git', 'submodule', 'status'], cwd=ws)
    submodules = []
    for line in status_out.splitlines():
        line = line.strip()
        if not line:
            continue
        # Format: [+/-/U/ ] <hash> <path> [(<describe>)]
        parts = line.split()
        if len(parts) < 2:
            continue
        sub_path = parts[1]
        sub_abs = str(Path(ws) / sub_path)

        branch = _run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=sub_abs).strip() or None

        raw_log = _run(['git', 'log', '-1', '--format=%h|||%s'], cwd=sub_abs)
        if '|||' in raw_log:
            commit_hash, commit_msg = raw_log.split('|||', 1)
        else:
            commit_hash, commit_msg = raw_log, ''

        staged_count = len([l for l in _run(['git', 'diff', '--cached', '--name-only'], cwd=sub_abs).splitlines() if l])
        staged_diffstat = _run(['git', 'diff', '--cached', '--stat'], cwd=sub_abs)
        unstaged_count = len([l for l in _run(['git', 'diff', '--name-only'], cwd=sub_abs).splitlines() if l])
        unstaged_diffstat = _run(['git', 'diff', '--stat'], cwd=sub_abs)

        submodules.append({
            'path': sub_path,
            'branch': branch,
            'commit_hash': commit_hash,
            'commit_message': commit_msg,
            'staged_count': staged_count,
            'staged_diffstat': staged_diffstat or None,
            'unstaged_count': unstaged_count,
            'unstaged_diffstat': unstaged_diffstat or None,
        })
    return submodules

def _compute_container_id(source_repo: str, git_worktree: str) -> str:
    """Derive container_id from source_repo + worktree path."""
    if not git_worktree:
        return source_repo
    basename = Path(git_worktree).name
    # If basename already starts with source_repo + '.', use it directly
    if basename.startswith(source_repo + '.'):
        return basename
    return f'{source_repo}.{basename}'

def _active_session_ids() -> list:
    logs_dir = WORKSPACE_ROOT / '.claude' / 'logs'
    if not logs_dir.exists():
        return []
    cutoff = time.time() - 4 * 3600
    ids = []
    for f in logs_dir.glob('*.jsonl'):
        try:
            if f.stat().st_mtime >= cutoff:
                ids.append(f.stem)
        except OSError:
            pass
    return ids


def _running_session_ids() -> list:
    """Find session IDs of currently running claude processes via /proc fd symlinks."""
    logs_dir = WORKSPACE_ROOT / '.claude' / 'logs'
    if not logs_dir.exists():
        return []
    proc = Path('/proc')
    if not proc.exists():
        return []
    running = set()
    try:
        for pid_dir in proc.iterdir():
            if not pid_dir.name.isdigit():
                continue
            try:
                cmdline = (pid_dir / 'cmdline').read_bytes().decode(errors='replace')
                if 'claude' not in cmdline:
                    continue
            except OSError:
                continue
            fd_dir = pid_dir / 'fd'
            try:
                for fd in fd_dir.iterdir():
                    try:
                        target = Path(os.readlink(fd))
                        if target.suffix == '.jsonl' and target.parent == logs_dir:
                            running.add(target.stem)
                    except OSError:
                        pass
            except OSError:
                pass
    except OSError:
        pass
    return list(running)

def _planq_order(container_id: str, source_repo: str, git_worktree: str) -> str:
    """Read the planq-order file for this container."""
    plans_dir = WORKSPACE_ROOT / 'plans'
    # Determine filename
    if git_worktree:
        suffix = container_id.replace(source_repo, '').lstrip('.')
        filename = f'planq-order-{suffix}.txt' if suffix else 'planq-order.txt'
    else:
        filename = 'planq-order.txt'
    planq_file = plans_dir / filename
    if planq_file.exists():
        try:
            return planq_file.read_text()
        except OSError:
            pass
    return ''

# ── File relay handlers ───────────────────────────────────────────────────────

def _handle_file_read(ws, msg: dict):
    filename = msg.get('filename', '')
    request_id = msg.get('request_id', '')
    if not _validate_filename(filename):
        print(f'[planq-daemon] WARNING: rejected file_read for invalid filename: {filename!r}', file=sys.stderr)
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': 'invalid filename', 'content': ''})
        return
    target = WORKSPACE_ROOT / 'plans' / filename
    try:
        content = target.read_text() if target.exists() else ''
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': True, 'filename': filename, 'content': content})
    except OSError as e:
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': str(e), 'content': ''})

def _handle_file_write(ws, msg: dict):
    filename = msg.get('filename', '')
    request_id = msg.get('request_id', '')
    content = msg.get('content', '')
    if not _validate_filename(filename):
        print(f'[planq-daemon] WARNING: rejected file_write for invalid filename: {filename!r}', file=sys.stderr)
        _ws_send(ws, {'type': 'file_write_ack', 'request_id': request_id, 'ok': False, 'error': 'invalid filename'})
        return
    if len(content) > 1_000_000:
        _ws_send(ws, {'type': 'file_write_ack', 'request_id': request_id, 'ok': False, 'error': 'content too large'})
        return
    target = WORKSPACE_ROOT / 'plans' / filename
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        _ws_send(ws, {'type': 'file_write_ack', 'request_id': request_id, 'ok': True})
    except OSError as e:
        _ws_send(ws, {'type': 'file_write_ack', 'request_id': request_id, 'ok': False, 'error': str(e)})

# ── WebSocket helpers ─────────────────────────────────────────────────────────

def _ws_send(ws, data: dict):
    try:
        ws.send(json.dumps(data))
    except Exception as e:
        print(f'[planq-daemon] send error: {e}', file=sys.stderr)

# ── Main connection loop ──────────────────────────────────────────────────────

def _run_connection():
    """Run one WebSocket connection lifecycle. Returns when connection drops."""
    # Try to import websocket-client; fall back to polling if unavailable
    try:
        import websocket
    except ImportError:
        print('[planq-daemon] websocket-client not available; sleeping 60s', file=sys.stderr)
        time.sleep(60)
        return

    connected = threading.Event()
    stop_event = threading.Event()

    def on_open(ws):
        connected.set()
        print('[planq-daemon] connected to server')
        # Send initial heartbeat
        _send_heartbeat(ws)

    def on_message(ws, raw):
        try:
            msg = json.loads(raw)
        except Exception:
            return
        mtype = msg.get('type', '')
        if mtype == 'file_read':
            threading.Thread(target=_handle_file_read, args=(ws, msg), daemon=True).start()
        elif mtype == 'file_write':
            threading.Thread(target=_handle_file_write, args=(ws, msg), daemon=True).start()

    def on_error(ws, error):
        print(f'[planq-daemon] WS error: {error}', file=sys.stderr)

    def on_close(ws, code, msg):
        stop_event.set()
        print(f'[planq-daemon] disconnected (code={code})')

    ws_app = websocket.WebSocketApp(
        SERVER_URL,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    # Run ws_app in background thread
    ws_thread = threading.Thread(target=ws_app.run_forever, kwargs={'ping_interval': 30}, daemon=True)
    ws_thread.start()

    # Wait for connection (up to 10s)
    if not connected.wait(timeout=10):
        ws_app.close()
        return

    # Heartbeat loop
    last_beat = time.time()
    while not stop_event.is_set():
        time.sleep(1)
        if time.time() - last_beat >= HEARTBEAT_INTERVAL:
            _send_heartbeat(ws_app)
            last_beat = time.time()

    ws_app.close()

def _send_heartbeat(ws_app):
    git = _git_info()
    source_repo = SOURCE_REPO
    container_id = _compute_container_id(source_repo, git['git_worktree'])
    planq = _planq_order(container_id, source_repo, git['git_worktree'])
    running_ids = _running_session_ids()
    # Merge running sessions into the active list so the server always sees them
    active_ids = _active_session_ids()
    for sid in running_ids:
        if sid not in active_ids:
            active_ids.append(sid)

    heartbeat = {
        'type': 'heartbeat',
        'source_repo': source_repo,
        'container_id': container_id,
        'machine_hostname': MACHINE_HOSTNAME,
        'container_hostname': CONTAINER_HOSTNAME,
        'workspace_host_path': WORKSPACE_HOST_PATH,
        'planq_order': planq,
        'active_session_ids': active_ids,
        'running_session_ids': running_ids,
        **git,
    }

    try:
        if hasattr(ws_app, 'send'):
            ws_app.send(json.dumps(heartbeat))
        else:
            # websocket.WebSocketApp — send via internal socket
            ws_app.sock and ws_app.sock.send(json.dumps(heartbeat))
    except Exception as e:
        print(f'[planq-daemon] heartbeat send error: {e}', file=sys.stderr)


def main():
    print(f'[planq-daemon] starting — server={SERVER_URL}, repo={SOURCE_REPO}')
    backoff = 5
    while True:
        try:
            _run_connection()
        except Exception as e:
            print(f'[planq-daemon] error: {e}', file=sys.stderr)
        print(f'[planq-daemon] reconnecting in {backoff}s...')
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


if __name__ == '__main__':
    main()
