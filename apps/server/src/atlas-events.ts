// ~/atlas/observability/apps/server/src/atlas-events.ts
//
// Layer 3 — event-driven response. Inbound webhooks (GitHub, Stripe, ntfy,
// operator-manual) and local file-change events route through this module.
//
// Pipeline per inbound event:
//   1. Signature verification (HMAC for GitHub, signature header for Stripe,
//      shared secret for ntfy, Telegram chat id for manual).
//   2. Classify against ~/atlas/scheduler/event-routes.yaml — find the
//      handler matching event-type + filter clauses.
//   3. Render the handler's `prompt_template` with the event payload.
//   4. Spawn a Claude Code session in the target division's CWD with the
//      division/agent personality file + rendered prompt. Same dispatcher
//      shape as the scheduler.
//   5. Audit + observability event for every step.
//
// Failure modes (per spec):
//   - Same event class fails 3+ times in 24h → mark handler `paused: true`
//     in event-routes.yaml and ntfy + dashboard alert.
//   - Webhook signature failure → 401, audit outcome:blocked,reason:bad_signature.
//     10+ bad signatures in an hour → security alert event.

import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const ROUTES_FILE = join(ATLAS_HOME, 'scheduler', 'event-routes.yaml');
const FAILURE_STATE_FILE = join(ATLAS_HOME, 'scheduler', 'event-failures.json');
const DIVISIONS_DIR = join(ATLAS_HOME, 'divisions');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const CLAUDE_BIN = '/Users/hrmacnair/.local/bin/claude';
const UV_BIN = '/opt/homebrew/bin/uv';

const HANDLER_TIMEOUT_MS = 10 * 60_000;
const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FAILURE_PAUSE_THRESHOLD = 3;
const BAD_SIG_ALERT_THRESHOLD = 10;
const BAD_SIG_ALERT_WINDOW_MS = 60 * 60 * 1000;

type EventRoute = {
  event: string;
  filter?: Record<string, any>;
  division: string;
  agent: string;
  model?: string;
  prompt_template: string;
  paused?: boolean;
};

// ----- yaml I/O ------------------------------------------------------------

function readYaml(path: string): any {
  try {
    if (!existsSync(path)) return null;
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d or [], default=str))',
       path],
      { encoding: 'utf8' }
    );
    if (res.status !== 0) return null;
    return JSON.parse(res.stdout);
  } catch { return null; }
}

function writeYaml(path: string, data: any): boolean {
  try {
    const json = JSON.stringify(data);
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=json.loads(sys.stdin.read()); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False, allow_unicode=True), end="")'],
      { input: json, encoding: 'utf8' }
    );
    if (res.status !== 0) return false;
    writeFileSync(path, res.stdout);
    return true;
  } catch { return false; }
}

// ----- audit + event emit -------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function actId(): string {
  return `act_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`;
}
import { bumpDivisionState } from './atlas-division-state';

function appendAudit(entry: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {}
  try {
    if (entry && entry.division) {
      bumpDivisionState(entry.division, entry.id || null, entry.ts || '');
    }
  } catch {}
}

// ----- signature verification --------------------------------------------

export function verifyGitHubSig(secret: string, body: string, sigHeader: string | null): boolean {
  if (!sigHeader || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader)); }
  catch { return false; }
}

export function verifyStripeSig(secret: string, body: string, sigHeader: string | null): boolean {
  if (!sigHeader || !secret) return false;
  // Stripe header format: "t=<ts>,v1=<sig>,v0=<sig>"
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(',')) {
    const [k, v] = kv.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); }
  catch { return false; }
}

// ----- bad-signature counter ---------------------------------------------

const badSigTimes: number[] = [];
export function noteBadSignature(source: string): { alert: boolean; count: number } {
  const now = Date.now();
  while (badSigTimes.length && now - badSigTimes[0] > BAD_SIG_ALERT_WINDOW_MS) badSigTimes.shift();
  badSigTimes.push(now);
  const count = badSigTimes.length;
  const alert = count >= BAD_SIG_ALERT_THRESHOLD;
  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'security',
    action: 'webhook_bad_signature',
    target: source,
    summary: `Bad signature on ${source} (${count} in last hour)`,
    autonomy: 'restricted',
    outcome: 'blocked',
    approver: null,
    correlation_id: null,
  });
  return { alert, count };
}

// ----- failure tracker ---------------------------------------------------

type FailureState = Record<string, { times: number[]; paused: boolean }>;

function readFailureState(): FailureState {
  try {
    if (!existsSync(FAILURE_STATE_FILE)) return {};
    return JSON.parse(readFileSync(FAILURE_STATE_FILE, 'utf8'));
  } catch { return {}; }
}
function writeFailureState(s: FailureState): void {
  try {
    mkdirSync(join(FAILURE_STATE_FILE, '..'), { recursive: true });
    writeFileSync(FAILURE_STATE_FILE, JSON.stringify(s, null, 2));
  } catch {}
}

function noteHandlerOutcome(eventKey: string, outcome: 'executed' | 'blocked'): { pause: boolean; failureCount: number } {
  const state = readFailureState();
  const now = Date.now();
  const entry = state[eventKey] || { times: [], paused: false };
  // Prune old failures
  entry.times = entry.times.filter(t => now - t < FAILURE_WINDOW_MS);
  if (outcome === 'blocked') entry.times.push(now);
  else if (outcome === 'executed') entry.times = []; // success clears history
  const pause = entry.times.length >= FAILURE_PAUSE_THRESHOLD && !entry.paused;
  if (pause) entry.paused = true;
  state[eventKey] = entry;
  writeFailureState(state);
  return { pause, failureCount: entry.times.length };
}

// ----- route matching ----------------------------------------------------

function matchFilter(filter: Record<string, any> | undefined, payload: any): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (typeof v === 'string' && v.endsWith('_contains')) continue; // handled below
    // Support {key}_contains shorthand (e.g. topic_contains: competitor)
    if (k.endsWith('_contains')) {
      const targetKey = k.replace(/_contains$/, '');
      const haystack = String(payload?.[targetKey] ?? '').toLowerCase();
      if (!haystack.includes(String(v).toLowerCase())) return false;
      continue;
    }
    // Nested key access via dot syntax (repo, payload.repo, etc.)
    const got = k.split('.').reduce((o: any, p: string) => (o == null ? null : o[p]), payload);
    if (got !== v) return false;
  }
  return true;
}

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = k.split('.').reduce((o: any, p: string) => (o == null ? null : o[p]), vars);
    return v == null ? '' : String(v);
  });
}

// ----- handler dispatch --------------------------------------------------

function divisionWorkingDir(division: string): string {
  if (division === 'margin') return join(ATLAS_HOME, 'projects', 'margin');
  if (division === 'industry') return join(ATLAS_HOME, 'projects', 'industry');
  return ATLAS_HOME;
}

function readPersonality(division: string, role: string): string {
  const primary = join(DIVISIONS_DIR, division, 'agents', `${role}.md`);
  try { return readFileSync(primary, 'utf8').trim(); } catch {}
  const fallback = join(DIVISIONS_DIR, 'atlas-meta', 'agents', `${role}.md`);
  try { return readFileSync(fallback, 'utf8').trim(); } catch {}
  return `You are @${role[0].toUpperCase() + role.slice(1)}.`;
}

function modelArg(tier: string | undefined): string {
  if (tier === 'opus' || tier === 'sonnet' || tier === 'haiku') return tier;
  return 'sonnet';
}

function emitEventForwarded(eventType: string, payload: any): void {
  // Forward to the local /events endpoint via fetch (Bun supports global fetch).
  try {
    fetch('http://localhost:4000/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_app: 'atlas-events',
        session_id: payload.correlation_id || `evt_${Date.now()}`,
        hook_event_type: eventType,
        payload,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {}
}

export function dispatchEvent(eventKey: string, payload: Record<string, any>): { ok: boolean; matched: number; message: string } {
  const routes: EventRoute[] = readYaml(ROUTES_FILE) || [];
  if (!Array.isArray(routes) || routes.length === 0) {
    return { ok: true, matched: 0, message: 'no routes configured' };
  }

  // Look up failure state per route id (eventKey + index)
  let matched = 0;
  const correlationId = `evt_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`;

  for (const route of routes) {
    if (route.event !== eventKey) continue;
    if (!matchFilter(route.filter, payload)) continue;
    matched++;

    if (route.paused) {
      appendAudit({
        ts: nowIso(), id: actId(),
        division: route.division, agent: route.agent,
        action: 'event_handler_skipped_paused',
        target: eventKey,
        summary: `Handler paused after repeated failures`,
        autonomy: 'bold', outcome: 'blocked',
        approver: null, correlation_id: correlationId,
      });
      continue;
    }

    // Resolve template vars: top-level payload + nested
    const division = renderTemplate(route.division, payload) || route.division;
    const userPrompt = renderTemplate(route.prompt_template, payload);
    const cwd = divisionWorkingDir(division);
    const effectiveCwd = existsSync(cwd) ? cwd : ATLAS_HOME;
    const personality = readPersonality(division, route.agent);
    const systemPrompt = `${personality}

Current division: ${division}.
You are responding to an inbound event (${eventKey}) — event-driven autonomous response. Mode B. Stay inside your division's scope. Anything requiring approval — write a yaml to ~/atlas/proposals/ and stop.
`;
    const model = modelArg(route.model);

    const startId = actId();
    appendAudit({
      ts: nowIso(), id: startId,
      division, agent: route.agent,
      action: 'event_handler_started',
      target: eventKey,
      summary: `Event ${eventKey} handler starting (${route.agent}/${model})`,
      autonomy: 'bold', outcome: 'executed',
      approver: null, correlation_id: correlationId,
    });
    emitEventForwarded('EventHandlerStarted', {
      session_id: correlationId, event_type: eventKey,
      division, agent: route.agent, model, correlation_id: correlationId,
    });

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const proc = spawn(CLAUDE_BIN, [
      '--print',
      '--model', model,
      '--append-system-prompt', systemPrompt,
      userPrompt,
    ], {
      cwd: effectiveCwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    const tmr = setTimeout(() => {
      killedByTimeout = true;
      try { proc.kill('SIGTERM'); } catch {}
    }, HANDLER_TIMEOUT_MS);

    proc.stdout.on('data', c => stdout += c.toString());
    proc.stderr.on('data', c => stderr += c.toString());

    const eventKeyForFailure = `${eventKey}@${division}/${route.agent}`;
    proc.on('close', (code) => {
      clearTimeout(tmr);
      let outcome: 'executed' | 'blocked' = code === 0 ? 'executed' : 'blocked';
      let reason = '';
      if (killedByTimeout) { outcome = 'blocked'; reason = 'timeout'; }
      else if (code !== 0) reason = (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 300);
      const replyPreview = stdout.trim().slice(0, 400).replace(/\n+/g, ' ');

      appendAudit({
        ts: nowIso(), id: actId(),
        division, agent: route.agent,
        action: 'event_handler_finished',
        target: eventKey,
        summary: outcome === 'executed'
          ? `Event ${eventKey} handled: ${replyPreview.slice(0, 200)}`
          : `Event ${eventKey} failed: ${reason}`,
        autonomy: 'bold', outcome,
        approver: null, correlation_id: correlationId,
      });
      emitEventForwarded('EventHandlerRan', {
        session_id: correlationId, event_type: eventKey,
        division, agent: route.agent, model,
        outcome, reason, reply_preview: replyPreview,
        correlation_id: correlationId,
      });

      const fr = noteHandlerOutcome(eventKeyForFailure, outcome);
      if (fr.pause) {
        // Persist `paused: true` back to event-routes.yaml
        const fresh: EventRoute[] = readYaml(ROUTES_FILE) || [];
        for (const r of fresh) {
          if (r.event === route.event &&
              r.division === route.division &&
              r.agent === route.agent) {
            r.paused = true;
          }
        }
        writeYaml(ROUTES_FILE, fresh);
        appendAudit({
          ts: nowIso(), id: actId(),
          division: 'atlas-meta', agent: 'security',
          action: 'event_handler_auto_paused',
          target: eventKeyForFailure,
          summary: `Auto-paused after ${fr.failureCount} failures in 24h`,
          autonomy: 'restricted', outcome: 'blocked',
          approver: null, correlation_id: correlationId,
        });
        emitEventForwarded('EventHandlerAutoPaused', {
          session_id: correlationId, event_type: eventKey,
          division, agent: route.agent,
          failure_count: fr.failureCount,
        });
      }
    });

    proc.on('error', err => {
      clearTimeout(tmr);
      appendAudit({
        ts: nowIso(), id: actId(),
        division, agent: route.agent,
        action: 'event_handler_finished',
        target: eventKey,
        summary: `Spawn failed: ${err.message}`,
        autonomy: 'bold', outcome: 'blocked',
        approver: null, correlation_id: correlationId,
      });
    });
  }

  return { ok: true, matched, message: `${matched} handler(s) dispatched for ${eventKey}` };
}

// ----- public webhook handlers -------------------------------------------

export async function handleGitHubWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const evt = req.headers.get('x-github-event') || 'unknown';
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';

  if (secret) {
    if (!verifyGitHubSig(secret, body, sig)) {
      const { alert } = noteBadSignature('github');
      if (alert) emitEventForwarded('SecurityBadSignatureBurst', { source: 'github' });
      return new Response('bad signature', { status: 401 });
    }
  }
  // else: no secret configured → skip verification (Layer 1-2 doesn't have it yet
  // per locked decision 3; webhook secrets deferred to Layer 3 start)

  let payload: any = {};
  try { payload = JSON.parse(body); } catch {}
  // GitHub event keys: "github.<event>.<action>" — e.g. github.issues.opened
  const action = payload.action || 'event';
  const key = `github.${evt}.${action}`;
  const flat = {
    ...payload,
    title: payload.issue?.title || payload.pull_request?.title || '',
    repo: payload.repository?.full_name || '',
    number: payload.issue?.number || payload.pull_request?.number || null,
  };
  const r = dispatchEvent(key, flat);
  return new Response(JSON.stringify(r), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (secret) {
    if (!verifyStripeSig(secret, body, sig)) {
      const { alert } = noteBadSignature('stripe');
      if (alert) emitEventForwarded('SecurityBadSignatureBurst', { source: 'stripe' });
      return new Response('bad signature', { status: 401 });
    }
  }

  let payload: any = {};
  try { payload = JSON.parse(body); } catch {}
  const type = (payload.type || 'unknown').replace(/\./g, '.');
  const key = `stripe.${type}`;
  const obj = payload.data?.object || {};
  const flat = {
    ...payload,
    customer_email: obj.customer_email || obj.email || '',
    amount: obj.amount_due || obj.amount || null,
    invoice_id: obj.id || '',
  };
  const r = dispatchEvent(key, flat);
  return new Response(JSON.stringify(r), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleNtfyWebhook(req: Request, secretFromPath: string): Promise<Response> {
  const expected = process.env.NTFY_WEBHOOK_SECRET || '';
  if (expected && secretFromPath !== expected) {
    noteBadSignature('ntfy');
    return new Response('forbidden', { status: 401 });
  }
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const key = `ntfy.${payload.event || 'message'}`;
  const r = dispatchEvent(key, payload);
  return new Response(JSON.stringify(r), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleManualEvent(req: Request, telegramChatId: string | null): Promise<Response> {
  const operatorId = process.env.TELEGRAM_OPERATOR_CHAT_ID || '';
  if (operatorId && telegramChatId && telegramChatId !== operatorId) {
    return new Response('forbidden', { status: 401 });
  }
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const evtType = String(payload.event || 'manual');
  const r = dispatchEvent(evtType, payload);
  return new Response(JSON.stringify(r), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

// Used by file-watcher subprocess + scout sweeps
export function dispatchLocal(eventType: string, payload: Record<string, any>): { ok: boolean; matched: number; message: string } {
  return dispatchEvent(eventType, payload);
}
