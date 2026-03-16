#!/usr/bin/env python3
"""
Container Planq Daemon
Maintains a persistent WebSocket connection to the observability server,
sending heartbeats with git/session state and relaying file read/write
requests from the server to the local workspace.
"""

import itertools
import json
import logging
import os
import queue
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
    # Stderr handler — only when stderr is a terminal; when launched by
    # planq-daemon.sh stderr is redirected to the same log file, so adding
    # this handler would write every line twice.
    if sys.stderr.isatty():
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

def _looks_like_container_id(name: str) -> bool:
    """Return True if name looks like a Docker container ID (short hex hash).
    Container IDs are typically 12 lowercase hex characters and should never
    be used as the machine hostname."""
    import re
    return bool(re.fullmatch(r'[0-9a-f]{12}', name))

def _get_machine_hostname():
    # Prefer the file written by setup_git_worktree_on_host.py, which records
    # the actual host machine name regardless of what localEnv:HOSTNAME resolves to
    # (localEnv:HOSTNAME is often empty on macOS or Linux hosts).
    try:
        host_file = Path(os.environ.get('WORKSPACE_PATH', '/workspace')) / '.devcontainer' / '.sandbox-host-machine'
        if host_file.exists():
            name = host_file.read_text().strip()
            if name:
                return name
    except Exception:
        pass
    name = _run(['hostname']) or ''
    # Reject container IDs — if hostname returned a Docker container ID, it is
    # the container name, not the machine name.  Fall back to 'unknown' so the
    # server does not group this container under a meaningless hex ID.
    if name and not _looks_like_container_id(name):
        return name
    return 'unknown'

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

def _read_version_stamp(category: str) -> str | None:
    """Read a version stamp from .devcontainer/versions/<category>."""
    if not WORKSPACE_ROOT:
        return None
    stamp_file = os.path.join(WORKSPACE_ROOT, '.devcontainer', 'versions', category)
    try:
        with open(stamp_file) as f:
            return f.read().strip()
    except OSError:
        return None

_SANDBOX_DIR = Path.home() / '.local' / 'devcontainer-sandbox'
_LOG_FILE = _SANDBOX_DIR / 'logs' / 'planq-daemon.log'
_STATUS_FILE = _SANDBOX_DIR / 'planq' / 'planq-daemon.status'

log = _setup_logging(_LOG_FILE)

# Capture the planq-daemon stamp hash at startup — this identifies the version this
# running process was loaded from.  After apply-daemon copies a new file, the stamp
# on disk will differ from this value, signalling that a restart is needed.
def _startup_daemon_stamp() -> str | None:
    stamp = _read_version_stamp('planq-daemon')
    if not stamp:
        return None
    return stamp.split()[0]  # extract hash from "<hash> <ts> planq-daemon"

DAEMON_RUNNING_STAMP: str | None = _startup_daemon_stamp()

# Set by SIGUSR1 to trigger an immediate heartbeat
_immediate_heartbeat = threading.Event()
_restart_requested = threading.Event()  # set by on_message('restart'); handled in main loop

# DAG frontier hashes last acknowledged by the server; used to send only new commits.
# Protected by _git_known_hashes_lock.
_git_known_hashes: list = []
_git_known_hashes_lock = threading.Lock()

# ── Plans file watcher state ───────────────────────────────────────────────────
# filename (relative to plans/) → last reported mtime float
_plans_file_mtimes: dict = {}
_plans_file_mtimes_lock = threading.Lock()
# Pending debounce timer for triggering an immediate heartbeat on file changes
_plans_watcher_debounce: threading.Timer | None = None
_plans_watcher_debounce_lock = threading.Lock()

# Per-submodule known hashes: { source_repo -> list[hash] }
_submodule_known_hashes: dict = {}
_submodule_known_hashes_lock = threading.Lock()

# Last HEAD hash seen per repo, used to annotate new commits with running sessions.
# { source_repo -> str }  (no lock needed — only written/read from heartbeat thread)
_last_known_head: dict = {}

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

def _filter_valid_hashes(hashes, cwd):
    """Return only hashes that actually exist in the git repo at cwd."""
    if not hashes:
        return []
    try:
        r = subprocess.run(
            ['git', 'cat-file', '--batch-check'],
            input='\n'.join(hashes), capture_output=True, text=True, timeout=5, cwd=cwd,
        )
        if r.returncode != 0:
            return []
        valid = []
        for line in r.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[1] != 'missing':
                valid.append(parts[0])
        return valid
    except Exception:
        return []


def _parse_git_log_line(line: str) -> dict | None:
    """Parse a single line from --pretty=format:%H|%P|%D|%s|%an|%at."""
    if not line.strip():
        return None
    parts = line.split('|')
    if len(parts) < 4:
        return None
    hash_ = parts[0].strip()
    if not hash_:
        return None
    parents_str = parts[1]
    refs_str = parts[2]
    # Author name is second-to-last, author timestamp is last
    # Subject is everything between refs and author name (may contain '|')
    author_ts_str = parts[-1].strip()
    author_name = parts[-2].strip() if len(parts) >= 6 else ''
    subject_parts = parts[3:len(parts) - 2] if len(parts) >= 6 else parts[3:]
    subject = '|'.join(subject_parts)
    parents = [p for p in parents_str.split() if p]
    refs = [r.strip() for r in refs_str.split(',') if r.strip()]
    author_date = int(author_ts_str) if author_ts_str.isdigit() else None
    commit: dict = {'hash': hash_, 'parents': parents, 'refs': refs, 'subject': subject}
    if author_name:
        commit['author'] = author_name
    if author_date:
        commit['author_date'] = author_date
    return commit


def _git_diffstats(cwd: str, not_args: list) -> dict:
    """Return {hash: diffstat_string} for new commits.

    Runs git log --stat once with a COMMIT_SEP=%H sentinel so each commit's
    file-change summary can be extracted without per-commit subprocesses.
    """
    raw = _run(
        ['git', 'log', '--all', '--pretty=tformat:COMMIT_SEP=%H', '--stat',
         '--date-order', '-n', '200'] + not_args,
        cwd=cwd,
    )
    result: dict = {}
    current_hash: str | None = None
    stat_lines: list = []
    for line in raw.splitlines():
        if line.startswith('COMMIT_SEP='):
            if current_hash is not None:
                stat = '\n'.join(stat_lines).strip()
                if stat:
                    result[current_hash] = stat
            current_hash = line[len('COMMIT_SEP='):].strip()
            stat_lines = []
        elif current_hash is not None and line.strip():
            stat_lines.append(line)
    if current_hash is not None:
        stat = '\n'.join(stat_lines).strip()
        if stat:
            result[current_hash] = stat
    return result


def _git_log_bodies(cwd: str, not_args: list) -> dict:
    """Return {hash: body} for commits not covered by not_args.

    Uses git log -z with --format=%H%n%B so each NUL-terminated record is
    'hash\\nbody'.  The body is the full commit message (subject + blank +
    body paragraphs) as returned by %B.
    """
    raw = _run(
        ['git', 'log', '--all', '-z', '--format=%H%n%B', '--date-order', '-n', '200'] + not_args,
        cwd=cwd,
    )
    bodies: dict = {}
    for record in raw.split('\0'):
        record = record.strip('\n')
        if not record.strip():
            continue
        nl = record.find('\n')
        if nl < 0:
            bodies[record.strip()] = ''
        else:
            hash_ = record[:nl].strip()
            body = record[nl + 1:]
            if hash_:
                bodies[hash_] = body
    return bodies


def _git_log_for_path(cwd, known=None) -> list:
    """Return commits for a git repo path, excluding already-known hashes."""
    not_args = []
    for h in _filter_valid_hashes(known or [], cwd):
        not_args.extend(['--not', h])
    raw = _run(
        ['git', 'log', '--all', '--pretty=format:%H|%P|%D|%s|%an|%at', '--date-order', '-n', '200'] + not_args,
        cwd=cwd,
    )
    commits = []
    for line in raw.splitlines():
        commit = _parse_git_log_line(line)
        if commit:
            commits.append(commit)
    bodies = _git_log_bodies(cwd, not_args)
    diffstats = _git_diffstats(cwd, not_args)
    for c in commits:
        body = bodies.get(c['hash'], '')
        if body.strip():
            c['body'] = body
        diffstat = diffstats.get(c['hash'], '')
        if diffstat:
            c['diffstat'] = diffstat
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

    Additionally, always re-fetches the known tip commits with --no-walk so
    that ref decorations (e.g. origin/branch after a push) stay current even
    when no new commits exist.  The server upserts with refs = excluded.refs,
    so stale remote-tracking refs get updated without affecting body/diffstat.
    """
    with _git_known_hashes_lock:
        known = list(_git_known_hashes)
    not_args = []
    valid_known = _filter_valid_hashes(known, WORKSPACE_ROOT)
    for h in valid_known:
        not_args.extend(['--not', h])
    raw = _run(
        ['git', 'log', '--all', '--pretty=format:%H|%P|%D|%s|%an|%at', '--date-order', '-n', '200'] + not_args,
        cwd=WORKSPACE_ROOT,
    )
    commits = []
    for line in raw.splitlines():
        commit = _parse_git_log_line(line)
        if commit:
            commits.append(commit)
    bodies = _git_log_bodies(str(WORKSPACE_ROOT), not_args)
    diffstats = _git_diffstats(str(WORKSPACE_ROOT), not_args)
    for c in commits:
        body = bodies.get(c['hash'], '')
        if body.strip():
            c['body'] = body
        diffstat = diffstats.get(c['hash'], '')
        if diffstat:
            c['diffstat'] = diffstat

    # Re-fetch known tip commits with current decorators to keep remote-tracking
    # refs fresh after push/fetch (no body/diffstat needed — server preserves existing).
    if valid_known:
        seen = {c['hash'] for c in commits}
        tip_raw = _run(
            ['git', 'log', '--no-walk'] + valid_known +
            ['--pretty=format:%H|%P|%D|%s|%an|%at'],
            cwd=WORKSPACE_ROOT,
        )
        for line in tip_raw.splitlines():
            tip = _parse_git_log_line(line)
            if tip and tip['hash'] not in seen:
                commits.append(tip)
                seen.add(tip['hash'])

    return commits


def _annotate_commits_with_sessions(commits: list, repo_key: str, running_sessions: list) -> list:
    """Attach session_ids to commits that are new since last heartbeat.

    Commits are in reverse-chronological order (newest first).  We compare the
    newest commit hash against _last_known_head[repo_key].  Commits that appear
    before the last-known HEAD are considered new and get the running sessions
    attached; others (re-fetched tip refreshes) get an empty list.
    After processing, update _last_known_head to the newest commit hash.
    """
    global _last_known_head
    prev_head = _last_known_head.get(repo_key)
    result = []
    for c in commits:
        annotated = dict(c)
        # A commit is "new" if we haven't seen it as the HEAD before.
        # We stop marking new once we hit the previous head.
        if prev_head is None or c['hash'] != prev_head:
            annotated['session_ids'] = running_sessions
        else:
            annotated['session_ids'] = []
        result.append(annotated)
    if commits:
        _last_known_head[repo_key] = commits[0]['hash']  # newest first
    return result


def _http_base_url() -> str:
    """Derive the HTTP base URL from the WebSocket SERVER_URL."""
    from urllib.parse import urlparse
    url = SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://')
    parsed = urlparse(url)
    return f'{parsed.scheme}://{parsed.netloc}'


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

def _review_state() -> dict | None:
    """Read .claude/review-state for this worktree."""
    ws = str(WORKSPACE_ROOT)
    if not ws:
        return None
    state_file = os.path.join(ws, '.claude', 'review-state')
    try:
        with open(state_file) as f:
            content = f.read()
        data = {}
        for line in content.splitlines():
            if ':' in line:
                k, _, v = line.partition(':')
                data[k.strip()] = v.strip()
        return data if data else None
    except OSError:
        return None

def _test_results() -> list:
    """Read test results from .claude/test-results/."""
    results_dir = os.path.join(str(WORKSPACE_ROOT), '.claude', 'test-results')
    results = []
    if not os.path.isdir(results_dir):
        return results
    for fname in sorted(os.listdir(results_dir)):
        if not fname.endswith('.json'):
            continue
        try:
            with open(os.path.join(results_dir, fname)) as f:
                results.append(json.load(f))
        except Exception:
            pass
    return results

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
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': True, 'filename': filename, 'content': content}, _PRIO_RELAY)
    except OSError as e:
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': str(e), 'content': ''})

def _handle_session_log_read(ws, msg: dict):
    """Read a chunk of a Claude session JSONL from $CLAUDE_CONFIG_DIR/projects/.

    Supports chunked reading via line_offset and limit:
      line_offset  first line to return (0-based, default 0)
      limit        max lines to return (default 1000, capped at 5000)

    Response extras: line_offset, line_count, total_lines.
    """
    session_id = msg.get('session_id', '')
    request_id = msg.get('request_id', '')
    line_offset = max(0, int(msg.get('line_offset', 0)))
    limit = min(max(1, int(msg.get('limit', 1000))), 5000)
    log.info('[session_log_read] request session=%s offset=%d limit=%d', session_id[:8], line_offset, limit)
    if not session_id or not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': 'invalid session_id', 'content': ''})
        return
    claude_config_dir = Path(os.environ.get('CLAUDE_CONFIG_DIR', '/home/node/.claude'))
    projects_dir = claude_config_dir / 'projects'
    try:
        found = None
        if projects_dir.is_dir():
            for proj_dir in projects_dir.iterdir():
                if proj_dir.is_dir():
                    candidate = proj_dir / f'{session_id}.jsonl'
                    if candidate.exists():
                        found = candidate
                        break
        if found:
            lines = found.read_text().splitlines(keepends=True)
            total_lines = len(lines)
            chunk = lines[line_offset:line_offset + limit]
            log.info('[session_log_read] sending %d lines (total=%d) for session=%s', len(chunk), total_lines, session_id[:8])
            _ws_send(ws, {
                'type': 'file_read_response',
                'request_id': request_id,
                'ok': True,
                'content': ''.join(chunk),
                'line_offset': line_offset,
                'line_count': len(chunk),
                'total_lines': total_lines,
            }, _PRIO_RELAY)
        else:
            log.info('[session_log_read] session not found: %s', session_id[:8])
            _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': 'session log not found', 'content': ''})
    except OSError as e:
        _ws_send(ws, {'type': 'file_read_response', 'request_id': request_id, 'ok': False, 'error': str(e), 'content': ''})

def _find_session_log(session_id: str):
    """Return Path to the session JSONL file, or None if not found."""
    claude_config_dir = Path(os.environ.get('CLAUDE_CONFIG_DIR', '/home/node/.claude'))
    # Check .claude/logs/ first (hook-generated logs live here)
    logs_dir = WORKSPACE_ROOT / '.claude' / 'logs'
    candidate = logs_dir / f'{session_id}.jsonl'
    if candidate.exists():
        return candidate
    # Fall back to ~/.claude/projects/*/session_id.jsonl
    projects_dir = claude_config_dir / 'projects'
    if projects_dir.is_dir():
        for proj_dir in projects_dir.iterdir():
            if proj_dir.is_dir():
                candidate = proj_dir / f'{session_id}.jsonl'
                if candidate.exists():
                    return candidate
    return None

# session_id → total_lines the server already has (from session_log_ack)
_server_session_log_lines: dict = {}
_server_session_log_lines_lock = threading.Lock()

# session_id → compaction_seq (incremented each time we detect the local file was truncated)
_session_compaction_seq: dict = {}
_session_compaction_seq_lock = threading.Lock()

_SESSION_LOG_CHUNK_BYTES = 1_000_000  # max bytes per session_log_push packet


def _push_session_log(ws_app, session_id: str, from_line: int = 0, compaction_seq: int = 0):
    """Push session JSONL content to the server from from_line onwards.

    Splits the content into packets of at most _SESSION_LOG_CHUNK_BYTES each.
    Each packet contains only complete JSONL lines; a single line that exceeds
    the chunk size is allowed to push that packet over the limit rather than
    split mid-line.  line_count is included so the server can update its
    received-lines counter without re-parsing the content.
    """
    found = _find_session_log(session_id)
    if not found:
        return
    try:
        content_bytes = found.read_bytes()
        lines = content_bytes.decode(errors='replace').splitlines(keepends=True)
        total_lines = len(lines)
        if from_line >= total_lines:
            return  # Nothing new

        n_chunks = 0
        send_from = from_line
        log.info('[session_log_push] starting session=%s from_line=%d total_lines=%d file=%s',
                 session_id[:8], from_line, total_lines, found.name)
        while send_from < total_lines:
            chunk: list[str] = []
            chunk_bytes = 0
            i = send_from
            while i < total_lines:
                line = lines[i]
                line_bytes = len(line.encode())
                # Always include at least one line even if it alone exceeds the limit
                if chunk_bytes + line_bytes > _SESSION_LOG_CHUNK_BYTES and chunk:
                    break
                chunk.append(line)
                chunk_bytes += line_bytes
                i += 1

            is_last = (i >= total_lines)
            _ws_send(ws_app, {
                'type': 'session_log_push',
                'session_id': session_id,
                'line_offset': send_from,
                'line_count': len(chunk),
                'content': ''.join(chunk),
                'total_lines': total_lines,
                'is_complete': is_last,
                'compaction_seq': compaction_seq,
            }, _PRIO_DATA)
            n_chunks += 1
            send_from = i
        log.info('[session_log_push] queued %d chunk(s) for session=%s (%d lines)',
                 n_chunks, session_id[:8], total_lines - from_line)
    except OSError as e:
        log.warning('[session_log_push] failed for session=%s: %s', session_id[:8], e)

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

# ── Outbound send queue ───────────────────────────────────────────────────────
# Priority constants: lower value = higher priority.
_PRIO_CONTROL = 0  # heartbeats, acks — must not be delayed
_PRIO_RELAY   = 1  # relay responses (file/session_log reads) — server has live request waiting
_PRIO_DATA    = 2  # background pushes (session log chunks) — potentially large

# Per-connection enqueue function; replaced at on_open, cleared at on_close.
# Signature: _ws_enqueue(serialized: str, priority: int) -> None
_ws_enqueue: 'threading.local | None' = None

def _ws_send(ws, data: dict, priority: int = _PRIO_CONTROL):
    """Serialise data and hand it to the per-connection send queue."""
    serialized = json.dumps(data)
    if _ws_enqueue is not None:
        _ws_enqueue(serialized, priority)
    else:
        # Queue not yet initialised (very early send); fall back to direct send.
        try:
            ws.send(serialized)
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
    _conn: dict = {}  # shared mutable state for on_open / on_close closures

    def on_open(ws):
        global _ws_enqueue
        connected.set()
        log.info('Connected to server %s', SERVER_URL)
        _write_status('connected', SERVER_URL)

        # Set up a priority send queue for this connection.
        # The sender thread is the only caller of ws.send(), eliminating races.
        send_queue: queue.PriorityQueue = queue.PriorityQueue()
        _conn['send_queue'] = send_queue
        seq = itertools.count()

        def _enqueue(serialized: str, priority: int) -> None:
            send_queue.put((priority, next(seq), serialized))

        _ws_enqueue = _enqueue

        def _sender():
            while True:
                item = send_queue.get()
                if item is None:
                    break  # sentinel: connection closed
                _, _, serialized = item
                try:
                    ws.send(serialized)
                except Exception as e:
                    log.error('Send error: %s', e)

        threading.Thread(target=_sender, daemon=True).start()

        # Force a full plans-files push on (re)connect so a restarted server
        # always gets the complete file list rather than only changed files.
        with _plans_file_mtimes_lock:
            _plans_file_mtimes.clear()
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
        elif mtype == 'session_log_read':
            threading.Thread(target=_handle_session_log_read, args=(ws, msg), daemon=True).start()
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
        elif mtype == 'request_heartbeat':
            threading.Thread(target=_send_heartbeat, args=(ws,), daemon=True).start()
        elif mtype == 'apply_changes':
            changes = msg.get('changes', [])
            threading.Thread(target=_apply_changes, args=(ws, changes), daemon=True).start()
        elif mtype == 'session_log_ack':
            # Server tells us what it has; update our record and push any idle sessions
            # that the server hasn't fully cached yet.
            sessions = msg.get('sessions', {})
            with _server_session_log_lines_lock:
                _server_session_log_lines.update(sessions)
            # Push idle (non-running) sessions not fully cached by the server
            running_now = set(_running_session_ids())
            active_ids = _active_session_ids()
            for sid in active_ids:
                if sid in running_now:
                    continue  # still running, will push when idle
                server_lines = sessions.get(sid, 0)
                found = _find_session_log(sid)
                if not found:
                    continue
                try:
                    total = len(found.read_bytes().decode(errors='replace').splitlines())
                except OSError:
                    continue
                if total > server_lines:
                    with _session_compaction_seq_lock:
                        seq = _session_compaction_seq.get(sid, 0)
                    threading.Thread(target=_push_session_log, args=(ws, sid, server_lines, seq), daemon=True).start()
                elif total < server_lines and total > 0:
                    # File was truncated — session was compacted or cleared.
                    # Increment compaction_seq and push from 0 so the server
                    # appends the new post-compaction content to its stored file.
                    with _session_compaction_seq_lock:
                        _session_compaction_seq[sid] = _session_compaction_seq.get(sid, 0) + 1
                        seq = _session_compaction_seq[sid]
                    with _server_session_log_lines_lock:
                        _server_session_log_lines[sid] = 0
                    log.info('[session_log_ack] compaction detected for session=%s (file=%d < server=%d) seq=%d',
                             sid[:8], total, server_lines, seq)
                    threading.Thread(target=_push_session_log, args=(ws, sid, 0, seq), daemon=True).start()
        elif mtype == 'session_log_resend':
            # Server asks us to re-send a session from a given line
            sid = msg.get('session_id', '')
            from_line = int(msg.get('from_line', 0))
            if sid:
                with _session_compaction_seq_lock:
                    seq = _session_compaction_seq.get(sid, 0)
                threading.Thread(target=_push_session_log, args=(ws, sid, from_line, seq), daemon=True).start()
        elif mtype == 'restart':
            log.info('Received restart request from server — signalling main thread to restart')
            _restart_requested.set()

    def on_error(ws, error):
        log.error('WebSocket error: %s', error)

    def on_close(ws, code, msg):
        global _ws_enqueue
        close_reason['code'] = code
        close_reason['msg'] = msg
        _ws_enqueue = None
        sq = _conn.get('send_queue')
        if sq is not None:
            sq.put(None)  # sentinel: stop sender thread
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
    _prev_running_ids: set = set()
    while not stop_event.is_set():
        if _restart_requested.is_set():
            _restart_requested.clear()
            log.info('Restarting daemon (execv) from main thread')
            try:
                ws_app.close()
            except Exception:
                pass
            try:
                os.execv(sys.executable, [sys.executable] + sys.argv)
            except Exception as e:
                log.error('os.execv failed: %s — continuing', e)
        time.sleep(1)
        now = time.time()
        if _immediate_heartbeat.is_set() or now - last_beat >= HEARTBEAT_INTERVAL:
            _immediate_heartbeat.clear()
            _send_heartbeat(ws_app)
            last_beat = time.time()
            # Detect sessions that just became idle (were running, now not) and push their logs
            current_running = set(_running_session_ids())
            newly_idle = _prev_running_ids - current_running
            for sid in newly_idle:
                with _server_session_log_lines_lock:
                    from_line = _server_session_log_lines.get(sid, 0)
                with _session_compaction_seq_lock:
                    seq = _session_compaction_seq.get(sid, 0)
                threading.Thread(target=_push_session_log, args=(ws_app, sid, from_line, seq), daemon=True).start()
            _prev_running_ids = current_running

    ws_app.close()

# ── Dashboard change application ─────────────────────────────────────────────

_planq_file_lock = threading.Lock()

_STATUS_PREFIX_MAP = {
    'done': '# done: ',
    'underway': '# underway: ',
    'auto-queue': '# auto-queue: ',
    'awaiting-commit': '# awaiting-commit: ',
    'awaiting-plan': '# awaiting-plan: ',
    'deferred': '# deferred: ',
    'pending': '',
}
_STATUS_PREFIXES = tuple(v for v in _STATUS_PREFIX_MAP.values() if v)


def _strip_status_prefix(line: str) -> str:
    """Remove leading status comment prefix from a planq-order line."""
    s = line.strip()
    for pfx in _STATUS_PREFIXES:
        if s.startswith(pfx):
            return s[len(pfx):]
    return s


import re as _re

def _strip_depth_prefix(s: str) -> tuple[int, str]:
    """Strip the optional depth prefix '(  )*- ' from a string (after status prefix removed).
    Returns (depth, rest) where depth >= 1 if a prefix was found, else 0."""
    m = _re.match(r'^((?:  )*)- (.*)', s)
    if m:
        depth = len(m.group(1)) // 2 + 1
        return depth, m.group(2)
    return 0, s


def _task_key_from_line(line: str) -> str | None:
    """Extract the canonical task key (filename or description) from a planq-order line."""
    after_status = _strip_status_prefix(line)
    if after_status.startswith('#') or not after_status:
        return None
    # Strip depth prefix (e.g. "- " or "  - ") before parsing task type
    _depth, raw = _strip_depth_prefix(after_status)
    colon = raw.find(':')
    if colon < 0:
        return None
    task_type = raw[:colon].strip()
    value = raw[colon + 1:].strip()
    valid_types = {
        'task', 'plan', 'make-plan', 'investigate', 'manual-test',
        'manual-commit', 'manual-task', 'unnamed-task', 'auto-test', 'auto-commit', 'agent-test',
    }
    if task_type not in valid_types:
        return None
    # Strip flags in the same order as parsePlanqOrder on the server
    for flag in (' +auto-queue-plan', ' +add-after', ' +add-end',
                 ' +auto-commit', ' +stage-commit', ' +manual-commit'):
        if value.endswith(flag):
            value = value[:-len(flag)]
    return value.strip() or None


def _planq_file_path() -> 'Path':
    return WORKSPACE_ROOT / 'plans' / 'planq-order.txt'


def _read_planq_lines() -> list[str]:
    p = _planq_file_path()
    if not p.exists():
        return []
    return p.read_text(errors='replace').splitlines(keepends=True)


def _write_planq_lines(lines: list[str]) -> None:
    p = _planq_file_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    text = ''.join(lines)
    if text and not text.endswith('\n'):
        text += '\n'
    tmp = p.with_suffix('.tmp')
    tmp.write_text(text)
    tmp.rename(p)


def _apply_update_status(task_key: str, new_status: str) -> None:
    prefix = _STATUS_PREFIX_MAP.get(new_status, '')
    with _planq_file_lock:
        lines = _read_planq_lines()
        new_lines = []
        for line in lines:
            if _task_key_from_line(line) == task_key:
                raw = _strip_status_prefix(line).rstrip('\n')
                new_lines.append(prefix + raw + '\n')
            else:
                new_lines.append(line)
        _write_planq_lines(new_lines)


def _apply_update_commit_mode(task_key: str, new_mode: str) -> None:
    flag_map = {'auto': ' +auto-commit', 'stage': ' +stage-commit', 'manual': ' +manual-commit', 'none': ''}
    with _planq_file_lock:
        lines = _read_planq_lines()
        new_lines = []
        for line in lines:
            if _task_key_from_line(line) == task_key:
                stripped = line.strip()
                status_prefix = ''
                for pfx in _STATUS_PREFIXES:
                    if stripped.startswith(pfx):
                        status_prefix = pfx
                        stripped = stripped[len(pfx):]
                        break
                # Strip existing commit mode flags
                for flag in (' +auto-commit', ' +stage-commit', ' +manual-commit'):
                    stripped = stripped.replace(flag, '')
                stripped = stripped.rstrip()
                new_flag = flag_map.get(new_mode, '')
                new_lines.append(status_prefix + stripped + new_flag + '\n')
            else:
                new_lines.append(line)
        _write_planq_lines(new_lines)


def _apply_update_description(task_key: str, new_desc: str) -> None:
    """For description-only tasks (unnamed-task, etc.), update the value part."""
    with _planq_file_lock:
        lines = _read_planq_lines()
        new_lines = []
        for line in lines:
            if _task_key_from_line(line) == task_key:
                stripped = line.strip()
                status_prefix = ''
                for pfx in _STATUS_PREFIXES:
                    if stripped.startswith(pfx):
                        status_prefix = pfx
                        stripped = stripped[len(pfx):]
                        break
                colon = stripped.find(':')
                if colon >= 0:
                    task_type = stripped[:colon + 1]
                    rest = stripped[colon + 1:].strip()
                    # Preserve flags after the description
                    flags = ''
                    for flag in (' +auto-commit', ' +stage-commit', ' +manual-commit'):
                        if flag in rest:
                            flags += flag
                    new_lines.append(status_prefix + task_type + ' ' + new_desc + flags + '\n')
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
        _write_planq_lines(new_lines)


def _apply_delete_task(task_key: str) -> None:
    with _planq_file_lock:
        lines = _read_planq_lines()
        new_lines = [line for line in lines if _task_key_from_line(line) != task_key]
        _write_planq_lines(new_lines)


def _apply_reorder(order: list) -> None:
    with _planq_file_lock:
        lines = _read_planq_lines()
        key_to_line: dict = {}
        for line in lines:
            key = _task_key_from_line(line)
            if key:
                key_to_line[key] = line
        new_lines = []
        seen = set()
        for key in order:
            if key in key_to_line and key not in seen:
                new_lines.append(key_to_line[key])
                seen.add(key)
        # Append any tasks not covered by the order (defensive)
        for key, line in key_to_line.items():
            if key not in seen:
                new_lines.append(line)
        _write_planq_lines(new_lines)


def _apply_add_task(payload: dict) -> None:
    task_type = payload.get('task_type', '')
    filename = payload.get('filename')
    description = payload.get('description')
    status = payload.get('status', 'pending')
    commit_mode = payload.get('commit_mode', 'none')
    plan_disposition = payload.get('plan_disposition', 'manual')
    auto_queue_plan = payload.get('auto_queue_plan', False)
    parent_task_key = payload.get('parent_task_key')

    value = filename if filename else (description or '')
    if task_type == 'make-plan':
        if plan_disposition == 'add-after':
            value += ' +add-after'
        elif plan_disposition == 'add-end':
            value += ' +add-end'
        if auto_queue_plan:
            value += ' +auto-queue-plan'
    if commit_mode == 'auto':
        value += ' +auto-commit'
    elif commit_mode == 'stage':
        value += ' +stage-commit'
    elif commit_mode == 'manual':
        value += ' +manual-commit'

    status_prefix = _STATUS_PREFIX_MAP.get(status, '')

    with _planq_file_lock:
        lines = _read_planq_lines()

        if parent_task_key:
            # Find the parent line and determine its depth
            parent_idx = None
            parent_depth = 0
            for i, raw_line in enumerate(lines):
                if _task_key_from_line(raw_line) == parent_task_key:
                    parent_idx = i
                    after_status = _strip_status_prefix(raw_line)
                    parent_depth, _ = _strip_depth_prefix(after_status)
                    break

            if parent_idx is not None:
                child_depth = parent_depth + 1
                depth_prefix = '  ' * (child_depth - 1) + '- '
                line = status_prefix + depth_prefix + task_type + ': ' + value + '\n'

                # Find insertion point: after last descendant of parent's subtree
                insert_after = parent_idx
                for j in range(parent_idx + 1, len(lines)):
                    raw = lines[j]
                    if not raw.strip():
                        continue
                    after_st = _strip_status_prefix(raw)
                    d, _ = _strip_depth_prefix(after_st)
                    if d <= parent_depth:
                        break
                    insert_after = j

                lines.insert(insert_after + 1, line)
                _write_planq_lines(lines)
                return

        # No parent or parent not found: append at end
        line = status_prefix + task_type + ': ' + value + '\n'
        lines.append(line)
        _write_planq_lines(lines)


def _apply_changes(ws, changes: list) -> None:
    """Apply a list of ChangeRequests from the server to planq-order.txt."""
    ack_ids = []
    for change in changes:
        ctype = change.get('type')
        task_key = change.get('task_key')
        payload = change.get('payload', {})
        cid = change.get('id', '')
        try:
            if ctype == 'add_task':
                _apply_add_task(payload)
            elif ctype == 'update_status' and task_key:
                _apply_update_status(task_key, payload.get('status', 'pending'))
            elif ctype == 'update_content' and task_key:
                field = payload.get('field')
                value = payload.get('value', '')
                if field == 'commit_mode':
                    _apply_update_commit_mode(task_key, value)
                elif field == 'description':
                    _apply_update_description(task_key, value)
            elif ctype == 'delete_task' and task_key:
                _apply_delete_task(task_key)
            elif ctype == 'reorder':
                _apply_reorder(payload.get('order', []))
            ack_ids.append(cid)
        except Exception as e:
            log.error('Failed to apply change %s (%s): %s', cid, ctype, e)
    if ack_ids:
        _ws_send(ws, {'type': 'change_ack', 'ids': ack_ids})
    if ack_ids:
        # Trigger an immediate heartbeat so the server sees the updated state
        _immediate_heartbeat.set()


def _plans_files_snapshot() -> tuple[dict, list]:
    """Scan plans/ and return (changed_files, deleted_files).

    changed_files: {filename: content} for files whose mtime changed since last call.
    deleted_files: [filename, ...] for files present in previous snapshot but now gone.

    On first call, all existing files are considered "changed" (initial full push).
    """
    plans_dir = WORKSPACE_ROOT / 'plans'
    changed: dict = {}
    deleted: list = []
    with _plans_file_mtimes_lock:
        current: dict = {}
        if plans_dir.exists():
            try:
                for entry in os.scandir(plans_dir):
                    if entry.is_file() and not entry.name.startswith('.'):
                        current[entry.name] = entry.stat().st_mtime
            except OSError:
                pass

        for name, mtime in current.items():
            if _plans_file_mtimes.get(name) != mtime:
                try:
                    content = (plans_dir / name).read_text(errors='replace')
                except OSError:
                    content = ''
                changed[name] = content

        for name in list(_plans_file_mtimes):
            if name not in current:
                deleted.append(name)

        _plans_file_mtimes.clear()
        _plans_file_mtimes.update(current)
    return changed, deleted


def _plans_watcher_thread():
    """Poll plans/ every 0.5s; on mtime change trigger a debounced 2s heartbeat."""
    global _plans_watcher_debounce
    plans_dir = WORKSPACE_ROOT / 'plans'
    local_snapshot: dict = {}
    while True:
        time.sleep(0.5)
        current: dict = {}
        try:
            if plans_dir.exists():
                for entry in os.scandir(plans_dir):
                    if entry.is_file() and not entry.name.startswith('.'):
                        current[entry.name] = entry.stat().st_mtime
        except OSError:
            pass
        if current != local_snapshot:
            local_snapshot = current
            with _plans_watcher_debounce_lock:
                if _plans_watcher_debounce is not None:
                    _plans_watcher_debounce.cancel()
                t = threading.Timer(2.0, _immediate_heartbeat.set)
                t.daemon = True
                t.start()
                _plans_watcher_debounce = t


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
    git_commits = _annotate_commits_with_sessions(
        _git_log_incremental(), source_repo, running_ids
    )
    raw_submodule_commits = _git_log_for_submodules()
    submodule_commits = {
        repo: _annotate_commits_with_sessions(commits, repo, running_ids)
        for repo, commits in raw_submodule_commits.items()
    }
    review = _review_state()
    plans_files, plans_files_deleted = _plans_files_snapshot()

    versions = {
        'planq_daemon': _read_version_stamp('planq-daemon'),
        'planq_daemon_running': DAEMON_RUNNING_STAMP,
        'planq_shell': _read_version_stamp('planq-shell'),
        'devcontainer': _read_version_stamp('devcontainer'),
    }

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
        'versions': versions,
        'review_state': review,
        'test_results': _test_results(),
        'plans_files': plans_files,
        'plans_files_deleted': plans_files_deleted,
        **git,
    }

    _ws_send(ws_app, heartbeat)


def main():
    log.info('Starting — server=%s, repo=%s, stamp=%s', SERVER_URL, SOURCE_REPO, DAEMON_RUNNING_STAMP or 'none')
    log.info('Version stamps — daemon=%s, shell=%s, devcontainer=%s',
             _read_version_stamp('planq-daemon') or 'none',
             _read_version_stamp('planq-shell') or 'none',
             _read_version_stamp('devcontainer') or 'none')
    _write_status('starting')
    threading.Thread(target=_plans_watcher_thread, daemon=True, name='plans-watcher').start()
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
