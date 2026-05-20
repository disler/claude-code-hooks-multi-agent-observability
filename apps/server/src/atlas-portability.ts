// ~/atlas/observability/apps/server/src/atlas-portability.ts
//
// Portability + migration support. Surfaces backup state for the dashboard
// "Portability" card and the manual "Back up now" button.
//
// Data sources:
//   - ~/atlas/scheduler/backup.log     (append-only by both backup scripts)
//   - ~/atlas/.git/refs/heads/main     (last GitHub-pushed commit, if repo exists)
//   - ~/Library/Mobile Documents/com~apple~CloudDocs/Atlas-Backup (iCloud mtime)

import { existsSync, statSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const BACKUP_LOG = join(ATLAS_HOME, 'scheduler', 'backup.log');
const ICLOUD_DIR = `${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs/Atlas-Backup`;
const PUSH_SH = join(ATLAS_HOME, 'scheduler', 'helpers', 'backup-push.sh');
const RSYNC_SH = join(ATLAS_HOME, 'scheduler', 'helpers', 'backup-rsync.sh');
const BOOTSTRAP_SH = join(ATLAS_HOME, 'bootstrap.sh');

export function portabilityState() {
  const githubLast = lastBackupLine('committed');
  const iCloudLast = lastBackupLine('rsynced');
  return {
    github: {
      last_event: githubLast.line,
      last_ts: githubLast.ts,
      remote: detectRemote(),
    },
    icloud: {
      enabled: existsSync(ICLOUD_DIR),
      last_event: iCloudLast.line,
      last_ts: iCloudLast.ts,
      size: dirSize(ICLOUD_DIR),
    },
    bootstrap_script: existsSync(BOOTSTRAP_SH) ? BOOTSTRAP_SH : null,
    log_path: BACKUP_LOG,
  };
}

function lastBackupLine(matchToken: string): { line: string | null; ts: string | null } {
  try {
    if (!existsSync(BACKUP_LOG)) return { line: null, ts: null };
    const lines = readFileSync(BACKUP_LOG, 'utf8').split('\n').reverse();
    for (const l of lines) {
      if (l.includes(matchToken)) {
        const m = l.match(/^\[([^\]]+)\]\s+(.+)$/);
        return { line: m ? m[2] : l, ts: m ? m[1] : null };
      }
    }
    return { line: null, ts: null };
  } catch { return { line: null, ts: null }; }
}

function detectRemote(): string | null {
  try {
    const head = join(ATLAS_HOME, '.git', 'config');
    if (!existsSync(head)) return null;
    const cfg = readFileSync(head, 'utf8');
    const m = cfg.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(\S+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

function dirSize(p: string): string | null {
  try {
    if (!existsSync(p)) return null;
    return statSync(p).isDirectory() ? 'present' : null;  // du is slow; just probe presence
  } catch { return null; }
}

export async function backupNow(): Promise<{ ok: boolean; github: string; icloud: string }> {
  const runShell = (script: string): Promise<string> => new Promise(resolve => {
    if (!existsSync(script)) { resolve(`missing ${script}`); return; }
    const proc = spawn('/bin/bash', [script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (c) => { out += c.toString(); });
    proc.stderr.on('data', (c) => { out += c.toString(); });
    const tmr = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {}; resolve('timeout'); }, 60_000);
    proc.on('close', () => { clearTimeout(tmr); resolve(out.trim() || 'done'); });
    proc.on('error', (e) => { clearTimeout(tmr); resolve(`error: ${e.message}`); });
  });

  const [github, icloud] = await Promise.all([runShell(PUSH_SH), runShell(RSYNC_SH)]);
  return { ok: true, github: github.slice(0, 400), icloud: icloud.slice(0, 400) };
}
