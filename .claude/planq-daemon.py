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
AUTO_FETCH_ENABLED = os.environ.get('AUTO_FETCH_ENABLED', 'false').lower() == 'true'
AUTO_FETCH_INTERVAL = int(os.environ.get('AUTO_FETCH_INTERVAL', '60'))
AUTO_FETCH_MODE = os.environ.get('AUTO_FETCH_MODE', 'ssh')

_SANDBOX_DIR = Path.home() / '.local' / 'devcontainer-sandbox'
_LOG_FILE = _SANDBOX_DIR / 'logs' / 'planq-daemon.log'
_STATUS_FILE = _SANDBOX_DIR / 'planq' / 'planq-daemon.status'

log = _setup_logging(_LOG_FILE)

# Set by SIGUSR1 to trigger an immediate heartbeat
_immediate_heartbeat = threading.Event()

# DAG frontier hashes last acknowledged by the server; used to send only new commits.
# Protected by _git_known_hashes_lock.
_git_known_hashes: list = []
_git_known_hashes_lock = threading.Lock()

# Per-submodule known hashes: { source_repo -> list[hash] }
_submodule_known_hashes: dict = {}
_submodule_known_hashes_lock = threading.Lock()

def _handle_sigusr1(signum, frame):
    log.debug('Received SIGUSR1 — scheduling immediate heartbeat')
    _immediate_heartbeat.set()

signal.signal(signal.SIGUSR1, _handle_sigusr1)

def _handle_sigterm(signum, frame):
    log.info('Exiting — received SIGTERM')
    _write_status('stopped', 'SIGTERM')
    sys.exit(0)

def _handle_sighup(signum, frame):
    log.info('Exiting — received SIGHUP')
    _write_status('stopped', 'SIGHUP')
    sys.exit(0)

signal.signal(signal.SIGTERM, _handle_sigterm)
signal.signal(signal.SIGHUP, _handle_sighup)

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
    r'|auto-test-response\.txt'
    r'|archive/planq-history\.txt'
    r'|[A-Za-z0-9][A-Za-z0-9._-]*\.md)$'
)

def _validate_filename(filename: str) -> bool:
    """Return True iff filename is safe to read/write under plans/."""
    if not filename or not ALLOWED_FILENAME.match(filename):
        return False
    bare = filename[len('archive/'):] if filename.startswith('archive/') else filename
    if '/' in bare or '\\' in filename or '\x00' in filename:
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

    remote_url = _run(['git', 'remote', 'get-url', 'origin'], cwd=ws)

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
        'git_remote_url': remote_url,
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

def _git_log_for_path(cwd, known=None) -> list:
    """Return commits for a git repo path, excluding already-known hashes."""
    not_args = []
    for h in (known or []):
        not_args.extend(['--not', h])
    raw = _run(
        ['git', 'log', '--all', '--pretty=format:%H|%P|%D|%s', '--date-order', '-n', '200'] + not_args,
        cwd=cwd,
    )
    commits = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split('|', 3)
        if len(parts) < 4:
            continue
        hash_, parents_str, refs_str, subject = parts
        hash_ = hash_.strip()
        if not hash_:
            continue
        parents = [p for p in parents_str.split() if p]
        refs = [r.strip() for r in refs_str.split(',') if r.strip()]
        commits.append({'hash': hash_, 'parents': parents, 'refs': refs, 'subject': subject})
    return commits


def _git_log_for_submodules() -> dict:
    """Return incremental git commits for each submodule, keyed by submodule source_repo."""
    result = {}
    ws = str(WORKSPACE_ROOT)
    submodules = _git_submodule_info(ws)
    with _submodule_known_hashes_lock:
        known_snapshot = dict(_submodule_known_hashes)
    for sub in submodules:
        sub_path = sub.get('path', '')
        if not sub_path:
            continue
        sub_abs = str(WORKSPACE_ROOT / sub_path)
        sub_source_repo = f"{SOURCE_REPO}/{sub_path}"
        known = known_snapshot.get(sub_source_repo, [])
        commits = _git_log_for_path(sub_abs, known)
        if commits:
            result[sub_source_repo] = commits
    return result


def _git_log_incremental() -> list:
    """Return commits reachable from any ref that the server has not yet seen.

    Uses the server-acknowledged frontier hashes (_git_known_hashes) as --not
    arguments so git only walks the new portion of the DAG.
    """
    with _git_known_hashes_lock:
        known = list(_git_known_hashes)
    not_args = []
    for h in known:
        not_args.extend(['--not', h])
    raw = _run(
        ['git', 'log', '--all', '--pretty=format:%H|%P|%D|%s', '--date-order', '-n', '200'] + not_args,
        cwd=WORKSPACE_ROOT,
    )
    commits = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split('|', 3)
        if len(parts) < 4:
            continue
        hash_, parents_str, refs_str, subject = parts
        hash_ = hash_.strip()
        if not hash_:
            continue
        parents = [p for p in parents_str.split() if p]
        refs = [r.strip() for r in refs_str.split(',') if r.strip()]
        commits.append({'hash': hash_, 'parents': parents, 'refs': refs, 'subject': subject})
    return commits


def _interhost_remote_mode() -> str | None:
    """Return mode from .devcontainer/git-interhost-remotes-mode if present, else None."""
    mode_file = WORKSPACE_ROOT / '.devcontainer' / 'git-interhost-remotes-mode'
    try:
        if mode_file.exists():
            return mode_file.read_text().strip() or None
    except OSError:
        pass
    return None


def _http_base_url() -> str:
    """Derive the HTTP base URL from the WebSocket SERVER_URL."""
    from urllib.parse import urlparse
    url = SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://')
    parsed = urlparse(url)
    return f'{parsed.scheme}://{parsed.netloc}'


# Timestamp of last auto-fetch (epoch seconds); protected by lock
_last_auto_fetch_time = 0.0
_last_auto_fetch_lock = threading.Lock()


def _do_auto_fetch():
    """Poll the server for branch updates and fetch from any host with new commits."""
    global _last_auto_fetch_time
    mode = _interhost_remote_mode() or AUTO_FETCH_MODE
    with _last_auto_fetch_lock:
        since_ts = _last_auto_fetch_time
        _last_auto_fetch_time = time.time()

    try:
        import urllib.request
        url = f'{_http_base_url()}/dashboard/git-updates/{SOURCE_REPO}'
        req = urllib.request.urlopen(url, timeout=5)
        updates = json.loads(req.read().decode())
    except Exception as e:
        log.debug('Auto-fetch poll failed: %s', e)
        return

    did_fetch = False
    fetched_origin = False
    for item in updates:
        host = item.get('host', '')
        last_commit_at = item.get('lastCommitAt', 0) / 1000.0
        if host == MACHINE_HOSTNAME:
            continue
        if last_commit_at > since_ts:
            log.info('Auto-fetch: new commits from %s (mode=%s)', host, mode)
            if mode == 'github':
                if not fetched_origin:
                    _run(['git', 'fetch', '--no-auto-gc', 'origin'], cwd=str(WORKSPACE_ROOT))
                    fetched_origin = True
                    did_fetch = True
            else:
                _run(['git', 'fetch', '--no-auto-gc', host], cwd=str(WORKSPACE_ROOT))
                did_fetch = True

    if did_fetch:
        _immediate_heartbeat.set()


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

def _planq_order() -> str:
    """Read the planq-order file for this container."""
    planq_file = WORKSPACE_ROOT / 'plans' / 'planq-order.txt'
    if planq_file.exists():
        try:
            return planq_file.read_text()
        except OSError:
            pass
    return ''

def _planq_history() -> str:
    """Read the planq archive history file."""
    history_file = WORKSPACE_ROOT / 'plans' / 'archive' / 'planq-history.txt'
    if history_file.exists():
        try:
            return history_file.read_text()
        except OSError:
            pass
    return ''

def _auto_test_pending() -> dict | None:
    """Read the auto-test-pending.json file if present."""
    pending_file = WORKSPACE_ROOT / 'plans' / 'auto-test-pending.json'
    if pending_file.exists():
        try:
            import json as _json
            return _json.loads(pending_file.read_text())
        except Exception:
            pass
    return None

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
        elif mtype == 'git_known_hashes':
            with _git_known_hashes_lock:
                global _git_known_hashes
                _git_known_hashes = msg.get('hashes', [])
        elif mtype == 'submodule_git_known_hashes':
            with _submodule_known_hashes_lock:
                global _submodule_known_hashes
                for repo, hashes in msg.get('tips', {}).items():
                    _submodule_known_hashes[repo] = hashes

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
    last_auto_fetch = 0.0
    while not stop_event.is_set():
        time.sleep(1)
        now = time.time()
        if AUTO_FETCH_ENABLED and now - last_auto_fetch >= AUTO_FETCH_INTERVAL:
            last_auto_fetch = now
            threading.Thread(target=_do_auto_fetch, daemon=True).start()
        if _immediate_heartbeat.is_set() or now - last_beat >= HEARTBEAT_INTERVAL:
            _immediate_heartbeat.clear()
            _send_heartbeat(ws_app)
            last_beat = time.time()

    ws_app.close()

def _send_heartbeat(ws_app):
    git = _git_info()
    source_repo = SOURCE_REPO
    container_id = _compute_container_id(source_repo, git['git_worktree'])
    planq = _planq_order()
    history = _planq_history()
    running_ids = _running_session_ids()
    # Merge running sessions into the active list so the server always sees them
    active_ids = _active_session_ids()
    for sid in running_ids:
        if sid not in active_ids:
            active_ids.append(sid)

    auto_test = _auto_test_pending()
    git_commits = _git_log_incremental()
    submodule_commits = _git_log_for_submodules()

    heartbeat = {
        'type': 'heartbeat',
        'source_repo': source_repo,
        'container_id': container_id,
        'machine_hostname': MACHINE_HOSTNAME,
        'container_hostname': CONTAINER_HOSTNAME,
        'workspace_host_path': WORKSPACE_HOST_PATH,
        'planq_order': planq,
        'planq_history': history,
        'auto_test_pending': auto_test,
        'active_session_ids': active_ids,
        'running_session_ids': running_ids,
        'git_commits': git_commits,
        'submodule_commits': submodule_commits,
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
