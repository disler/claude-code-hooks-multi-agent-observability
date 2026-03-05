#!/usr/bin/env python3
"""
Container Planq Daemon
Maintains a persistent WebSocket connection to the observability server,
sending heartbeats with git/session state and relaying file read/write
requests from the server to the local workspace.
"""

import json
import logging
import os
import re
import signal
import subprocess
import sys
import time
import threading
from pathlib import Path

# ── Logging setup ─────────────────────────────────────────────────────────────

def _setup_logging(log_file: Path) -> logging.Logger:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger('planq-daemon')
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter('%(asctime)s %(levelname)s %(message)s',
                            datefmt='%Y-%m-%dT%H:%M:%S')
    # File handler
    fh = logging.FileHandler(log_file)
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    # Stderr handler
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(fmt)
    logger.addHandler(sh)
    return logger

# ── Helpers needed before config ──────────────────────────────────────────────

def _run(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10, cwd=cwd)
        if r.returncode != 0:
            log.debug('_run %s (cwd=%s) rc=%d stderr=%r', cmd[0], cwd, r.returncode, r.stderr[:200])
            return ''
        return r.stdout.strip()
    except subprocess.TimeoutExpired:
        log.warning('_run %s (cwd=%s) timed out', cmd[0], cwd)
        return ''
    except Exception as e:
        log.debug('_run %s (cwd=%s) error: %s', cmd[0], cwd, e)
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
WORKSPACE_ROOT = Path(os.environ.get('WORKSPACE_PATH', '/workspace'))
WORKSPACE_HOST_PATH = os.environ.get('WORKSPACE_HOST_PATH', str(WORKSPACE_ROOT))
MACHINE_HOSTNAME = _get_machine_hostname()
CONTAINER_HOSTNAME = os.environ.get('HOSTNAME', '')
HEARTBEAT_INTERVAL = int(os.environ.get('OBSERVABILITY_HEARTBEAT_INTERVAL', '15'))

_SANDBOX_DIR = Path.home() / '.local' / 'devcontainer-sandbox'
_LOG_FILE = _SANDBOX_DIR / 'logs' / 'planq-daemon.log'
_STATUS_FILE = _SANDBOX_DIR / 'planq' / 'planq-daemon.status'

log = _setup_logging(_LOG_FILE)

# Set by SIGUSR1 to trigger an immediate heartbeat
_immediate_heartbeat = threading.Event()

def _handle_sigusr1(signum, frame):
    log.debug('Received SIGUSR1 — scheduling immediate heartbeat')
    _immediate_heartbeat.set()

signal.signal(signal.SIGUSR1, _handle_sigusr1)

# ── Status file ───────────────────────────────────────────────────────────────

def _write_status(state: str, detail: str = ''):
    """Write current daemon state to the status file."""
    try:
        _STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
        ts = time.strftime('%Y-%m-%dT%H:%M:%S')
        line = f'{ts} {state}'
        if detail:
            line += f' {detail}'
        _STATUS_FILE.write_text(line + '\n')
    except OSError as e:
        log.warning('Could not write status file: %s', e)

# ── Filename security ─────────────────────────────────────────────────────────

ALLOWED_FILENAME = re.compile(
    r'^(?:planq-order(?:-[A-Za-z0-9._-]+)?\.txt'
    r'|[A-Za-z0-9][A-Za-z0-9._-]*\.md)$'
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

    staged_names = [l for l in _run(['git', 'diff', '--cached', '--name-only'], cwd=ws).splitlines() if l]
    staged_count = len(staged_names)
    staged_diffstat = _run(['git', 'diff', '--cached', '--stat'], cwd=ws)
    unstaged_names = [l for l in _run(['git', 'diff', '--name-only'], cwd=ws).splitlines() if l]
    unstaged_count = len(unstaged_names)
    unstaged_diffstat = _run(['git', 'diff', '--stat'], cwd=ws)
    log.debug('git_info cwd=%s branch=%s staged=%d unstaged=%d', ws, branch, staged_count, unstaged_count)

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
        log.warning('Rejected file_read for invalid filename: %r', filename)
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
        log.warning('Rejected file_write for invalid filename: %r', filename)
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

def _handle_file_list(ws, msg: dict):
    """Return sorted list of files in the plans/ directory."""
    request_id = msg.get('request_id', '')
    plans_dir = WORKSPACE_ROOT / 'plans'
    try:
        files = sorted(f.name for f in plans_dir.iterdir()
                       if f.is_file() and not f.name.startswith('.'))
    except OSError:
        files = []
    _ws_send(ws, {'type': 'file_list_response', 'request_id': request_id, 'ok': True, 'files': files})

def _handle_file_write_new(ws, msg: dict):
    """Write to a file, generating a unique name if the target already exists."""
    filename = msg.get('filename', '')
    request_id = msg.get('request_id', '')
    content = msg.get('content', '')
    if not _validate_filename(filename):
        log.warning('Rejected file_write_new for invalid filename: %r', filename)
        _ws_send(ws, {'type': 'file_write_new_ack', 'request_id': request_id, 'ok': False, 'error': 'invalid filename'})
        return
    if len(content) > 1_000_000:
        _ws_send(ws, {'type': 'file_write_new_ack', 'request_id': request_id, 'ok': False, 'error': 'content too large'})
        return
    plans_dir = WORKSPACE_ROOT / 'plans'
    stem = Path(filename).stem
    ext = Path(filename).suffix or '.md'
    actual = filename
    counter = 1
    while (plans_dir / actual).exists():
        actual = f'{stem}-{counter}{ext}'
        counter += 1
        if counter > 99:
            _ws_send(ws, {'type': 'file_write_new_ack', 'request_id': request_id, 'ok': False, 'error': 'too many name conflicts'})
            return
    target = plans_dir / actual
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        _ws_send(ws, {'type': 'file_write_new_ack', 'request_id': request_id, 'ok': True, 'filename': actual})
    except OSError as e:
        _ws_send(ws, {'type': 'file_write_new_ack', 'request_id': request_id, 'ok': False, 'error': str(e)})

# ── WebSocket helpers ─────────────────────────────────────────────────────────

def _ws_send(ws, data: dict):
    try:
        ws.send(json.dumps(data))
    except Exception as e:
        log.error('Send error: %s', e)

# ── Main connection loop ──────────────────────────────────────────────────────

def _run_connection():
    """Run one WebSocket connection lifecycle. Returns when connection drops."""
    # Try to import websocket-client; fall back to polling if unavailable
    try:
        import websocket
    except ImportError:
        log.warning('websocket-client not available; sleeping 60s')
        _write_status('disconnected', 'websocket-client not available')
        time.sleep(60)
        return

    connected = threading.Event()
    stop_event = threading.Event()
    close_reason = {'code': None, 'msg': None}

    def on_open(ws):
        connected.set()
        log.info('Connected to server %s', SERVER_URL)
        _write_status('connected', SERVER_URL)
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
        elif mtype == 'file_list':
            threading.Thread(target=_handle_file_list, args=(ws, msg), daemon=True).start()
        elif mtype == 'file_write_new':
            threading.Thread(target=_handle_file_write_new, args=(ws, msg), daemon=True).start()

    def on_error(ws, error):
        log.error('WebSocket error: %s', error)

    def on_close(ws, code, msg):
        close_reason['code'] = code
        close_reason['msg'] = msg
        stop_event.set()
        log.info('Disconnected (code=%s)', code)
        _write_status('disconnected', f'code={code}')

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
        log.warning('Connection timed out after 10s')
        _write_status('disconnected', 'connection timeout')
        ws_app.close()
        return

    # Heartbeat loop
    last_beat = time.time()
    while not stop_event.is_set():
        time.sleep(1)
        if _immediate_heartbeat.is_set() or time.time() - last_beat >= HEARTBEAT_INTERVAL:
            _immediate_heartbeat.clear()
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
        log.error('Heartbeat send error: %s', e)


def main():
    log.info('Starting — server=%s, repo=%s', SERVER_URL, SOURCE_REPO)
    _write_status('starting')
    backoff = 5
    try:
        while True:
            t_start = time.time()
            try:
                _run_connection()
            except Exception as e:
                log.error('Connection error: %s', e)
                _write_status('disconnected', str(e))
            # Reset backoff if the connection lasted long enough to be considered successful
            if time.time() - t_start >= HEARTBEAT_INTERVAL:
                backoff = 5
            log.info('Reconnecting in %ds...', backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
    except KeyboardInterrupt:
        log.info('Exiting — received KeyboardInterrupt')
        _write_status('stopped', 'KeyboardInterrupt')
        sys.exit(0)
    except SystemExit as e:
        log.info('Exiting — SystemExit(%s)', e.code)
        _write_status('stopped', f'SystemExit({e.code})')
        raise
    except Exception as e:
        log.critical('Exiting — unhandled exception: %s', e, exc_info=True)
        _write_status('stopped', f'error: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
