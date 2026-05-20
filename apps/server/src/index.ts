import { initDatabase, insertEvent, getFilterOptions, getRecentEvents, updateEventHITLResponse } from './db';
import type { HookEvent, HumanInTheLoopResponse } from './types';
import {
  createTheme,
  updateThemeById,
  getThemeById,
  searchThemes,
  deleteThemeById,
  exportThemeById,
  importTheme,
  getThemeStats
} from './theme';
import {
  listProposals,
  loadProposal,
  approveProposal,
  rejectProposal,
  deferProposal,
  rollbackProposal,
  editProposal,
} from './atlas-proposals';
import {
  retryScheduledJob,
  abandonScheduledJob,
} from './atlas-scheduler-ops';
import {
  listLaunchdJobs,
  startJob as startLaunchdJob,
  stopJob as stopLaunchdJob,
  startAll as startAllLaunchdJobs,
  stopAll as stopAllLaunchdJobs,
} from './atlas-launchd';
import {
  getToday,
  addOperatorItem,
  markDone,
  pinItem,
  deferItem,
  approveItem,
  rejectItem,
  archiveDoneAndRefresh,
  renderTelegramDigest,
} from './atlas-today';
import {
  handleGitHubWebhook,
  handleStripeWebhook,
  handleNtfyWebhook,
  handleManualEvent,
  dispatchLocal,
} from './atlas-events';
// atlas-plan retired 2026-05-17. ProjectView is canonical. See decisions.md.
import {
  readProjectView,
  listProjectViews,
  scaffoldProject,
  writeSection,
  appendDecision,
  appendFeatureLog,
  setTaskDone,
  setGranularity,
  addPhase,
  addTask,
  sendTaskToKanban,
  reconcileKanbanCard,
  setProjectViewBroadcaster,
  startProjectViewWatcher,
  deleteTask as deletePhaseTask,
  setProjectType,
  setProjectStage,
  setProjectIncubatorMission,
  setProjectColor,
  readBugs,
  appendBug,
  setBugStatus,
  readLaunchChecklist,
  setLaunchItem,
  readBrief,
  writeBrief,
  readPlan,
  writePlan,
  togglePlanItem,
  readLaunchDate,
  writeLaunchDate,
  generatePlan,
  type PVLaunchBrief,
  type PVPlan,
  type PVPlanItem,
  type PVLaunchDate,
  LAUNCH_CHANNELS,
  LAUNCH_ASSET_KINDS,
  readChannels,
  upsertChannel,
  generateChannelDraft,
  readAssets,
  upsertAsset,
  listAudience,
  addAudience,
  updateAudience,
  removeAudience,
  type PVChannelRow,
  type PVAssetRow,
  type PVAudienceRow,
  type LaunchChannelId,
  type LaunchAssetKindId,
  type ChannelStatus,
  type AssetStatus,
  type AudienceStatus,
  LAUNCH_GATES_SEED,
  readGates,
  upsertGate,
  setLaunchTargetUrl,
  checkGate,
  checkAllAutoGates,
  listProjectsWithAutoGates,
  type PVGateRow,
  type GateKind,
  type GateStatus,
  LAUNCH_METRICS_SEED,
  listRisks,
  addRisk,
  updateRisk,
  removeRisk,
  readMetrics,
  upsertMetric,
  readRetro,
  writeRetro,
  generateRetro,
  type PVRiskRow,
  type RiskSeverity,
  type RiskStatus,
  type PVMetricRow,
  type MetricKind,
  type MetricSource,
  type PVRetro,
  readReleases,
  readHealth,
  promoteMissionToProject,
  readIncubatorMission,
  listBriefs,
  generateBrief,
  archiveProject,
  readBranches,
  listIndustryBriefs,
  generateIndustryBrief,
} from './atlas-projectview';
import {
  listIdeas,
  readIdea,
  createIdea,
  deleteIdea,
  appendUserMessageAndReply,
  generateDossier,
  promoteIdeaToProject,
} from './atlas-ideas';
import {
  listCandidates,
  getCandidate,
  listTrials,
  listSweeps,
  installCandidate,
  declineCandidate,
  markTrialConcern,
  dailyTrialMaintenance,
} from './atlas-scout';
import { analyzeDrift, getLatestDriftReport } from './atlas-drift';
import { buildMemoryGraph, backlinksFor, suggestConnections, getScout, setScout, clearScoutCache } from './atlas-memory-graph';
import { listDAGTemplates, loadDAGTemplate, instantiateDAGTemplate } from './atlas-dag-templates';
import { listDAGSchedules, createDAGSchedule, setScheduleEnabled, deleteDAGSchedule, startDAGScheduleTicker } from './atlas-dag-schedules';
import { regenerateWhitepaper, whitepaperMeta } from './atlas-whitepaper';
import { portabilityState, backupNow } from './atlas-portability';
import { getAutonomyState, setAutonomyMode } from './atlas-autonomy';
import { getOrgChart, getAgentEvents } from './atlas-orgchart';
import { registerCostRoutes } from './atlas-cost';
import { registerBudgetRoutes } from './atlas-budget';
import { registerSpinupRoutes } from './atlas-spinup';
import {
  getMission as getAtlasMission,
  listGoals as listAtlasGoals,
  getGoal as getAtlasGoal,
  buildTree as buildAtlasGoalTree,
  createGoal as createAtlasGoal,
  linkGoal as linkAtlasGoal,
} from './atlas-goals';
import { claimTicket, releaseTicket, getClaim, listClaims } from './atlas-tickets';
import { handleAdapterRoute, registerAdapter, revokeAdapter, listAdapters } from './atlas-adapter';
import { handleRoutineRoute } from './atlas-routine-triggers';
import { listSecrets, setSecret, clearSecret } from './atlas-secrets';
import {
  listMissions as listIncubatorMissions,
  getMission as getIncubatorMission,
  createMission as createIncubatorMission,
  transitionMission as transitionIncubatorMission,
  getPipelineView,
  bulkSeedMissions,
  getMissionWorkspace,
  scaffoldValidationWorkspace,
  dispatchResearch,
  getResearchJob,
  dispatchDraft,
  getDraftJob,
  dispatchVerdict,
  getVerdictJob,
  dispatchSpinupDivision,
  getSpinupJob,
  pivotMission,
  dispatchIdeaIntake,
  getIntakeJob,
} from './atlas-incubator';
import {
  getBatchStatus,
  startBatchNow,
  startBatchOneShot,
  abortBatch,
  resetBatchCounters,
  startBatchScheduler,
} from './atlas-incubator-batch';
import { listMissions, getDivisionDetail, recentRoutingLog, recentCorrections, searchAudit, spendDetail, spendByModel, githubFeed, listAllAgents, generateSuggestions } from './atlas-views';
import {
  initWorkspaceTables,
  setBroadcast as setWorkspaceBroadcast,
  listProjects as listWorkspaceProjects,
  createProject as createWorkspaceProject,
  deleteProject as deleteWorkspaceProject,
  listTasks as listWorkspaceTasks,
  getTask as getWorkspaceTask,
  createTask as createWorkspaceTask,
  moveTask as moveWorkspaceTask,
  deleteTask as deleteWorkspaceTask,
  spawnTask as spawnWorkspaceTask,
  killTask as killWorkspaceTask,
  getTaskLog as getWorkspaceTaskLog,
  getTaskChain as getWorkspaceTaskChain,
  getProjectMemory,
  setProjectMemory,
  listPinnedIds,
  pinTask as pinWorkspaceTask,
  unpinTask as unpinWorkspaceTask,
  unpinAll as unpinAllWorkspace,
  followUpTask as followUpWorkspaceTask,
  listTemplates as listWorkspaceTemplates,
  createTemplate as createWorkspaceTemplate,
  updateTemplate as updateWorkspaceTemplate,
  deleteTemplate as deleteWorkspaceTemplate,
  archiveTask as archiveWorkspaceTask,
  archiveDoneTasks as archiveDoneWorkspaceTasks,
  autoArchiveSweep as autoArchiveWorkspaceSweep,
  getTaskDiff as getWorkspaceTaskDiff,
  mergeTask as mergeWorkspaceTask,
  discardTaskWorktree as discardWorkspaceTaskWorktree,
  getProjectInfo as getWorkspaceProjectInfo,
  mergeAndPushTask as mergeAndPushWorkspaceTask,
  openPRForTask as openPRForWorkspaceTask,
  listTasksForPhase,
  setTaskSchedule as setWorkspaceTaskSchedule,
  scheduleAllBacklog as scheduleAllWorkspaceBacklog,
  clearAllBacklogSchedules as clearAllWorkspaceBacklogSchedules,
  startScheduledTaskPoller,
  startSwarmScheduler,
  startStaleProbe,
  dispatchSwarmDAG,
  validateSwarmDAG,
  getInbox,
  reportBlocked,
  recordReviewerDecision,
  recordShadowDisagreement,
  approveSwarmDAG,
  abortSwarmDAG,
  mergeAllInDAG,
  getDAGStats,
  getDAGDetail,
  getTemplateStats,
  recordMutation,
  listMutationAudit,
  rateLimit,
  getLLMUsage as getWorkspaceLLMUsage,
} from './atlas-workspace';
import {
  getProvidersStatus,
  addCustomProvider,
  removeCustomProvider,
  setCustomApiKey,
  clearCustomApiKey,
  listCustomProviders,
  setApiKey as setLLMApiKey,
  clearApiKey as clearLLMApiKey,
  setActive as setLLMActive,
  getActive as getLLMActive,
  clearProjectActive as clearLLMProjectActive,
  setAutoSwitch as setLLMAutoSwitch,
  getOllamaInstalledModelIds,
  startOllamaPull,
  getOllamaPullJob,
  listOllamaPullJobs,
  removeOllamaModel,
  PROVIDER_KEY_URLS,
  validateKeyFormat,
  testProviderKey,
  type ProviderId,
} from './atlas-llm';
import {
  initTerminals,
  listTerminals,
  getTerminal,
  createTerminal,
  deleteTerminal,
  attachTerminal,
  type AttachHandle,
} from './atlas-terminals';
import {
  initChat,
  listThreads as listChatThreads,
  getThread as getChatThread,
  createThread as createChatThread,
  updateThread as updateChatThread,
  deleteThread as deleteChatThread,
  sendMessage as sendChatMessage,
  resolveProposal as resolveChatProposal,
  setReaction as setChatReaction,
  listSkills as listChatSkills,
  suggestSkills as suggestChatSkills,
  cancelStream as cancelChatStream,
} from './atlas-chat';

// Initialize database
initDatabase();
initWorkspaceTables();
startScheduledTaskPoller();
startSwarmScheduler();
startStaleProbe();
startDAGScheduleTicker();
startBatchScheduler();
const SERVER_START = Date.now();
try { initTerminals(); } catch (err: any) { console.warn('[terminals] init failed:', err?.message); }
try { initChat(); } catch (err: any) { console.warn('[chat] init failed:', err?.message); }

// Store WebSocket clients
const wsClients = new Set<any>();
// Per-ws terminal attach handles — keyed off the ws object itself so we never
// rely on Bun preserving ws.data mutations across handler invocations.
const termHandles = new WeakMap<any, AttachHandle>();

// Wire workspace broadcast → WS clients. Also reverse-sync to ProjectView
// when a workspace task transitions to done/review/failed: any leaf task in
// any ~/atlas/projects/<slug>/.atlas/phase-state.json that points at this
// card_id flips its done flag accordingly.
setWorkspaceBroadcast((msg) => {
  const payload = JSON.stringify(msg);
  wsClients.forEach(c => { try { c.send(payload); } catch { wsClients.delete(c); } });
  try {
    if (msg?.type === 'workspace.task') {
      const data: any = msg.data || {};
      const cardId: string | undefined = data.taskId || data.id;
      const status: string | undefined = data.status;
      if (cardId && (status === 'done' || status === 'review' || status === 'failed')) {
        reconcileKanbanCard(cardId);
      }
    }
  } catch (err: any) { console.warn('[projectview] reconcile failed:', err?.message); }
});

// Wire ProjectView broadcast → WS clients (projectview_update messages).
setProjectViewBroadcaster((msg) => {
  const payload = JSON.stringify(msg);
  wsClients.forEach(c => { try { c.send(payload); } catch { wsClients.delete(c); } });
});

// Watch ~/atlas/projects/* recursively for ProjectView edits.
try { startProjectViewWatcher(); } catch (err: any) { console.warn('[projectview] watcher init failed:', err.message); }

// Auto-archive sweep: done tasks older than 24h. Runs on boot and hourly.
try { autoArchiveWorkspaceSweep(); } catch (err: any) { console.warn('[workspace] initial auto-archive failed:', err.message); }
setInterval(() => {
  try { autoArchiveWorkspaceSweep(); } catch (err: any) { console.warn('[workspace] auto-archive sweep failed:', err.message); }
}, 60 * 60 * 1000);

// --- Load Atlas bot env (router needs ANTHROPIC_API_KEY) ---
try {
  const envText = await Bun.file('/Users/hrmacnair/atlas/bot-tg/.env').text();
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (err) {
  console.warn('[atlas] bot-tg/.env not loaded, talk endpoint may fail:', (err as Error).message);
}

// --- Division inference for inbound events --------------------------------
//
// Every Claude Code hook fires `send_event.py --source-app atlas`, so the
// raw event payload doesn't tell us WHICH project the session is in. We
// derive a `division` field by matching payload.cwd against
// ~/atlas/divisions/*/division.yaml#scope.paths. Cached + refreshed on
// division.yaml mtime change.

import { readFileSync as _readFileSync, existsSync as _existsSync, readdirSync as _readdirSync, statSync as _statSync } from 'fs';
import { join as _join } from 'path';

const _DIVISIONS_DIR = '/Users/hrmacnair/atlas/divisions';
let _divisionPathCache: { mtime: number; map: Array<{ division: string; path: string }> } = { mtime: 0, map: [] };

function _refreshDivisionPaths() {
  let newest = 0;
  let dirs: string[] = [];
  try {
    dirs = _readdirSync(_DIVISIONS_DIR).filter(n => _existsSync(_join(_DIVISIONS_DIR, n, 'division.yaml')));
  } catch { return; }
  for (const n of dirs) {
    try { const t = _statSync(_join(_DIVISIONS_DIR, n, 'division.yaml')).mtimeMs; if (t > newest) newest = t; } catch {}
  }
  if (newest === _divisionPathCache.mtime && _divisionPathCache.map.length > 0) return;
  // Re-parse via uv-pyyaml. Simple ad-hoc shell to avoid taking on async work here.
  const { spawnSync } = require('child_process');
  const map: Array<{ division: string; path: string }> = [];
  for (const n of dirs) {
    const r = spawnSync('/opt/homebrew/bin/uv',
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps((d or {}).get("scope",{}).get("paths",[])))',
       _join(_DIVISIONS_DIR, n, 'division.yaml')],
      { encoding: 'utf8' });
    if (r.status !== 0) continue;
    let paths: string[] = [];
    try { paths = JSON.parse(r.stdout); } catch { continue; }
    for (const p of paths) {
      if (typeof p !== 'string') continue;
      const resolved = p.replace(/^~/, process.env.HOME || '').replace(/\/\*\*$/, '');
      map.push({ division: n, path: resolved });
    }
  }
  // Sort longest-path-first so more specific scope wins (atlas-meta's
  // ~/atlas catches everything, but ~/atlas/projects/margin matches first).
  map.sort((a, b) => b.path.length - a.path.length);
  _divisionPathCache = { mtime: newest, map };
}

function inferDivision(cwd?: string): string | null {
  if (!cwd) return null;
  _refreshDivisionPaths();
  for (const m of _divisionPathCache.map) {
    if (cwd === m.path || cwd.startsWith(m.path + '/')) return m.division;
  }
  return null;
}

function enrichEventDivision(event: any): void {
  if (!event?.payload) return;
  if (event.payload.division) return;  // already set by upstream
  const cwd = event.payload.cwd;  // Claude Code sets this on PreToolUse/PostToolUse
  if (!cwd || typeof cwd !== 'string') return;
  const div = inferDivision(cwd);
  if (div) event.payload.division = div;
}

// --- Atlas dashboard stats ---
// Cached briefly to avoid hammering codeburn / disk on every dashboard refresh.
let atlasStatsCache: { ts: number; data: any } | null = null;
const ATLAS_STATS_TTL_MS = 30_000;

let atlasPendingCache: { ts: number; data: any[] } | null = null;
const ATLAS_PENDING_TTL_MS = 10_000;

let atlasBriefsCache: { ts: number; data: any[] } | null = null;
const ATLAS_BRIEFS_TTL_MS = 60_000;

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const BRIEFS_ARCHIVE = `${ATLAS_HOME}/briefs/archive`;
const ROUTING_LOG = `${ATLAS_HOME}/memory/routing.log`;

// Stub: future approval queue (cold email drafts, invoice approvals, etc.)
async function getAtlasPending(): Promise<any[]> {
  if (atlasPendingCache && Date.now() - atlasPendingCache.ts < ATLAS_PENDING_TTL_MS) {
    return atlasPendingCache.data;
  }
  const items: any[] = []; // wiring TBD — see decisions.md 2026-05-10 Phase 9b
  atlasPendingCache = { ts: Date.now(), data: items };
  return items;
}

// Walk briefs archive, parse title + tldr first line
async function getAtlasBriefs(): Promise<any[]> {
  if (atlasBriefsCache && Date.now() - atlasBriefsCache.ts < ATLAS_BRIEFS_TTL_MS) {
    return atlasBriefsCache.data;
  }
  const briefs: any[] = [];
  try {
    const proc = Bun.spawn(['bash', '-c', `find "${BRIEFS_ARCHIVE}" -maxdepth 2 -type f -name '*.html' -not -name 'index.html' | sort -r`], { stdout: 'pipe' });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    const paths = out.split('\n').filter(Boolean);
    for (const p of paths) {
      const parts = p.split('/');
      const slug = (parts[parts.length - 1] || '').replace(/\.html$/, '');
      const date = parts[parts.length - 2] || '';
      let title = slug;
      let tldr = '';
      let topic = slug;
      try {
        const html = await Bun.file(p).text();
        const h1 = html.match(/<h1[^>]*class="brief-title"[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1) title = stripTags(h1[1]).slice(0, 200);
        else {
          const t = html.match(/<title>([^<]+)<\/title>/i);
          if (t) title = t[1].replace(/\s·\satlas$/i, '').trim().slice(0, 200);
        }
        // First bullet or paragraph after TL;DR
        const tldrBlock = html.match(/<h2[^>]*>\s*TL[^<]*<\/h2>([\s\S]*?)(?:<h2|<\/article>)/i);
        if (tldrBlock) {
          const inner = tldrBlock[1];
          const firstLi = inner.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
          const firstP  = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
          tldr = stripTags((firstLi?.[1] || firstP?.[1] || '')).slice(0, 240).trim();
        }
        // Topic: derive from slug prefix
        if (slug.startsWith('margin')) topic = 'margin';
        else if (slug.startsWith('industry')) topic = 'industry';
        else if (slug.startsWith('hollywood')) topic = 'hollywood';
        else topic = slug.split('-')[0] || 'other';
      } catch {/* skip parse failure */}

      briefs.push({
        date,
        topic,
        slug,
        title,
        tldr,
        path: p,
        url: `http://localhost:5174/${date}/${slug}.html`,
      });
    }
  } catch (err: any) {
    console.error('[atlas/briefs] walk failed:', err.message);
  }
  atlasBriefsCache = { ts: Date.now(), data: briefs };
  return briefs;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

let todaysBriefCache: { ts: number; data: any } | null = null;
const TODAYS_BRIEF_TTL_MS = 60_000;

async function getTodaysBriefs(): Promise<any> {
  if (todaysBriefCache && Date.now() - todaysBriefCache.ts < TODAYS_BRIEF_TTL_MS) {
    return todaysBriefCache.data;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const all = await getAtlasBriefs();
  const todays = all.filter(b => b.date === today);

  let data: any;
  if (todays.length > 0) {
    const briefs = await Promise.all(todays.map(async (b) => ({
      date: b.date,
      topic: b.topic,
      slug: b.slug,
      title: b.title,
      tldr: b.tldr,
      htmlBody: await extractBriefBody(b.path),
      recommendedAction: null,
      prompts: [],
      time: '', // future: parse fired-at time from html or mtime
    })));
    data = { briefs };
  } else {
    const latest = all[0];
    data = {
      briefs: [],
      latestPriorBrief: latest
        ? {
            date: latest.date,
            slug: latest.slug,
            title: latest.title,
            topic: latest.topic,
            tldr: latest.tldr,
            htmlBody: await extractBriefBody(latest.path),
          }
        : null,
    };
  }

  todaysBriefCache = { ts: Date.now(), data };
  return data;
}

async function extractBriefBody(path: string): Promise<string> {
  try {
    const html = await Bun.file(path).text();
    // Pull just the <article class="content">…</article> if present;
    // otherwise fall back to <div class="wrap">…</div> minus the brief-head.
    const article = html.match(/<article[^>]*class="content"[^>]*>([\s\S]*?)<\/article>/i);
    if (article) return article[1];
    const wrap = html.match(/<div[^>]*class="wrap"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
    if (wrap) {
      // strip the brief-head block if it exists, since we render title separately
      return wrap[1].replace(/<header[^>]*class="brief-head"[^>]*>[\s\S]*?<\/header>/i, '');
    }
    // last-resort: return the body content
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return body ? body[1] : html;
  } catch (err) {
    return `<p>Brief content unavailable: ${(err as Error).message}</p>`;
  }
}

// ---- Talk attachments ----
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TALK_TMP_ROOT = '/tmp/atlas-talk';

const TEXT_EXTS = new Set('txt md rtf js ts tsx jsx py swift json yaml yml html css'.split(' '));
const IMAGE_EXTS = new Set('jpg jpeg png heic heif webp gif'.split(' '));
const PDF_EXT = 'pdf';

interface SavedFile {
  name: string;
  ext: string;
  mime: string;
  path: string;
  size: number;
}

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

function isAllowedFile(f: File): boolean {
  const ext = extOf(f.name);
  if (TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext) || ext === PDF_EXT) return true;
  if (f.type.startsWith('image/')) return true;
  if (f.type.startsWith('text/')) return true;
  if (f.type === 'application/pdf') return true;
  return false;
}

async function saveUploads(files: File[]): Promise<SavedFile[]> {
  if (!files.length) return [];
  const session = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = `${TALK_TMP_ROOT}/${session}`;
  await Bun.spawn(['mkdir', '-p', dir]).exited;
  const out: SavedFile[] = [];
  for (const f of files) {
    const ext = extOf(f.name);
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${dir}/${safeName}`;
    const buffer = await f.arrayBuffer();
    await Bun.write(path, buffer);
    out.push({ name: f.name, ext, mime: f.type, path, size: f.size });
  }
  return out;
}

// Sweep /tmp/atlas-talk/* older than 24h on server startup
async function cleanupOldTalkUploads() {
  try {
    await Bun.spawn(['bash', '-c', `find ${TALK_TMP_ROOT} -mindepth 1 -maxdepth 1 -type d -mtime +0 -exec rm -rf {} + 2>/dev/null || true`]).exited;
  } catch {/* non-fatal */}
}
cleanupOldTalkUploads();

// Anthropic Messages API for vision (when images attached)
const ANTHROPIC_MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-1-20250805',
};

async function callAnthropicVision(opts: {
  model: string;
  systemPrompt: string;
  message: string;
  images: SavedFile[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  const modelId = ANTHROPIC_MODEL_IDS[opts.model] || ANTHROPIC_MODEL_IDS.sonnet;

  const content: any[] = [];
  for (const img of opts.images) {
    const bytes = await Bun.file(img.path).arrayBuffer();
    const b64 = Buffer.from(bytes).toString('base64');
    const mediaType = img.mime || (img.ext === 'png' ? 'image/png' : 'image/jpeg');
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: b64 },
    });
  }
  content.push({ type: 'text', text: opts.message || 'Describe the attached image(s).' });

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 1024,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }
  const parsed = await res.json() as any;
  const reply = (parsed.content || []).map((b: any) => b.text || '').join('').trim();
  return reply || '(empty reply)';
}

// Dynamic-import the bot-tg router. routeMessage classifies the prompt,
// backendFor maps tier → CLI backend. atlasTalk handles attachments by
// inlining text/code/markdown into the message, sending images via the
// Anthropic Messages API (vision), and falling back to claude --print
// for pure-text turns.
async function atlasTalk(
  message: string,
  files: SavedFile[] = [],
  forceModel?: string,
  priorTurns: Array<{ role: 'user' | 'atlas' | 'error'; text: string }> = []
): Promise<{ reply: string; decision: any; attachments_processed: string[] }> {
  const router = await import('/Users/hrmacnair/atlas/bot-tg/router.js');

  // Categorize attachments
  const images = files.filter(f => IMAGE_EXTS.has(f.ext) || f.mime.startsWith('image/'));
  const textFiles = files.filter(f =>
    TEXT_EXTS.has(f.ext) || (f.mime.startsWith('text/') && !TEXT_EXTS.has(f.ext) === false)
  );
  const pdfFiles = files.filter(f => f.ext === PDF_EXT || f.mime === 'application/pdf');

  // Build a routing-aware message (with attachment hints so the router
  // can pick the right agent / project / model).
  let routedMessage = message;
  for (const f of [...textFiles, ...pdfFiles, ...images]) {
    routedMessage += `\n[Attached: ${f.name}]`;
  }

  // Prepend prior chat turns so claude --print sees the conversation history
  // (each --print call is a fresh process; we manually feed context).
  let enrichedMessage = '';
  if (priorTurns && priorTurns.length > 0) {
    enrichedMessage += '## Prior conversation\n\n';
    for (const t of priorTurns) {
      const role = t.role === 'user' ? 'Operator' : (t.role === 'atlas' ? 'Atlas' : 'Error');
      enrichedMessage += `${role}: ${(t.text || '').slice(0, 2000)}\n\n`;
    }
    enrichedMessage += '## New message\n\n';
  }
  enrichedMessage += message;
  for (const f of textFiles) {
    try {
      const content = await Bun.file(f.path).text();
      enrichedMessage += `\n\n[Attached: ${f.name}]\n${content.slice(0, 50_000)}\n`;
    } catch (err: any) {
      enrichedMessage += `\n\n[Attached: ${f.name} — read failed: ${err.message}]\n`;
    }
  }
  // PDF: stub (no pdf-parse installed). Acknowledge the attachment.
  for (const f of pdfFiles) {
    enrichedMessage += `\n\n[Attached PDF: ${f.name} (text extraction not yet wired — please describe what you'd like to do with it)]\n`;
  }

  let decision = await router.routeMessage(routedMessage);

  // Always use the global LLM picker selection — the dashboard picker (top-right)
  // is the single source of truth. `forceModel` from older clients is honored
  // only when explicitly passed (back-compat); otherwise pull from global.
  const VALID = new Set(['opus','sonnet','haiku','gpt5','gpt5-mini','gemma']);
  function tierFromGlobal(provider: string, model: string): string {
    if (provider === 'anthropic' && VALID.has(model)) return model;
    if (provider === 'openai'    && VALID.has(model)) return model;
    if (provider === 'ollama') return 'gemma';
    return 'sonnet';
  }
  if (forceModel && VALID.has(forceModel)) {
    decision = { ...decision, model: forceModel, rationale: `forced to ${forceModel} via dashboard picker` };
  } else {
    const globalActive = getLLMActive();
    const tier = tierFromGlobal(globalActive.provider, globalActive.model);
    decision = { ...decision, model: tier, rationale: `global picker → ${globalActive.provider}/${globalActive.model}` };
  }

  // Auto-upgrade for vision
  if (images.length > 0 && decision.model === 'haiku') {
    decision = { ...decision, model: 'sonnet', rationale: `${decision.rationale} (upgraded for vision)` };
  }

  const { backend, model } = router.backendFor(decision.model);
  const cwd = router.workingDirFor(decision.agent, decision.project);
  const systemPrompt = router.systemPromptFor(decision.agent, decision.project, 'dashboard');

  let reply: string;
  try {
    if (images.length > 0) {
      // Use Anthropic Messages API directly for vision
      reply = await callAnthropicVision({
        model: decision.model,
        systemPrompt,
        message: enrichedMessage,
        images,
      });
    } else if (backend === 'anthropic') {
      reply = await runClaudeCLI({ model, prompt: enrichedMessage, systemPrompt, cwd });
    } else if (backend === 'openai' || backend === 'ollama') {
      reply = await runCodexCLI({ backend, model, prompt: enrichedMessage, systemPrompt, cwd });
    } else {
      reply = `(unsupported backend: ${backend})`;
    }
  } catch (err: any) {
    reply = `(model error: ${err.message?.slice(0, 240) || err})`;
  }

  // Log routing decision
  try {
    router.logRoutingDecision({
      surface: 'dashboard',
      message: routedMessage,
      decision,
      ...(files.length ? { attachments: files.map(f => f.name) } : {}),
    } as any);
  } catch {/* non-fatal */}

  return { reply, decision, attachments_processed: files.map(f => f.name) };
}

const CLAUDE_BIN = '/Users/hrmacnair/.local/bin/claude';
const CODEX_BIN  = '/Users/hrmacnair/.npm-global/bin/codex';

async function runClaudeCLI(opts: { model: string; prompt: string; systemPrompt: string; cwd: string }): Promise<string> {
  const childEnv: any = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY; // claude CLI prefers subscription auth
  const proc = Bun.spawn(
    [CLAUDE_BIN, '--print', '--model', opts.model, '--append-system-prompt', opts.systemPrompt, opts.prompt],
    { cwd: opts.cwd, env: childEnv, stdout: 'pipe', stderr: 'pipe' }
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code === 0) return stdout.trim();
  throw new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 400)}`);
}

async function runCodexCLI(opts: { backend: string; model: string; prompt: string; systemPrompt: string; cwd: string }): Promise<string> {
  const tmpFile = `/tmp/atlas-codex-${Date.now()}-${Math.random().toString(36).slice(2,8)}.txt`;
  const fullPrompt = `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`;
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-m', opts.model, '--output-last-message', tmpFile];
  if (opts.backend === 'ollama') args.push('--oss', '--local-provider', 'ollama');
  args.push(fullPrompt);
  const proc = Bun.spawn([CODEX_BIN, ...args], { cwd: opts.cwd, env: { ...process.env }, stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code === 0) {
    try {
      const text = await Bun.file(tmpFile).text();
      try { await Bun.write(tmpFile, ''); } catch {}
      return text.trim();
    } catch (err: any) {
      throw new Error(`codex output parse failed: ${err.message}`);
    }
  }
  throw new Error(`codex exited ${code}: ${(stderr || stdout).slice(0, 400)}`);
}

async function getAtlasStats() {
  if (atlasStatsCache && Date.now() - atlasStatsCache.ts < ATLAS_STATS_TTL_MS) {
    return atlasStatsCache.data;
  }

  const data: any = {
    generated_at: new Date().toISOString(),
    codeburn: { today: null, month: null, error: null },
    caveman: { sessions: 0, error: null },
    briefs: { recent: [], error: null },
    services: { healthy: 0, total: 0, items: [], error: null },
  };

  // Atlas LaunchAgent health — parse `launchctl list | grep ^com.atlas.`
  try {
    const proc = Bun.spawn(['bash', '-c', `launchctl list 2>/dev/null | awk '$3 ~ /^com\\.atlas\\./'`], { stdout: 'pipe' });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    const items = out.split('\n').filter(Boolean).map((line) => {
      const parts = line.split(/\s+/);
      const pid = parts[0];
      const lastExit = parts[1];
      const name = parts[2];
      return {
        name,
        pid: pid === '-' ? null : parseInt(pid),
        last_exit: parseInt(lastExit),
        status: pid !== '-' && parseInt(lastExit) === 0 ? 'running'
              : pid === '-' && parseInt(lastExit) === 0 ? 'idle'
              : 'failing',
      };
    });
    data.services.items = items;
    data.services.total = items.length;
    data.services.healthy = items.filter(i => i.status === 'running' || i.status === 'idle').length;
  } catch (err: any) {
    data.services.error = err.message;
  }

  // codeburn status: "Today  $19.14  191 calls    Month  $1467.41  6000 calls"
  try {
    const proc = Bun.spawn(['/Users/hrmacnair/.npm-global/bin/codeburn', 'status'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const todayMatch = out.match(/Today\s+\$([\d.]+)\s+(\d+)\s+calls/);
    const monthMatch = out.match(/Month\s+\$([\d.]+)\s+(\d+)\s+calls/);
    if (todayMatch) data.codeburn.today = { dollars: parseFloat(todayMatch[1]), calls: parseInt(todayMatch[2]) };
    if (monthMatch) data.codeburn.month = { dollars: parseFloat(monthMatch[1]), calls: parseInt(monthMatch[2]) };
  } catch (err: any) {
    data.codeburn.error = err.message;
  }

  // caveman session count: jsonl files in ~/.claude/projects/-Users-hrmacnair-atlas/
  try {
    const projDir = '/Users/hrmacnair/.claude/projects/-Users-hrmacnair-atlas';
    const proc = Bun.spawn(['bash', '-c', `ls "${projDir}" 2>/dev/null | grep -c '\\.jsonl$' || echo 0`], {
      stdout: 'pipe',
    });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    data.caveman.sessions = parseInt(out) || 0;
  } catch (err: any) {
    data.caveman.error = err.message;
  }

  // recent briefs: pull top 5 from full archive list (already parsed)
  try {
    const all = await getAtlasBriefs();
    data.briefs.recent = all.slice(0, 5).map((b) => ({
      path: b.path,
      filename: b.slug,
      date: b.date,
      title: b.title,
      topic: b.topic,
      url: `/api/atlas/briefs/file?path=${encodeURIComponent(b.path)}`,
    }));
  } catch (err: any) {
    data.briefs.error = err.message;
  }

  atlasStatsCache = { ts: Date.now(), data };
  return data;
}

// Helper function to send response to agent via WebSocket
async function sendResponseToAgent(
  wsUrl: string,
  response: HumanInTheLoopResponse
): Promise<void> {
  console.log(`[HITL] Connecting to agent WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    };

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isResolved) return;
        console.log('[HITL] WebSocket connection opened, sending response...');

        try {
          ws!.send(JSON.stringify(response));
          console.log('[HITL] Response sent successfully');

          // Wait longer to ensure message fully transmits before closing
          setTimeout(() => {
            cleanup();
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          }, 500);
        } catch (error) {
          console.error('[HITL] Error sending message:', error);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[HITL] WebSocket error:', error);
        cleanup();
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      };

      ws.onclose = () => {
        console.log('[HITL] WebSocket connection closed');
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!isResolved) {
          console.error('[HITL] Timeout sending response to agent');
          cleanup();
          isResolved = true;
          reject(new Error('Timeout sending response to agent'));
        }
      }, 5000);

    } catch (error) {
      console.error('[HITL] Error creating WebSocket:', error);
      cleanup();
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    }
  });
}

// Create Bun server with HTTP and WebSocket support
const server = Bun.serve({
  port: parseInt(process.env.SERVER_PORT || '4000'),
  // Some endpoints (Ideas dossier, brief generation) call Anthropic which can
  // take 30-90s on long prompts. Default 10s timeout kills them mid-flight.
  idleTimeout: 120,

  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // POST /events - Receive new events
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const event: HookEvent = await req.json();

        // Validate required fields
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Enrich with division derived from cwd / transcript_path so Margin /
        // Industry / atlas-meta work surfaces in the dashboard's per-project
        // filters even though every Claude Code hook fires source_app: "atlas".
        enrichEventDivision(event);

        // Insert event into database
        const savedEvent = insertEvent(event);
        
        // Broadcast to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            // Client disconnected, remove from set
            wsClients.delete(client);
          }
        });
        
        return new Response(JSON.stringify(savedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /events/filter-options - Get available filter options
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      const options = getFilterOptions();
      return new Response(JSON.stringify(options), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /events/recent - Get recent events
    if (url.pathname === '/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '300');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/stats - Atlas-specific dashboard stats
    // (codeburn token spend, caveman session count, recent auto-research briefs)
    if (url.pathname === '/api/atlas/stats' && req.method === 'GET') {
      const stats = await getAtlasStats();
      return new Response(JSON.stringify(stats), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/pending - stub for future approval queue
    if (url.pathname === '/api/atlas/pending' && req.method === 'GET') {
      const items = await getAtlasPending();
      return new Response(JSON.stringify({ items }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/pending/:id/approve
    if (url.pathname.match(/^\/api\/atlas\/pending\/[^\/]+\/approve$/) && req.method === 'POST') {
      return new Response(JSON.stringify({ approved: true, id: url.pathname.split('/')[4] }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/pending/:id/reject
    if (url.pathname.match(/^\/api\/atlas\/pending\/[^\/]+\/reject$/) && req.method === 'POST') {
      return new Response(JSON.stringify({ rejected: true, id: url.pathname.split('/')[4] }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Service secrets (Telegram / Discord / Stripe / GitHub / etc.) ----
    if (url.pathname === '/api/atlas/secrets' && req.method === 'GET') {
      // NEVER returns secret values — only metadata + has_key flag.
      return new Response(JSON.stringify({ secrets: listSecrets() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    {
      const setMatch = url.pathname.match(/^\/api\/atlas\/secrets\/([^\/]+)$/);
      if (setMatch && req.method === 'POST') {
        try {
          const body = await req.json() as { value: string };
          const r = setSecret(setMatch[1] as any, body.value || '');
          return new Response(JSON.stringify(r), {
            status: r.ok ? 200 : 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
      if (setMatch && req.method === 'DELETE') {
        const r = clearSecret(setMatch[1] as any);
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase A0: Autonomy mode toggle ----
    if (url.pathname === '/api/atlas/autonomy' && req.method === 'GET') {
      return new Response(JSON.stringify(getAutonomyState()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/autonomy' && req.method === 'POST') {
      try {
        const body = await req.json() as { mode: string; ttl_hours?: number | null; reason?: string };
        if (body.mode !== 'autonomous' && body.mode !== 'guarded') {
          return new Response(JSON.stringify({ error: 'mode must be "autonomous" or "guarded"' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const next = setAutonomyMode({
          mode: body.mode,
          ttl_hours: body.ttl_hours ?? undefined,
          reason: body.reason,
          set_by: 'operator',
        });
        return new Response(JSON.stringify(next), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Paperclip-1: Read-only org-chart ----
    // GET /api/atlas/orgchart — full tree + flat agents list. Live status is
    // derived per-call from events in the last 60s; agents.json is the seed.
    if (url.pathname === '/api/atlas/orgchart' && req.method === 'GET') {
      try {
        return new Response(JSON.stringify(getOrgChart()), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    // GET /api/atlas/orgchart/events?agent=<id>&limit=<n> — last N events
    // for one agent. Used by the OrgChartView drawer.
    if (url.pathname === '/api/atlas/orgchart/events' && req.method === 'GET') {
      try {
        const agent = url.searchParams.get('agent') || '';
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);
        if (!agent) {
          return new Response(JSON.stringify({ error: 'agent query param required' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ agent, events: getAgentEvents(agent, limit) }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Paperclip-4: Cost view (agent / project / goal / task) ----
    // Mounted before the Goal cascade so the longer specific paths under
    // /api/atlas/cost/* aren't shadowed by a generic /:id matcher upstream.
    {
      const costResp = await registerCostRoutes(req, url, headers);
      if (costResp) return costResp;
    }

    // ---- Paperclip-2: Per-agent monthly USD budget ----
    {
      const budgetResp = await registerBudgetRoutes(req, url, headers);
      if (budgetResp) return budgetResp;
    }

    // ---- Paperclip-8: Cliphub-style company templates ----
    {
      const spinupResp = await registerSpinupRoutes(req, url, headers);
      if (spinupResp) return spinupResp;
    }

    // ---- Paperclip-3: Goal cascade (Mission → Project → Goal → Task) ----
    // GET /api/atlas/goals?project=&mission=&status=  → { mission, goals }
    if (url.pathname === '/api/atlas/goals' && req.method === 'GET') {
      try {
        const projectParam = url.searchParams.get('project');
        const missionParam = url.searchParams.get('mission') || undefined;
        const statusParam = url.searchParams.get('status') || undefined;
        const opts: any = {};
        if (projectParam !== null) {
          opts.project_id = projectParam === 'null' || projectParam === '' ? null : projectParam;
        }
        if (missionParam) opts.mission_id = missionParam;
        if (statusParam === 'active' || statusParam === 'done' || statusParam === 'abandoned') {
          opts.status = statusParam;
        }
        return new Response(JSON.stringify(listAtlasGoals(opts)), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/atlas/goals/tree?project=  → nested tree under a project (or all)
    if (url.pathname === '/api/atlas/goals/tree' && req.method === 'GET') {
      try {
        const projectParam = url.searchParams.get('project');
        const missionParam = url.searchParams.get('mission') || undefined;
        const opts: any = {};
        if (projectParam !== null) {
          opts.project_id = projectParam === 'null' || projectParam === '' ? null : projectParam;
        }
        if (missionParam) opts.mission_id = missionParam;
        return new Response(JSON.stringify(buildAtlasGoalTree(opts)), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/atlas/goals/:id  → { goal, ancestry }
    const goalGet = url.pathname.match(/^\/api\/atlas\/goals\/([^\/]+)$/);
    if (goalGet && req.method === 'GET') {
      try {
        const id = decodeURIComponent(goalGet[1]!);
        // Guard: reserved sub-paths handled above.
        if (id === 'tree') {
          return new Response(JSON.stringify({ error: 'not found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const result = getAtlasGoal(id);
        if (!result) {
          return new Response(JSON.stringify({ error: `goal ${id} not found` }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(result), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /api/atlas/goals  body: { name, project_id?, parent_goal_id?, mission_id? }
    if (url.pathname === '/api/atlas/goals' && req.method === 'POST') {
      try {
        let body: any;
        try { body = await req.json(); } catch {
          return new Response(JSON.stringify({ error: 'invalid_json' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        let r;
        try {
          r = createAtlasGoal({
            name: body?.name,
            project_id: body?.project_id ?? null,
            parent_goal_id: body?.parent_goal_id ?? null,
            mission_id: body?.mission_id,
            status: body?.status,
          });
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (/invalid goal name|unknown mission_id/i.test(msg)) {
            return new Response(JSON.stringify({ error: msg }), {
              status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          throw e;
        }
        if (!r.ok) {
          return new Response(JSON.stringify({ error: r.error }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ goal: r.goal }), {
          status: 201, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // PATCH /api/atlas/goals/:id  body: { project_id?, parent_goal_id?, status?, name? }
    const goalPatch = url.pathname.match(/^\/api\/atlas\/goals\/([^\/]+)$/);
    if (goalPatch && req.method === 'PATCH') {
      try {
        const id = decodeURIComponent(goalPatch[1]!);
        let body: any;
        try { body = await req.json(); } catch {
          return new Response(JSON.stringify({ error: 'invalid_json' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const r = linkAtlasGoal({
          goal_id: id,
          project_id: body?.project_id,
          parent_goal_id: body?.parent_goal_id,
          status: body?.status,
          name: body?.name,
        });
        if (!r.ok) {
          return new Response(JSON.stringify({ error: r.error }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ goal: r.goal }), {
          status: 200, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // Silence unused-import warnings if upstream callers rely on getAtlasMission.
    void getAtlasMission;

    // ---- Paperclip-6: Atomic ticket checkout ----
    if (url.pathname === '/api/atlas/tickets/claim' && req.method === 'POST') {
      try {
        const body = await req.json() as { ticket_id: string; agent_id: string; ttl_seconds?: number };
        if (!body.ticket_id || !body.agent_id) {
          return new Response(JSON.stringify({ error: 'ticket_id and agent_id required' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const result = claimTicket({
          ticket_id: body.ticket_id,
          agent_id: body.agent_id,
          ttl_seconds: body.ttl_seconds,
        });
        if (result.ok) {
          return new Response(JSON.stringify({
            claim_id: result.claim_id,
            expires_at: result.expires_at,
            ticket_id: result.ticket_id,
          }), { headers: { ...headers, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'conflict', holder: result.holder }), {
          status: 409, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/tickets/release' && req.method === 'POST') {
      try {
        const body = await req.json() as { ticket_id: string; agent_id: string };
        if (!body.ticket_id || !body.agent_id) {
          return new Response(JSON.stringify({ error: 'ticket_id and agent_id required' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const result = releaseTicket({ ticket_id: body.ticket_id, agent_id: body.agent_id });
        if (result.released) {
          return new Response(JSON.stringify({ released: true }), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ error: result.reason || 'not_holder', holder: result.holder }), {
          status: 403, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname.startsWith('/api/atlas/tickets/claim/') && req.method === 'GET') {
      const ticket_id = decodeURIComponent(url.pathname.slice('/api/atlas/tickets/claim/'.length));
      if (!ticket_id) {
        return new Response(JSON.stringify({ error: 'ticket_id required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      try {
        const claim = getClaim(ticket_id);
        if (!claim) {
          return new Response(JSON.stringify({ error: 'not_found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ claim }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/tickets/claims' && req.method === 'GET') {
      return new Response(JSON.stringify({ claims: listClaims() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Paperclip-5: Adapter webhook contract ----
    if (url.pathname.startsWith('/api/atlas/adapter/')) {
      const adapterResp = await handleAdapterRoute(req, url, headers);
      if (adapterResp) return adapterResp;
    }

    // ---- Paperclip-7: Routine triggers (webhook + manual fire) ----
    if (url.pathname.startsWith('/api/atlas/routine/')) {
      const routineResp = await handleRoutineRoute(req, url, headers);
      if (routineResp) return routineResp;
    }

    // ---- Phase A: Incubator missions + pipeline ----
    if (url.pathname === '/api/atlas/incubator/pipeline' && req.method === 'GET') {
      return new Response(JSON.stringify(getPipelineView()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/missions' && req.method === 'GET') {
      return new Response(JSON.stringify({ missions: listIncubatorMissions() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/missions' && req.method === 'POST') {
      try {
        const body = await req.json();
        const m = createIncubatorMission(body);
        return new Response(JSON.stringify(m), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      const mMatch = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)$/);
      if (mMatch && req.method === 'GET') {
        const m = getIncubatorMission(mMatch[1]);
        if (!m) {
          return new Response(JSON.stringify({ error: 'not found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(m), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      const tMatch = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/transition$/);
      if (tMatch && req.method === 'POST') {
        try {
          const body = await req.json();
          const m = transitionIncubatorMission(tMatch[1], body);
          return new Response(JSON.stringify(m), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
    }
    {
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/workspace$/);
      if (m && req.method === 'GET') {
        return new Response(JSON.stringify(getMissionWorkspace(m[1])), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      if (m && req.method === 'POST') {
        // Operator-triggered re-scaffold (useful if templates were edited).
        const mission = getIncubatorMission(m[1]);
        if (!mission) {
          return new Response(JSON.stringify({ error: 'mission not found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        const r = scaffoldValidationWorkspace(mission);
        return new Response(JSON.stringify({ ...r, workspace: getMissionWorkspace(m[1]) }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      // POST /api/atlas/incubator/missions/:id/research — fire researcher
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/research$/);
      if (m && req.method === 'POST') {
        const r = dispatchResearch(m[1]);
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      if (m && req.method === 'GET') {
        return new Response(JSON.stringify(getResearchJob(m[1])), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      // POST /api/atlas/incubator/missions/:id/draft — fire writer
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/draft$/);
      if (m && req.method === 'POST') {
        const r = dispatchDraft(m[1]);
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      if (m && req.method === 'GET') {
        return new Response(JSON.stringify(getDraftJob(m[1])), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      // POST /api/atlas/incubator/missions/:id/verdict — fire producer review
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/verdict$/);
      if (m && req.method === 'POST') {
        const r = dispatchVerdict(m[1]);
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      if (m && req.method === 'GET') {
        return new Response(JSON.stringify(getVerdictJob(m[1])), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      // POST /api/atlas/incubator/missions/:id/spinup — fire /spinup-division
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/spinup$/);
      if (m && req.method === 'POST') {
        try {
          const body = await req.json() as { slug?: string };
          const slug = (body.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (!slug) {
            return new Response(JSON.stringify({ error: 'slug required' }), {
              status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          const r = dispatchSpinupDivision(m[1], slug);
          return new Response(JSON.stringify(r), {
            status: r.ok ? 200 : 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
      if (m && req.method === 'GET') {
        return new Response(JSON.stringify(getSpinupJob(m[1]) || { mission_id: m[1], status: 'idle' }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      // POST /api/atlas/incubator/missions/:id/pivot — fork to new mission
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/missions\/([^\/]+)\/pivot$/);
      if (m && req.method === 'POST') {
        try {
          const body = await req.json() as { title: string; notes?: string };
          if (!body.title) {
            return new Response(JSON.stringify({ error: 'title required' }), {
              status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          const r = pivotMission(m[1], body.title, body.notes);
          return new Response(JSON.stringify(r), {
            status: r.ok ? 200 : 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
    }
    // ---- Nightly batch research drain ----
    if (url.pathname === '/api/atlas/incubator/batch' && req.method === 'GET') {
      return new Response(JSON.stringify(getBatchStatus()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/batch/start' && req.method === 'POST') {
      const r = startBatchNow();
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/batch/one-shot' && req.method === 'POST') {
      const r = startBatchOneShot();
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/batch/abort' && req.method === 'POST') {
      const r = abortBatch();
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/incubator/batch/reset' && req.method === 'POST') {
      const r = resetBatchCounters();
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Idea intake: structure operator brain dump into a mission ----
    if (url.pathname === '/api/atlas/incubator/intake' && req.method === 'POST') {
      try {
        const body = await req.json() as { brief: string };
        const r = dispatchIdeaIntake(body.brief || '');
        return new Response(JSON.stringify(r), {
          status: r.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    {
      const m = url.pathname.match(/^\/api\/atlas\/incubator\/intake\/([^\/]+)$/);
      if (m && req.method === 'GET') {
        const job = getIntakeJob(m[1]);
        if (!job) {
          return new Response(JSON.stringify({ error: 'job not found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(job), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/api/atlas/incubator/seed' && req.method === 'POST') {
      try {
        const body = await req.json() as { missions: any[] };
        const added = bulkSeedMissions(body.missions || []);
        return new Response(JSON.stringify({ added }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase 13: DAG schedules ----
    if (url.pathname === '/api/atlas/dag/schedules' && req.method === 'GET') {
      return new Response(JSON.stringify({ schedules: listDAGSchedules() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/dag/schedules' && req.method === 'POST') {
      try {
        const body = await req.json();
        const s = createDAGSchedule(body);
        return new Response(JSON.stringify({ ok: true, schedule: s }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    const dagSchedToggle = url.pathname.match(/^\/api\/atlas\/dag\/schedules\/([^\/]+)\/(enable|disable)$/);
    if (dagSchedToggle && req.method === 'POST') {
      const r = setScheduleEnabled(dagSchedToggle[1], dagSchedToggle[2] === 'enable');
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const dagSchedDel = url.pathname.match(/^\/api\/atlas\/dag\/schedules\/([^\/]+)$/);
    if (dagSchedDel && req.method === 'DELETE') {
      return new Response(JSON.stringify(deleteDAGSchedule(dagSchedDel[1])), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Phase 16: audit log read ----
    if (url.pathname === '/api/atlas/audit' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '200');
      const since = url.searchParams.get('since_ms');
      return new Response(JSON.stringify({ entries: listMutationAudit(limit, since ? parseInt(since) : undefined) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Phase 14: telemetry ----
    if (url.pathname === '/api/atlas/dag/stats' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      return new Response(JSON.stringify({ dags: getDAGStats(limit), templates: getTemplateStats() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- DAG full detail with per-task graph (slug/owner/files/deps/accept/status) ----
    {
      const m = url.pathname.match(/^\/api\/atlas\/dag\/([^\/]+)$/);
      if (m && req.method === 'GET' && m[1] !== 'stats' && m[1] !== 'schedules' && m[1] !== 'templates') {
        const detail = getDAGDetail(m[1]);
        if (!detail) {
          return new Response(JSON.stringify({ error: 'dag not found' }), {
            status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(detail), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase 13: health probe ----
    if (url.pathname === '/api/atlas/files' && req.method === 'GET') {
      const fs = require('node:fs');
      const path = require('node:path');
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const root = '/Users/hrmacnair/atlas';
      const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.vite', '.turbo', '.cache', 'tool-results', 'worktrees']);
      const skipExts = new Set(['.log', '.lock', '.map', '.tsbuildinfo']);
      const limit = 30;
      const results: Array<{ path: string; name: string; rel: string }> = [];

      function walk(dir: string, depth: number) {
        if (results.length >= limit) return;
        if (depth > 8) return;
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (results.length >= limit) return;
            if (e.name.startsWith('.') && e.name !== '.claude' && e.name !== '.atlas') continue;
            if (e.isDirectory()) {
              if (skipDirs.has(e.name)) continue;
              walk(path.join(dir, e.name), depth + 1);
            } else if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (skipExts.has(ext)) continue;
              const rel = path.relative(root, path.join(dir, e.name));
              if (q && !rel.toLowerCase().includes(q)) continue;
              results.push({ path: path.join(dir, e.name), name: e.name, rel });
            }
          }
        } catch {}
      }
      walk(root, 0);
      return new Response(JSON.stringify({ files: results }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/atlas/memory-files' && req.method === 'GET') {
      const fs = require('node:fs');
      const path = require('node:path');
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const base = '/Users/hrmacnair/atlas/memory';
      const results: Array<{ slug: string; rel: string; size: number }> = [];
      try {
        for (const e of fs.readdirSync(base, { withFileTypes: true })) {
          if (!e.isFile() || !e.name.endsWith('.md')) continue;
          const slug = e.name.replace(/\.md$/, '');
          if (q && !slug.toLowerCase().includes(q)) continue;
          const stat = fs.statSync(path.join(base, e.name));
          results.push({ slug, rel: `memory/${e.name}`, size: stat.size });
        }
      } catch {}
      results.sort((a, b) => a.slug.localeCompare(b.slug));
      return new Response(JSON.stringify({ memory: results.slice(0, 50) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/atlas/skills' && req.method === 'GET') {
      const fs = require('node:fs');
      const path = require('node:path');
      const skills: Array<{ name: string; description: string; source: string; argument_hint?: string }> = [];
      const seen = new Set<string>();

      function unquote(s: string): string {
        let v = s.trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }

      function readSkillDir(skillDir: string, source: string) {
        try {
          const skillMd = path.join(skillDir, 'SKILL.md');
          if (!fs.existsSync(skillMd)) return;
          const content = fs.readFileSync(skillMd, 'utf-8');
          const m = content.match(/^---\n([\s\S]*?)\n---/);
          if (!m) return;
          const front = m[1];
          const nameMatch = front.match(/^name:\s*(.+)$/m);
          const descMatch = front.match(/^description:\s*([\s\S]+?)(?=\n[a-z_-]+:|\n*$)/m);
          const argMatch = front.match(/^argument-hint:\s*(.+)$/m);
          if (!nameMatch) return;
          const name = unquote(nameMatch[1]);
          if (seen.has(name)) return;
          seen.add(name);
          skills.push({
            name,
            description: unquote((descMatch?.[1] || '').replace(/\s+/g, ' ').trim()),
            source,
            argument_hint: argMatch ? unquote(argMatch[1]) : undefined,
          });
        } catch {}
      }

      function scanShallow(base: string, source: string) {
        try {
          if (!fs.existsSync(base)) return;
          const top = fs.readdirSync(base, { withFileTypes: true });
          for (const e of top) {
            if (!e.isDirectory()) continue;
            readSkillDir(path.join(base, e.name), source);
          }
        } catch {}
      }

      scanShallow('/Users/hrmacnair/atlas/.claude/skills', 'atlas');
      scanShallow('/Users/hrmacnair/.claude/skills', 'user');

      try {
        const cacheBase = '/Users/hrmacnair/.claude/plugins/cache';
        if (fs.existsSync(cacheBase)) {
          for (const plugin of fs.readdirSync(cacheBase, { withFileTypes: true })) {
            if (!plugin.isDirectory()) continue;
            const pluginPath = path.join(cacheBase, plugin.name);
            for (const inner of fs.readdirSync(pluginPath, { withFileTypes: true })) {
              if (!inner.isDirectory()) continue;
              const skillsDir = path.join(pluginPath, inner.name, 'skills');
              scanShallow(skillsDir, `plugin:${plugin.name}`);
            }
          }
        }
      } catch {}

      skills.sort((a, b) => a.name.localeCompare(b.name));
      return new Response(JSON.stringify({ skills }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/atlas/health' && req.method === 'GET') {
      return new Response(JSON.stringify({
        ok: true,
        uptime_ms: Math.round(process.uptime() * 1000),
        memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        pid: process.pid,
        started_at: SERVER_START,
        now: Date.now(),
      }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Phase 9 #7: DAG templates ----
    if (url.pathname === '/api/atlas/dag/templates' && req.method === 'GET') {
      return new Response(JSON.stringify({ templates: listDAGTemplates() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname.startsWith('/api/atlas/dag/templates/') && req.method === 'GET') {
      const slug = url.pathname.split('/').pop()!;
      const tpl = loadDAGTemplate(slug);
      if (!tpl) {
        return new Response(JSON.stringify({ error: 'template not found' }), {
          status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(tpl), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/dag/instantiate' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = instantiateDAGTemplate(body.slug, body.vars || {});
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase 8 #3: Scout output cache ----
    if (url.pathname === '/api/atlas/scout-cache/lookup' && req.method === 'POST') {
      try {
        const body = await req.json();
        const hit = getScout(body.project_id, body.question, body.globs || [], typeof body.max_age_ms === 'number' ? body.max_age_ms : undefined);
        return new Response(JSON.stringify({ ok: true, hit, miss: !hit }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/scout-cache/store' && req.method === 'POST') {
      try {
        const body = await req.json();
        const entry = setScout(body.project_id, body.question, body.globs || [], body.files || [], body.result || '');
        return new Response(JSON.stringify({ ok: true, entry }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/scout-cache/clear' && req.method === 'POST') {
      return new Response(JSON.stringify(clearScoutCache()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Phase 7 #2: Inbox + agent-self-report blocked ----
    if (url.pathname === '/api/atlas/inbox' && req.method === 'GET') {
      return new Response(JSON.stringify({ entries: getInbox() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // Phase 12 — DAG lifecycle (approve / abort / merge-all)
    const dagApprove = url.pathname.match(/^\/api\/atlas\/swarm\/dag\/([^\/]+)\/approve$/);
    if (dagApprove && req.method === 'POST') {
      const r = approveSwarmDAG(dagApprove[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const dagAbort = url.pathname.match(/^\/api\/atlas\/swarm\/dag\/([^\/]+)\/abort$/);
    if (dagAbort && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const r = abortSwarmDAG(dagAbort[1], body.reason);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const dagMergeAll = url.pathname.match(/^\/api\/atlas\/swarm\/dag\/([^\/]+)\/merge-all$/);
    if (dagMergeAll && req.method === 'POST') {
      const r = mergeAllInDAG(dagMergeAll[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 207, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/atlas/swarm/shadow-disagree' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = recordShadowDisagreement(body);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/swarm/review-decision' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = recordReviewerDecision(body.task_id, body.decision, body.notes);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/swarm/blocked' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = reportBlocked(body.task_id, body.reason || '', body.need);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase 6: Swarm Protocol dispatch ----
    if (url.pathname === '/api/atlas/swarm/validate' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = validateSwarmDAG(body.nodes || []);
        return new Response(JSON.stringify({ ok: result.errors.length === 0, ...result }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/swarm/dispatch' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = dispatchSwarmDAG({
          project_id: body.project_id,
          nodes: body.nodes || [],
          dry_run: body.dry_run === true,
          requires_approval: body.requires_approval === true,
          transactional:     body.transactional === true,
          cost_cap_usd:      typeof body.cost_cap_usd === 'number' ? body.cost_cap_usd : undefined,
          idempotency_key:   typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined,
          template_slug:     typeof body.template_slug === 'string' ? body.template_slug : undefined,
          auto_retry:        body.auto_retry === true,
        });
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ---- Phase 3: Atlas memory graph (wikilinks · backlinks · suggestions) ----
    if (url.pathname === '/api/atlas/memory/graph' && req.method === 'GET') {
      try {
        return new Response(JSON.stringify(buildMemoryGraph()), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    if (url.pathname === '/api/atlas/memory/backlinks' && req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) {
        return new Response(JSON.stringify({ error: 'slug required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ slug, backlinks: backlinksFor(slug) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/memory/suggest' && req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      const limit = parseInt(url.searchParams.get('limit') || '8');
      if (!slug) {
        return new Response(JSON.stringify({ error: 'slug required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ slug, suggestions: suggestConnections(slug, limit) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Layer 5a: proposal queue ----
    // GET /api/atlas/proposals — list all proposals across pending/queued/applied/rejected.
    if (url.pathname === '/api/atlas/proposals' && req.method === 'GET') {
      try {
        const items = listProposals();
        return new Response(JSON.stringify({ items }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/atlas/proposals/:id — single proposal (partial-prefix ID match)
    // Optional ?format=yaml returns the raw YAML file body inside { yaml }
    // so the edit two-step flow can show the operator exactly what's on disk.
    const propGet = url.pathname.match(/^\/api\/atlas\/proposals\/([^\/]+)$/);
    if (propGet && req.method === 'GET') {
      const found = loadProposal(propGet[1]);
      if (!found) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      const fmt = url.searchParams.get('format');
      if (fmt === 'yaml') {
        let yamlText = '';
        try { yamlText = require('fs').readFileSync(found.path, 'utf8'); } catch {}
        return new Response(JSON.stringify({
          id: propGet[1], status: found.status, path: found.path, yaml: yamlText,
        }), { headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: propGet[1], status: found.status, data: found.data }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- New views (12-features pass) ----
    if (url.pathname === '/api/atlas/missions' && req.method === 'GET') {
      return new Response(JSON.stringify({ missions: listMissions() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const divMatch = url.pathname.match(/^\/api\/atlas\/divisions\/([^\/]+)$/);
    if (divMatch && req.method === 'GET') {
      const data = getDivisionDetail(divMatch[1]);
      if (!data) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(data), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/routing/log' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7');
      const limit = parseInt(url.searchParams.get('limit') || '200');
      return new Response(JSON.stringify({ entries: recentRoutingLog(days, limit) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/routing/corrections' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '14');
      return new Response(JSON.stringify({ entries: recentCorrections(days, 50) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/audit/search' && req.method === 'GET') {
      const filter = {
        division: url.searchParams.get('division') || undefined,
        agent: url.searchParams.get('agent') || undefined,
        outcome: url.searchParams.get('outcome') || undefined,
        action: url.searchParams.get('action') || undefined,
        q: url.searchParams.get('q') || undefined,
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
        limit: parseInt(url.searchParams.get('limit') || '200'),
      };
      return new Response(JSON.stringify({ entries: searchAudit(filter), filter }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/spend/detail' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '14');
      return new Response(JSON.stringify(spendDetail(days)), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/spend/models' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '14');
      return new Response(JSON.stringify(spendByModel(days)), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/github/feed' && req.method === 'GET') {
      const data = await githubFeed();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/agents' && req.method === 'GET') {
      return new Response(JSON.stringify({ agents: listAllAgents() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/suggestions' && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const suggestions = await generateSuggestions(body.last_user || '', body.last_reply || '');
      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Portability + backups ----
    if (url.pathname === '/api/atlas/portability' && req.method === 'GET') {
      return new Response(JSON.stringify(portabilityState()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/portability/backup-now' && req.method === 'POST') {
      const r = await backupNow();
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- White paper auto-publish ----
    if (url.pathname === '/api/atlas/whitepaper' && req.method === 'GET') {
      return new Response(JSON.stringify(whitepaperMeta()), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/whitepaper/regenerate' && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = regenerateWhitepaper(body.trigger || 'manual');
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Layer 5b: drift detection ----
    if (url.pathname === '/api/atlas/drift/latest' && req.method === 'GET') {
      const r = getLatestDriftReport();
      if (!r) return new Response(JSON.stringify({ report: null }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify({ report: r }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/drift/run' && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const days = Number.isFinite(body.days) ? body.days : 7;
      const r = analyzeDrift(days);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Layer 5c: Scout (ecosystem discovery) ----
    if (url.pathname === '/api/atlas/scout' && req.method === 'GET') {
      try {
        const candidates = listCandidates();
        const trials = listTrials();
        const sweeps = listSweeps();
        return new Response(JSON.stringify({ candidates, trials, sweeps }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    const scoutGet = url.pathname.match(/^\/api\/atlas\/scout\/([^\/]+)$/);
    if (scoutGet && req.method === 'GET') {
      const c = getCandidate(scoutGet[1]);
      if (!c) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ data: c.data }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const scoutAction = url.pathname.match(/^\/api\/atlas\/scout\/([^\/]+)\/(install|decline|concern)$/);
    if (scoutAction && req.method === 'POST') {
      const id = scoutAction[1];
      const action = scoutAction[2];
      let body: any = {};
      try { body = await req.json(); } catch {}
      const surface = body.surface || 'dashboard';
      const approver = body.approver || 'operator';
      const note = body.note || '';
      let result: { ok: boolean; message: string; install_command?: string };
      if (action === 'install')      result = installCandidate(id, approver, surface);
      else if (action === 'decline') result = declineCandidate(id, approver, surface, note);
      else if (action === 'concern') result = markTrialConcern(id, note || 'unspecified');
      else                            result = { ok: false, message: 'unknown action' };
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/scout/maintenance' && req.method === 'POST') {
      const r = dailyTrialMaintenance();
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Layer 3: inbound webhooks (GitHub / Stripe / ntfy / manual) ----
    if (url.pathname === '/api/atlas/events/inbound/github' && req.method === 'POST') {
      return await handleGitHubWebhook(req);
    }
    if (url.pathname === '/api/atlas/events/inbound/stripe' && req.method === 'POST') {
      return await handleStripeWebhook(req);
    }
    const ntfyMatch = url.pathname.match(/^\/api\/atlas\/events\/inbound\/ntfy\/([^\/]+)$/);
    if (ntfyMatch && req.method === 'POST') {
      return await handleNtfyWebhook(req, decodeURIComponent(ntfyMatch[1]));
    }
    if (url.pathname === '/api/atlas/events/inbound/manual' && req.method === 'POST') {
      const tgChat = req.headers.get('x-telegram-chat-id');
      return await handleManualEvent(req, tgChat);
    }
    // POST /api/atlas/events/dispatch — internal-only, called by the file watcher
    // subprocess and by Scout (Layer 5c). No auth — relies on localhost-only port.
    if (url.pathname === '/api/atlas/events/dispatch' && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const eventType = body.event || '';
      const payload = body.payload || {};
      // atlas-plan retired 2026-05-17 — isPlanEvent/handlePlanEvent interception removed.
      const r = dispatchLocal(eventType, payload);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // /api/atlas/plans/* routes retired 2026-05-17. ProjectView is canonical.
    // Module atlas-plan.ts removed. PlanView.vue + components/plan/ + composables/useAtlasPlans.ts deleted.

    // ============================================================
    // ProjectView ("Plan Page") routes
    // Schema lives in ~/atlas/projects/<slug>/. Module: atlas-projectview.ts.
    // ============================================================

    // GET /api/atlas/projectview — list every project with a ProjectView snapshot.
    if (url.pathname === '/api/atlas/projectview' && req.method === 'GET') {
      return new Response(JSON.stringify({ projects: listProjectViews() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/projectview/:slug — single project's full snapshot.
    const pvGet = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)$/);
    if (pvGet && req.method === 'GET') {
      const pv = readProjectView(pvGet[1]!);
      return new Response(JSON.stringify(pv), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // DELETE /api/atlas/projectview/:slug — archive (move to ~/atlas/.archive/).
    if (pvGet && req.method === 'DELETE') {
      const r = archiveProject(pvGet[1]!);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/scaffold — create WHITEPAPER/GOALS/.atlas/.
    //   body: { one_liner?: string, granularity?: 'coarse'|'fine' }
    const pvScaffold = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/scaffold$/);
    if (pvScaffold && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = scaffoldProject({
        slug: pvScaffold[1]!,
        one_liner: typeof body.one_liner === 'string' ? body.one_liner : undefined,
        granularity: body.granularity === 'fine' ? 'fine' : (body.granularity === 'coarse' ? 'coarse' : undefined),
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // PUT /api/atlas/projectview/:slug/section — replace one WHITEPAPER section.
    //   body: { section: string, body: string }
    const pvSection = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/section$/);
    if (pvSection && req.method === 'PUT') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = writeSection(pvSection[1]!, String(body.section || ''), String(body.body || ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/decision — append a decision.
    //   body: { date?: string, title: string, why: string }
    const pvDec = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/decision$/);
    if (pvDec && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = appendDecision(pvDec[1]!, {
        date: body.date,
        title: String(body.title || ''),
        why: String(body.why || ''),
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/feature — append a ## Features Log bullet.
    //   body: { text: string }
    const pvFeat = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/feature$/);
    if (pvFeat && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = appendFeatureLog(pvFeat[1]!, String(body.text || ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // PUT /api/atlas/projectview/:slug/task — toggle a leaf task done flag.
    //   body: { phase_id, task_id, done }
    const pvTask = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/task$/);
    if (pvTask && req.method === 'PUT') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = setTaskDone(pvTask[1]!, String(body.phase_id || ''), String(body.task_id || ''), !!body.done);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/phase — add a phase.
    //   body: { title }
    const pvPhase = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/phase$/);
    if (pvPhase && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = addPhase(pvPhase[1]!, String(body.title || ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/phase/:phaseId/task — add a task.
    //   body: { title }
    // DELETE /api/atlas/projectview/:slug/phase/:phaseId/task/:taskId
    const pvDelTask = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/phase\/([^\/]+)\/task\/([^\/]+)$/);
    if (pvDelTask && req.method === 'DELETE') {
      const r = deletePhaseTask(pvDelTask[1]!, pvDelTask[2]!, pvDelTask[3]!);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const pvAddTask = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/phase\/([^\/]+)\/task$/);
    if (pvAddTask && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = addTask(pvAddTask[1]!, pvAddTask[2]!, String(body.title || ''), { kanban_card_id: body.kanban_card_id });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // PUT /api/atlas/projectview/:slug/granularity — coarse|fine toggle.
    //   body: { granularity }
    const pvGran = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/granularity$/);
    if (pvGran && req.method === 'PUT') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = setGranularity(pvGran[1]!, body.granularity);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/projectview/:slug/send-to-kanban — push a leaf task to Kanban.
    //   body: { phase_id, task_id, workspace_project_id, model?, mode? }
    const pvSend = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/send-to-kanban$/);
    if (pvSend && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const r = sendTaskToKanban({
        slug: pvSend[1]!,
        phaseId: String(body.phase_id || ''),
        taskId: String(body.task_id || ''),
        workspaceProjectId: String(body.workspace_project_id || ''),
        model: body.model,
        mode: body.mode === 'auto' ? 'auto' : 'safe',
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Lifecycle metadata (Day 1 schema) ----
    const pvType = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/type$/);
    if (pvType && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setProjectType(pvType[1]!, String(body.type || 'UNKNOWN') as any);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvStage = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/stage$/);
    if (pvStage && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setProjectStage(pvStage[1]!, String(body.stage || 'plan') as any);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvMission = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/incubator-mission$/);
    if (pvMission && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setProjectIncubatorMission(pvMission[1]!, body.mission_id || null);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvColor = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/color$/);
    if (pvColor && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setProjectColor(pvColor[1]!, String(body.color || ''));
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Bugs (Day 2) ----
    const pvBugsList = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/bugs$/);
    if (pvBugsList && req.method === 'GET') {
      return new Response(JSON.stringify(readBugs(pvBugsList[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvBugsList && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = appendBug(pvBugsList[1]!, body);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvBugStatus = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/bug\/([^\/]+)\/status$/);
    if (pvBugStatus && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setBugStatus(pvBugStatus[1]!, pvBugStatus[2]!, body.status, { kanban_card_id: body.kanban_card_id, fixed_in_release: body.fixed_in_release });
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Launch checklist (Day 2) ----
    const pvLaunchGet = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch$/);
    if (pvLaunchGet && req.method === 'GET') {
      return new Response(JSON.stringify(readLaunchChecklist(pvLaunchGet[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvLaunchItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/([^\/]+)$/);
    if (pvLaunchItem && req.method === 'PUT' && !['brief', 'plan', 'date', 'channels', 'assets', 'audience', 'gates', 'target-url', 'risks', 'metrics', 'retro'].includes(pvLaunchItem[2]!)) {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setLaunchItem(pvLaunchItem[1]!, pvLaunchItem[2]!, !!body.done);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Launch brief + AI plan + launch date ----
    const SAFE_LAUNCH_SLUG = (s: string) => !!s && !s.includes('/') && !s.includes('..') && !s.includes('\0');

    const pvBrief = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/brief$/);
    if (pvBrief && req.method === 'GET') {
      const slug = pvBrief[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(readBrief(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvBrief && req.method === 'PUT') {
      const slug = pvBrief[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      const content = typeof body.content === 'string' ? body.content : '';
      if (Buffer.byteLength(content, 'utf8') > 50 * 1024) {
        return new Response(JSON.stringify({ ok: false, error: 'brief too large (>50KB)' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const r = writeBrief(slug, content);
      console.log(`[launch.brief] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvPlan = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/plan$/);
    if (pvPlan && req.method === 'GET') {
      const slug = pvPlan[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(readPlan(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvPlanGen = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/plan\/generate$/);
    if (pvPlanGen && req.method === 'POST') {
      const slug = pvPlanGen[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = await generatePlan(slug);
      let status = 200;
      if (!r.ok) status = r.error === 'ANTHROPIC_API_KEY not configured' ? 503 : 400;
      console.log(`[launch.plan.generate] slug=${slug} status=${status}`);
      return new Response(JSON.stringify(r), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvPlanItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/plan\/([^\/]+)$/);
    if (pvPlanItem && req.method === 'PUT') {
      const slug = pvPlanItem[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = togglePlanItem(slug, pvPlanItem[2]!, !!body.done);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvLaunchDate = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/date$/);
    if (pvLaunchDate && req.method === 'GET') {
      const slug = pvLaunchDate[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(readLaunchDate(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvLaunchDate && req.method === 'PUT') {
      const slug = pvLaunchDate[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      const iso = body.iso_date;
      const valid = iso === null || (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso));
      if (!valid) return new Response(JSON.stringify({ ok: false, error: 'iso_date must be YYYY-MM-DD or null' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = writeLaunchDate(slug, iso);
      console.log(`[launch.date] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Launch Phase 2: channels / assets / audience ----
    const MAX_LAUNCH_BODY = 20 * 1024;
    const MAX_TEXT_FIELD = 10 * 1024;
    const isValidUrl = (s: any): boolean =>
      typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'));
    const tooBig = (req: Request, body: any): boolean => {
      try { return Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_LAUNCH_BODY; } catch { return false; }
    };
    const isChannelId = (s: string): s is LaunchChannelId => LAUNCH_CHANNELS.some(c => c.id === s);
    const isAssetKind = (s: string): s is LaunchAssetKindId => LAUNCH_ASSET_KINDS.some(k => k.id === s);
    const AUDIENCE_ID_RE = /^[a-z0-9-]{8,64}$/i;
    const ALLOWED_AUDIENCE_CHANNELS = new Set<string>([...LAUNCH_CHANNELS.map(c => c.id), 'other']);
    const ALLOWED_AUDIENCE_STATUS = new Set<AudienceStatus>(['queued', 'contacted', 'replied', 'posted', 'ignored']);
    const ALLOWED_CHANNEL_STATUS = new Set<ChannelStatus>(['draft', 'scheduled', 'posted']);
    const ALLOWED_ASSET_STATUS = new Set<AssetStatus>(['missing', 'ready', 'not_needed']);

    // Channels
    const pvChannels = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/channels$/);
    if (pvChannels && req.method === 'GET') {
      const slug = pvChannels[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(readChannels(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvChannelItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/channels\/([^\/]+)$/);
    if (pvChannelItem && req.method === 'PUT') {
      const slug = pvChannelItem[1]!;
      const channelId = pvChannelItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isChannelId(channelId)) return new Response(JSON.stringify({ ok: false, error: 'unknown channel' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Omit<PVChannelRow, 'channel_id' | 'updated_at'>> = {};
      if (body.status !== undefined) {
        if (!ALLOWED_CHANNEL_STATUS.has(body.status)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.status = body.status;
      }
      if (body.draft !== undefined) {
        if (typeof body.draft !== 'string') return new Response(JSON.stringify({ ok: false, error: 'draft must be string' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.draft, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'draft too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.draft = body.draft;
      }
      if (body.scheduled_for !== undefined) {
        if (body.scheduled_for !== null && typeof body.scheduled_for !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad scheduled_for' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.scheduled_for = body.scheduled_for;
      }
      if (body.posted_url !== undefined) {
        if (body.posted_url !== null && !isValidUrl(body.posted_url)) return new Response(JSON.stringify({ ok: false, error: 'bad url' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.posted_url = body.posted_url;
      }
      const r = upsertChannel(slug, channelId, patch);
      console.log(`[launch.channels] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvChannelGen = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/channels\/([^\/]+)\/generate$/);
    if (pvChannelGen && req.method === 'POST') {
      const slug = pvChannelGen[1]!;
      const channelId = pvChannelGen[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isChannelId(channelId)) return new Response(JSON.stringify({ ok: false, error: 'unknown channel' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = await generateChannelDraft(slug, channelId);
      let status = 200;
      if (!r.ok) status = r.error === 'ANTHROPIC_API_KEY not configured' ? 503 : 400;
      console.log(`[launch.channels.generate] slug=${slug} status=${status}`);
      return new Response(JSON.stringify(r), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // Assets
    const pvAssets = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/assets$/);
    if (pvAssets && req.method === 'GET') {
      const slug = pvAssets[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(readAssets(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvAssetItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/assets\/([^\/]+)$/);
    if (pvAssetItem && req.method === 'PUT') {
      const slug = pvAssetItem[1]!;
      const kind = pvAssetItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isAssetKind(kind)) return new Response(JSON.stringify({ ok: false, error: 'unknown kind' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Omit<PVAssetRow, 'kind' | 'updated_at'>> = {};
      if (body.status !== undefined) {
        if (!ALLOWED_ASSET_STATUS.has(body.status)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.status = body.status;
      }
      if (body.url !== undefined) {
        if (body.url !== null && !isValidUrl(body.url)) return new Response(JSON.stringify({ ok: false, error: 'bad url' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.url = body.url;
      }
      if (body.notes !== undefined) {
        if (body.notes !== null && typeof body.notes !== 'string') return new Response(JSON.stringify({ ok: false, error: 'notes must be string or null' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.notes === 'string' && Buffer.byteLength(body.notes, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'notes too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.notes = body.notes;
      }
      const r = upsertAsset(slug, kind, patch);
      console.log(`[launch.assets] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // Audience
    const pvAudienceList = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/audience$/);
    if (pvAudienceList && req.method === 'GET') {
      const slug = pvAudienceList[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(listAudience(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvAudienceList && req.method === 'POST') {
      const slug = pvAudienceList[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.name !== 'string' || !body.name.trim()) return new Response(JSON.stringify({ ok: false, error: 'name required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.channel !== 'string' || !ALLOWED_AUDIENCE_CHANNELS.has(body.channel)) return new Response(JSON.stringify({ ok: false, error: 'bad channel' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.status !== 'string' || !ALLOWED_AUDIENCE_STATUS.has(body.status as AudienceStatus)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (body.handle != null && typeof body.handle !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad handle' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (body.relationship != null && typeof body.relationship !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad relationship' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (body.notes != null) {
        if (typeof body.notes !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad notes' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.notes, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'notes too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const r = addAudience(slug, {
        name: body.name,
        handle: body.handle ?? null,
        channel: body.channel,
        relationship: body.relationship ?? null,
        status: body.status,
        notes: body.notes ?? null,
      });
      console.log(`[launch.audience] POST slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvAudienceItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/audience\/([^\/]+)$/);
    if (pvAudienceItem && req.method === 'PUT') {
      const slug = pvAudienceItem[1]!;
      const id = pvAudienceItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!AUDIENCE_ID_RE.test(id)) return new Response(JSON.stringify({ ok: false, error: 'bad id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Omit<PVAudienceRow, 'id' | 'created_at'>> = {};
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) return new Response(JSON.stringify({ ok: false, error: 'bad name' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.name = body.name;
      }
      if (body.channel !== undefined) {
        if (typeof body.channel !== 'string' || !ALLOWED_AUDIENCE_CHANNELS.has(body.channel)) return new Response(JSON.stringify({ ok: false, error: 'bad channel' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.channel = body.channel as LaunchChannelId | 'other';
      }
      if (body.status !== undefined) {
        if (!ALLOWED_AUDIENCE_STATUS.has(body.status)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.status = body.status;
      }
      if (body.handle !== undefined) {
        if (body.handle !== null && typeof body.handle !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad handle' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.handle = body.handle;
      }
      if (body.relationship !== undefined) {
        if (body.relationship !== null && typeof body.relationship !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad relationship' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.relationship = body.relationship;
      }
      if (body.notes !== undefined) {
        if (body.notes !== null && typeof body.notes !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad notes' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.notes === 'string' && Buffer.byteLength(body.notes, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'notes too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.notes = body.notes;
      }
      const r = updateAudience(slug, id, patch);
      console.log(`[launch.audience] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvAudienceItem && req.method === 'DELETE') {
      const slug = pvAudienceItem[1]!;
      const id = pvAudienceItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!AUDIENCE_ID_RE.test(id)) return new Response(JSON.stringify({ ok: false, error: 'bad id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = removeAudience(slug, id);
      console.log(`[launch.audience] DELETE slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Launch validation gates (Phase 3) ----
    const ALLOWED_GATE_STATUS = new Set<GateStatus>(['unknown', 'passing', 'failing', 'not_applicable']);
    const isGateId = (s: string): boolean => LAUNCH_GATES_SEED.some(g => g.id === s);
    const isHttpUrl = (s: any): boolean =>
      typeof s === 'string' && /^https?:\/\//.test(s) && Buffer.byteLength(s, 'utf8') <= 2048;

    const pvGates = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/gates$/);
    if (pvGates && req.method === 'GET') {
      const slug = pvGates[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      console.log(`[launch.gates] GET slug=${slug} status=200`);
      return new Response(JSON.stringify(readGates(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvGateItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/gates\/([^\/]+)$/);
    if (pvGateItem && req.method === 'PUT') {
      const slug = pvGateItem[1]!;
      const gateId = pvGateItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isGateId(gateId)) return new Response(JSON.stringify({ ok: false, error: 'unknown gate' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Omit<PVGateRow, 'id' | 'label' | 'kind'>> = {};
      if (body.auto_check_enabled !== undefined) {
        if (typeof body.auto_check_enabled !== 'boolean') return new Response(JSON.stringify({ ok: false, error: 'bad auto_check_enabled' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.auto_check_enabled = body.auto_check_enabled;
      }
      if (body.status !== undefined) {
        if (!ALLOWED_GATE_STATUS.has(body.status)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.status = body.status;
      }
      if (body.manual_override_status !== undefined) {
        if (body.manual_override_status !== null && !ALLOWED_GATE_STATUS.has(body.manual_override_status)) return new Response(JSON.stringify({ ok: false, error: 'bad manual_override_status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.manual_override_status = body.manual_override_status;
      }
      if (body.notes !== undefined) {
        if (body.notes !== null && typeof body.notes !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad notes' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.notes === 'string' && Buffer.byteLength(body.notes, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'notes too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.notes = body.notes;
      }
      if (body.last_checked_at !== undefined) {
        if (body.last_checked_at !== null && typeof body.last_checked_at !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad last_checked_at' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.last_checked_at = body.last_checked_at;
      }
      if (body.last_result_msg !== undefined) {
        if (body.last_result_msg !== null && typeof body.last_result_msg !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad last_result_msg' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.last_result_msg = body.last_result_msg;
      }
      const r = upsertGate(slug, gateId, patch);
      console.log(`[launch.gates] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvGateCheck = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/gates\/([^\/]+)\/check$/);
    if (pvGateCheck && req.method === 'POST') {
      const slug = pvGateCheck[1]!;
      const gateId = pvGateCheck[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isGateId(gateId)) return new Response(JSON.stringify({ ok: false, error: 'unknown gate' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = await checkGate(slug, gateId);
      console.log(`[launch.gates] POST check slug=${slug} status=200`);
      return new Response(JSON.stringify(r), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvGateCheckAll = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/gates\/check-all$/);
    if (pvGateCheckAll && req.method === 'POST') {
      const slug = pvGateCheckAll[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = await checkAllAutoGates(slug);
      console.log(`[launch.gates] POST check-all slug=${slug} status=200`);
      return new Response(JSON.stringify(r), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvTargetUrl = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/target-url$/);
    if (pvTargetUrl && req.method === 'PUT') {
      const slug = pvTargetUrl[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const t = body?.target_url;
      if (t !== null && !isHttpUrl(t)) return new Response(JSON.stringify({ ok: false, error: 'bad target_url' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = setLaunchTargetUrl(slug, t);
      console.log(`[launch.gates] PUT target-url slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Launch Phase 3b: risks / metrics / retro ----
    const RISK_ID_RE = /^[a-z0-9-]{8,64}$/i;
    const ALLOWED_RISK_SEVERITY = new Set<RiskSeverity>(['low', 'med', 'high']);
    const ALLOWED_RISK_STATUS = new Set<RiskStatus>(['open', 'mitigated', 'accepted']);
    const isMetricId = (s: string): boolean => LAUNCH_METRICS_SEED.some(m => m.id === s);
    const MAX_RETRO_BODY = 50 * 1024;

    // Risks
    const pvRiskList = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/risks$/);
    if (pvRiskList && req.method === 'GET') {
      const slug = pvRiskList[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      console.log(`[launch.risks] GET slug=${slug} status=200`);
      return new Response(JSON.stringify(listRisks(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvRiskList && req.method === 'POST') {
      const slug = pvRiskList[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.question !== 'string' || !body.question.trim()) return new Response(JSON.stringify({ ok: false, error: 'question required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (Buffer.byteLength(body.question, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'question too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.severity !== 'string' || !ALLOWED_RISK_SEVERITY.has(body.severity as RiskSeverity)) return new Response(JSON.stringify({ ok: false, error: 'bad severity' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (typeof body.status !== 'string' || !ALLOWED_RISK_STATUS.has(body.status as RiskStatus)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (body.owner != null) {
        if (typeof body.owner !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad owner' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.owner, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'owner too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      if (body.mitigation != null) {
        if (typeof body.mitigation !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad mitigation' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.mitigation, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'mitigation too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      if (body.on_call != null) {
        if (typeof body.on_call !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad on_call' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.on_call, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'on_call too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const r = addRisk(slug, {
        question: body.question,
        owner: body.owner ?? null,
        mitigation: body.mitigation ?? null,
        on_call: body.on_call ?? null,
        severity: body.severity,
        status: body.status,
      });
      console.log(`[launch.risks] POST slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvRiskItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/risks\/([^\/]+)$/);
    if (pvRiskItem && req.method === 'PUT') {
      const slug = pvRiskItem[1]!;
      const id = pvRiskItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!RISK_ID_RE.test(id)) return new Response(JSON.stringify({ ok: false, error: 'bad id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Omit<PVRiskRow, 'id' | 'created_at'>> = {};
      if (body.question !== undefined) {
        if (typeof body.question !== 'string' || !body.question.trim()) return new Response(JSON.stringify({ ok: false, error: 'bad question' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.question, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'question too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.question = body.question;
      }
      if (body.severity !== undefined) {
        if (!ALLOWED_RISK_SEVERITY.has(body.severity)) return new Response(JSON.stringify({ ok: false, error: 'bad severity' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.severity = body.severity;
      }
      if (body.status !== undefined) {
        if (!ALLOWED_RISK_STATUS.has(body.status)) return new Response(JSON.stringify({ ok: false, error: 'bad status' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.status = body.status;
      }
      if (body.owner !== undefined) {
        if (body.owner !== null && typeof body.owner !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad owner' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.owner === 'string' && Buffer.byteLength(body.owner, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'owner too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.owner = body.owner;
      }
      if (body.mitigation !== undefined) {
        if (body.mitigation !== null && typeof body.mitigation !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad mitigation' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.mitigation === 'string' && Buffer.byteLength(body.mitigation, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'mitigation too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.mitigation = body.mitigation;
      }
      if (body.on_call !== undefined) {
        if (body.on_call !== null && typeof body.on_call !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad on_call' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.on_call === 'string' && Buffer.byteLength(body.on_call, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'on_call too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.on_call = body.on_call;
      }
      const r = updateRisk(slug, id, patch);
      console.log(`[launch.risks] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvRiskItem && req.method === 'DELETE') {
      const slug = pvRiskItem[1]!;
      const id = pvRiskItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!RISK_ID_RE.test(id)) return new Response(JSON.stringify({ ok: false, error: 'bad id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = removeRisk(slug, id);
      console.log(`[launch.risks] DELETE slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // Metrics
    const pvMetrics = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/metrics$/);
    if (pvMetrics && req.method === 'GET') {
      const slug = pvMetrics[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      console.log(`[launch.metrics] GET slug=${slug} status=200`);
      return new Response(JSON.stringify(readMetrics(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvMetricItem = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/metrics\/([^\/]+)$/);
    if (pvMetricItem && req.method === 'PUT') {
      const slug = pvMetricItem[1]!;
      const id = pvMetricItem[2]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!isMetricId(id)) return new Response(JSON.stringify({ ok: false, error: 'unknown metric' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      if (tooBig(req, body)) return new Response(JSON.stringify({ ok: false, error: 'body too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      const patch: Partial<Pick<PVMetricRow, 'label' | 'value' | 'notes'>> = {};
      if (body.label !== undefined) {
        if (typeof body.label !== 'string' || !body.label.trim()) return new Response(JSON.stringify({ ok: false, error: 'bad label' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (Buffer.byteLength(body.label, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'label too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.label = body.label;
      }
      if (body.value !== undefined) {
        if (body.value !== null && (typeof body.value !== 'number' || !Number.isFinite(body.value))) return new Response(JSON.stringify({ ok: false, error: 'bad value' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.value = body.value;
      }
      if (body.notes !== undefined) {
        if (body.notes !== null && typeof body.notes !== 'string') return new Response(JSON.stringify({ ok: false, error: 'bad notes' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
        if (typeof body.notes === 'string' && Buffer.byteLength(body.notes, 'utf8') > MAX_TEXT_FIELD) return new Response(JSON.stringify({ ok: false, error: 'notes too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
        patch.notes = body.notes;
      }
      const r = upsertMetric(slug, id, patch);
      console.log(`[launch.metrics] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // Retro
    const pvRetro = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/retro$/);
    if (pvRetro && req.method === 'GET') {
      const slug = pvRetro[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      console.log(`[launch.retro] GET slug=${slug} status=200`);
      return new Response(JSON.stringify(readRetro(slug)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (pvRetro && req.method === 'PUT') {
      const slug = pvRetro[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      let body: any = {}; try { body = await req.json(); } catch {}
      const content = typeof body.content === 'string' ? body.content : '';
      if (Buffer.byteLength(content, 'utf8') > MAX_RETRO_BODY) {
        return new Response(JSON.stringify({ ok: false, error: 'retro too large (>50KB)' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const r = writeRetro(slug, content);
      console.log(`[launch.retro] PUT slug=${slug} status=${r.ok ? 200 : 400}`);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const pvRetroGen = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/launch\/retro\/generate$/);
    if (pvRetroGen && req.method === 'POST') {
      const slug = pvRetroGen[1]!;
      if (!SAFE_LAUNCH_SLUG(slug)) return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      const r = await generateRetro(slug);
      let status = 200;
      if (!r.ok) status = r.error === 'ANTHROPIC_API_KEY not configured' ? 503 : 400;
      console.log(`[launch.retro.generate] slug=${slug} status=${status}`);
      return new Response(JSON.stringify(r), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Releases + Health (Day 3) ----
    const pvReleases = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/releases$/);
    if (pvReleases && req.method === 'GET') {
      return new Response(JSON.stringify(readReleases(pvReleases[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvHealth = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/health$/);
    if (pvHealth && req.method === 'GET') {
      return new Response(JSON.stringify(readHealth(pvHealth[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvBranches = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/branches$/);
    if (pvBranches && req.method === 'GET') {
      return new Response(JSON.stringify(readBranches(pvBranches[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Briefs (weekly per-project brief) ----
    const pvBriefList = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/briefs$/);
    if (pvBriefList && req.method === 'GET') {
      return new Response(JSON.stringify(listBriefs(pvBriefList[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvBriefGen = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/briefs\/generate$/);
    if (pvBriefGen && req.method === 'POST') {
      const r = generateBrief(pvBriefGen[1]!);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Industry briefs (vertical-market briefing — about the industry, not the project) ----
    const pvIndBriefList = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/industry-briefs$/);
    if (pvIndBriefList && req.method === 'GET') {
      return new Response(JSON.stringify(listIndustryBriefs(pvIndBriefList[1]!)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const pvIndBriefGen = url.pathname.match(/^\/api\/atlas\/projectview\/([^\/]+)\/industry-briefs\/generate$/);
    if (pvIndBriefGen && req.method === 'POST') {
      const r = await generateIndustryBrief(pvIndBriefGen[1]!);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Ideas (standalone ideation, fast-track to Plan) ----
    if (url.pathname === '/api/atlas/ideas' && req.method === 'GET') {
      return new Response(JSON.stringify({ ideas: listIdeas() }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/api/atlas/ideas' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = createIdea({ slug: String(body.slug || ''), title: String(body.title || '') });
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const ideaGet = url.pathname.match(/^\/api\/atlas\/ideas\/([^\/]+)$/);
    if (ideaGet && req.method === 'GET') {
      const idea = readIdea(ideaGet[1]!);
      return new Response(JSON.stringify(idea || { error: 'not found' }), { status: idea ? 200 : 404, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (ideaGet && req.method === 'DELETE') {
      const r = deleteIdea(ideaGet[1]!);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const ideaMsg = url.pathname.match(/^\/api\/atlas\/ideas\/([^\/]+)\/message$/);
    if (ideaMsg && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = await appendUserMessageAndReply(ideaMsg[1]!, String(body.message || ''));
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const ideaDossier = url.pathname.match(/^\/api\/atlas\/ideas\/([^\/]+)\/dossier$/);
    if (ideaDossier && req.method === 'POST') {
      const r = await generateDossier(ideaDossier[1]!);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const ideaPromote = url.pathname.match(/^\/api\/atlas\/ideas\/([^\/]+)\/promote$/);
    if (ideaPromote && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = promoteIdeaToProject({ idea_slug: ideaPromote[1]!, project_slug: String(body.project_slug || '') });
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // ---- Incubator mission → project promotion ----
    if (url.pathname === '/api/atlas/incubator/promote' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = promoteMissionToProject({
        mission_id: String(body.mission_id || ''),
        slug: String(body.slug || ''),
        name: body.name,
        type: body.type,
      });
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    const incMission = url.pathname.match(/^\/api\/atlas\/incubator\/mission\/([^\/]+)$/);
    if (incMission && req.method === 'GET') {
      const m = readIncubatorMission(incMission[1]!);
      return new Response(JSON.stringify(m || { error: 'not found' }), { status: m ? 200 : 404, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // POST /api/atlas/projectview/sync/:cardId — reconcile a Kanban card →
    // any matching ProjectView task (workspace status change hook).
    const pvSync = url.pathname.match(/^\/api\/atlas\/projectview\/sync\/([^\/]+)$/);
    if (pvSync && req.method === 'POST') {
      const r = reconcileKanbanCard(pvSync[1]!);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Layer 4: Today queue ----
    // GET /api/atlas/today — ranked queue + completed-today + (optional) deferred
    if (url.pathname === '/api/atlas/today' && req.method === 'GET') {
      try {
        const includeDeferred = url.searchParams.get('deferred') === '1';
        const data = getToday({ includeDeferred });
        return new Response(JSON.stringify(data), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/atlas/today/digest — terse Telegram-format string
    if (url.pathname === '/api/atlas/today/digest' && req.method === 'GET') {
      const digest = renderTelegramDigest();
      return new Response(JSON.stringify({ digest }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/today/add — operator adds a free-text item
    if (url.pathname === '/api/atlas/today/add' && req.method === 'POST') {
      let body: any = {};
      try { body = await req.json(); } catch {}
      const text = body.text || body.message || '';
      const urgency = body.urgency || 'green';
      const surface = body.surface || 'unknown';
      const r = addOperatorItem(text, urgency, surface);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/today/archive — manual trigger for the midnight job
    if (url.pathname === '/api/atlas/today/archive' && req.method === 'POST') {
      const r = archiveDoneAndRefresh();
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/today/:id/{approve,reject,defer,done,pin}
    const todayAction = url.pathname.match(/^\/api\/atlas\/today\/([^\/]+)\/(approve|reject|defer|done|pin)$/);
    if (todayAction && req.method === 'POST') {
      const id = todayAction[1];
      const action = todayAction[2];
      let body: any = {};
      try { body = await req.json(); } catch {}
      const surface = body.surface || 'dashboard';
      const note = body.note || '';
      let result: { ok: boolean; message: string };
      if (action === 'approve')     result = approveItem(id, surface);
      else if (action === 'reject') result = rejectItem(id, surface, note);
      else if (action === 'defer')  result = deferItem(id, surface);
      else if (action === 'done')   result = markDone(id, surface);
      else if (action === 'pin')    result = pinItem(id, surface);
      else                          result = { ok: false, message: 'unknown action' };
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/proposals/:id/{approve,reject,defer,rollback}
    const propAction = url.pathname.match(/^\/api\/atlas\/proposals\/([^\/]+)\/(approve|reject|defer|rollback)$/);
    if (propAction && req.method === 'POST') {
      const id = propAction[1];
      const action = propAction[2] as 'approve' | 'reject' | 'defer' | 'rollback';
      let body: any = {};
      try { body = await req.json(); } catch {}
      const surface = body.surface || 'dashboard';
      const approver = body.approver || 'operator';
      const note = body.note || '';
      let result: { ok: boolean; message: string; applied_path?: string };
      if (action === 'approve')      result = approveProposal(id, approver, surface);
      else if (action === 'reject')  result = rejectProposal(id, approver, surface, note);
      else if (action === 'defer')   result = deferProposal(id, approver, surface);
      else if (action === 'rollback') result = rollbackProposal(id, approver, surface);
      else                            result = { ok: false, message: 'unknown action' };
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/scheduler/{retry,abandon}/:division/:jobId — Layer 5c
    const schedOp = url.pathname.match(/^\/api\/atlas\/scheduler\/(retry|abandon)\/([^\/]+)\/([^\/]+)$/);
    if (schedOp && req.method === 'POST') {
      const op = schedOp[1] as 'retry' | 'abandon';
      const division = decodeURIComponent(schedOp[2]);
      const jobId = decodeURIComponent(schedOp[3]);
      let body: any = {};
      try { body = await req.json(); } catch {}
      const approver = body.approver || 'operator';
      const surface = body.surface || 'dashboard';
      const result = op === 'retry'
        ? retryScheduledJob(division, jobId, approver, surface)
        : abandonScheduledJob(division, jobId, approver, surface);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/atlas/tauri/rebuild — fire the rebuild script. Idempotent: the script
    // self-checks staleness + holds a single-flight lock, so spamming the button is safe.
    if (url.pathname === '/api/atlas/tauri/rebuild' && req.method === 'POST') {
      try {
        const { spawn } = require('child_process');
        const proc = spawn('/Users/hrmacnair/atlas/scripts/rebuild-tauri-workspace.sh', [], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, TAURI_REBUILD_FORCE: '1' },
        });
        proc.unref();
        return new Response(JSON.stringify({ ok: true, building: true }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message || 'spawn failed' }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /api/atlas/tauri/status — { building: bool }
    if (url.pathname === '/api/atlas/tauri/status' && req.method === 'GET') {
      const fs = require('fs');
      const lockPath = '/Users/hrmacnair/atlas/projects/bridgespace/.tauri-autorebuild.lock';
      let building = false;
      try {
        if (fs.existsSync(lockPath)) {
          const pid = parseInt((fs.readFileSync(lockPath, 'utf8') || '').trim(), 10);
          if (Number.isFinite(pid) && pid > 0) {
            try { process.kill(pid, 0); building = true; } catch { building = false; }
          }
        }
      } catch {}
      return new Response(JSON.stringify({ building }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/usage — rolling 5h/7d subscription burn + 24h OpenAI spend + sparkline
    if (url.pathname === '/api/atlas/llm/usage' && req.method === 'GET') {
      const usage = getWorkspaceLLMUsage();
      return new Response(JSON.stringify(usage), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/providers?project_id=...  list providers + active state
    if (url.pathname === '/api/atlas/llm/providers' && req.method === 'GET') {
      const projectId = url.searchParams.get('project_id') || undefined;
      const data = getProvidersStatus({ projectId });
      return new Response(JSON.stringify(data), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/custom-providers
    if (url.pathname === '/api/atlas/llm/custom-providers' && req.method === 'GET') {
      return new Response(JSON.stringify({ providers: listCustomProviders() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // POST /api/atlas/llm/custom-providers  body: { id, name, baseUrl, models }
    if (url.pathname === '/api/atlas/llm/custom-providers' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = addCustomProvider({
        id: String(body.id || ''),
        name: String(body.name || ''),
        baseUrl: String(body.baseUrl || ''),
        models: Array.isArray(body.models) ? body.models : [],
        letter: body.letter,
        color: body.color,
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // DELETE /api/atlas/llm/custom-providers/:id
    const customDel = url.pathname.match(/^\/api\/atlas\/llm\/custom-providers\/([a-z0-9_-]+)$/);
    if (customDel && req.method === 'DELETE') {
      const r = removeCustomProvider(customDel[1]!);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/keys/:provider  body: { key }
    // DELETE /api/atlas/llm/keys/:provider
    // :provider can be a builtin (anthropic|openai|...) OR custom-provider id.
    const llmKey = url.pathname.match(/^\/api\/atlas\/llm\/keys\/([a-z0-9_-]+)$/);
    if (llmKey && (req.method === 'POST' || req.method === 'DELETE')) {
      const providerId = llmKey[1]!;
      const isBuiltin = ['anthropic', 'openai', 'ollama', 'google', 'xai'].includes(providerId);
      let r: { ok: boolean; error?: string };
      if (req.method === 'POST') {
        let body: any = {}; try { body = await req.json(); } catch {}
        const key = (body.key || '').toString();
        if (!key) {
          return new Response(JSON.stringify({ ok: false, error: 'missing key' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        r = isBuiltin ? setLLMApiKey(providerId as ProviderId, key) : setCustomApiKey(providerId, key);
      } else {
        r = isBuiltin
          ? clearLLMApiKey(providerId as ProviderId)
          : clearCustomApiKey(providerId);
      }
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/auto-switch  body: { enabled }
    if (url.pathname === '/api/atlas/llm/auto-switch' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setLLMAutoSwitch(!!body.enabled);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/active  body: { provider, model, project_id? }
    if (url.pathname === '/api/atlas/llm/active' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setLLMActive({
        provider: body.provider,
        model: body.model,
        projectId: body.project_id,
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // DELETE /api/atlas/llm/active/project/:id  → clear per-project override
    const llmProjectClear = url.pathname.match(/^\/api\/atlas\/llm\/active\/project\/([^\/]+)$/);
    if (llmProjectClear && req.method === 'DELETE') {
      const r = clearLLMProjectActive(llmProjectClear[1]);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/key-urls — { provider_id: signup_url } so the modal
    // can render a "Get key" deep-link.
    if (url.pathname === '/api/atlas/llm/key-urls' && req.method === 'GET') {
      return new Response(JSON.stringify({ urls: PROVIDER_KEY_URLS }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/keys/:provider/test — live-ping provider with the
    // stored key. No body. Used by the "Test connection" button.
    const llmKeyTest = url.pathname.match(/^\/api\/atlas\/llm\/keys\/([a-z0-9_-]+)\/test$/);
    if (llmKeyTest && req.method === 'POST') {
      const r = await testProviderKey(llmKeyTest[1]!);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/keys/:provider/validate  body: { key } — non-mutating
    // format hint so the UI can warn before saving a malformed key.
    const llmKeyValidate = url.pathname.match(/^\/api\/atlas\/llm\/keys\/([a-z0-9_-]+)\/validate$/);
    if (llmKeyValidate && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = validateKeyFormat(llmKeyValidate[1]!, String(body.key || ''));
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/ollama/installed — list models present on disk
    if (url.pathname === '/api/atlas/llm/ollama/installed' && req.method === 'GET') {
      return new Response(JSON.stringify({ models: getOllamaInstalledModelIds(true) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/llm/ollama/pull  body: { name } — kick off `ollama pull <name>`
    if (url.pathname === '/api/atlas/llm/ollama/pull' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = startOllamaPull(String(body.name || ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/ollama/pulls — list active + recently finished pulls
    if (url.pathname === '/api/atlas/llm/ollama/pulls' && req.method === 'GET') {
      return new Response(JSON.stringify({ jobs: listOllamaPullJobs() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/llm/ollama/pull/:name — single-job status (for tight polling)
    const pullStatus = url.pathname.match(/^\/api\/atlas\/llm\/ollama\/pull\/([A-Za-z0-9._\/:\-]+)$/);
    if (pullStatus && req.method === 'GET') {
      const job = getOllamaPullJob(decodeURIComponent(pullStatus[1]!));
      if (!job) return new Response(JSON.stringify({ ok: false, error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      const flat = (job.output || '').replace(/\r/g, '\n');
      const trimmed = flat.split('\n').filter(l => l.trim());
      let pct: number | null = null;
      for (let i = trimmed.length - 1; i >= 0; i--) {
        const m = trimmed[i]?.match(/(\d{1,3})%/);
        if (m) { pct = parseInt(m[1]!, 10); break; }
      }
      return new Response(JSON.stringify({
        ok: true,
        name: job.name,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        progress: trimmed.slice(-3).join('\n'),
        percent: pct,
      }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // DELETE /api/atlas/llm/ollama/:name — uninstall model (ollama rm)
    const ollamaRm = url.pathname.match(/^\/api\/atlas\/llm\/ollama\/([A-Za-z0-9._\/:\-]+)$/);
    if (ollamaRm && req.method === 'DELETE') {
      const r = removeOllamaModel(decodeURIComponent(ollamaRm[1]!));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/launchd — list all com.atlas.* launchd jobs with pid/state
    if (url.pathname === '/api/atlas/launchd' && req.method === 'GET') {
      const jobs = listLaunchdJobs();
      return new Response(JSON.stringify({ jobs }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/atlas/launchd/stop-all — unload every non-protected job
    if (url.pathname === '/api/atlas/launchd/stop-all' && req.method === 'POST') {
      const result = stopAllLaunchdJobs();
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 207,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/atlas/launchd/start-all — load every job
    if (url.pathname === '/api/atlas/launchd/start-all' && req.method === 'POST') {
      const result = startAllLaunchdJobs();
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 207,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/atlas/launchd/:label/(start|stop) — single job
    const launchdOp = url.pathname.match(/^\/api\/atlas\/launchd\/(com\.atlas\.[a-z0-9\-]+)\/(start|stop)$/i);
    if (launchdOp && req.method === 'POST') {
      const label = launchdOp[1];
      const op = launchdOp[2] as 'start' | 'stop';
      const result = op === 'start' ? startLaunchdJob(label) : stopLaunchdJob(label);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/atlas/proposals/:id/edit — operator submits new YAML body
    const propEditAction = url.pathname.match(/^\/api\/atlas\/proposals\/([^\/]+)\/edit$/);
    if (propEditAction && req.method === 'POST') {
      const id = propEditAction[1];
      let body: any = {};
      try { body = await req.json(); } catch {}
      const yamlText = (body.yaml || body.body || '').toString();
      if (!yamlText.trim()) {
        return new Response(JSON.stringify({ ok: false, message: 'missing yaml field in body' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }
      const result = editProposal(id, yamlText, body.approver || 'operator', body.surface || 'dashboard');
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // GET /api/atlas/briefs - walk ~/atlas/briefs/archive/<date>/<slug>.html
    if (url.pathname === '/api/atlas/briefs' && req.method === 'GET') {
      const briefs = await getAtlasBriefs();
      return new Response(JSON.stringify({ briefs }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/brief/today | /api/atlas/briefs/today - today's brief(s) inline
    if ((url.pathname === '/api/atlas/brief/today' || url.pathname === '/api/atlas/briefs/today') && req.method === 'GET') {
      const data = await getTodaysBriefs();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/events/recent - HTTP fallback for Live Activity initial load
    if (url.pathname === '/api/atlas/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify({ events }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/briefs/file?path=... - proxy a brief HTML for iframe (CORS-safe)
    if (url.pathname === '/api/atlas/briefs/file' && req.method === 'GET') {
      const filePath = url.searchParams.get('path') || '';
      if (!filePath.startsWith('/Users/hrmacnair/atlas/briefs/archive/')) {
        return new Response('forbidden', { status: 403, headers });
      }
      try {
        const html = await Bun.file(filePath).text();
        return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      } catch (err: any) {
        return new Response(`not found: ${err.message}`, { status: 404, headers });
      }
    }

    // POST /api/atlas/talk - route + spawn model, return reply.
    // Accepts multipart/form-data with optional 'files' (up to 5, ≤10 MB each)
    // or JSON { message } for the no-attachment path.
    if (url.pathname === '/api/atlas/talk' && req.method === 'POST') {
      const rl = rateLimit('talk', 30, 60 * 1000);
      if (!rl.ok) {
        return new Response(JSON.stringify({ error: 'rate limit (30/min)', retry_after_ms: rl.retry_after_ms }), {
          status: 429, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      try {
        const contentType = req.headers.get('content-type') || '';
        let message = '';
        let savedFiles: SavedFile[] = [];

        let forceModel: string | undefined;
        let priorTurns: any[] = [];
        if (contentType.includes('multipart/form-data')) {
          const form = await req.formData();
          message = String(form.get('message') || '').trim();
          forceModel = (form.get('forceModel') as string) || undefined;
          const ptRaw = form.get('priorTurns');
          if (typeof ptRaw === 'string' && ptRaw) {
            try { priorTurns = JSON.parse(ptRaw); } catch {}
          }
          const fileEntries = form.getAll('files').filter((v): v is File => v instanceof File);
          if (fileEntries.length > MAX_FILES) {
            return new Response(JSON.stringify({ error: `Max ${MAX_FILES} files per message` }), {
              status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          for (const f of fileEntries) {
            if (f.size > MAX_FILE_BYTES) {
              return new Response(JSON.stringify({ error: `File too large (limit 10 MB): ${f.name}` }), {
                status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
              });
            }
            if (!isAllowedFile(f)) {
              return new Response(JSON.stringify({ error: `Unsupported file type: ${f.name}` }), {
                status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
              });
            }
          }
          savedFiles = await saveUploads(fileEntries);
        } else {
          const body = await req.json() as { message?: string; forceModel?: string; priorTurns?: any[] };
          message = String(body?.message || '').trim();
          forceModel = body?.forceModel;
          priorTurns = Array.isArray(body?.priorTurns) ? body!.priorTurns : [];
        }

        if (!message && savedFiles.length === 0) {
          return new Response(JSON.stringify({ error: 'message required' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const result = await atlasTalk(message, savedFiles, forceModel, priorTurns);
        return new Response(JSON.stringify(result), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        console.error('[atlas/talk] error:', err);
        return new Response(JSON.stringify({ error: err.message || 'talk failed' }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /events/:id/respond - Respond to HITL request
    if (url.pathname.match(/^\/events\/\d+\/respond$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2]);

      try {
        const response: HumanInTheLoopResponse = await req.json();
        response.respondedAt = Date.now();

        // Update event in database
        const updatedEvent = updateEventHITLResponse(id, response);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Send response to agent via WebSocket
        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try {
            await sendResponseToAgent(
              updatedEvent.humanInTheLoop.responseWebSocketUrl,
              response
            );
          } catch (error) {
            console.error('Failed to send response to agent:', error);
            // Don't fail the request if we can't reach the agent
          }
        }

        // Broadcast updated event to all connected clients
        const message = JSON.stringify({ type: 'event', data: updatedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing HITL response:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // Theme API endpoints
    
    // POST /api/themes - Create a new theme
    if (url.pathname === '/api/themes' && req.method === 'POST') {
      try {
        const themeData = await req.json();
        const result = await createTheme(themeData);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error creating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes - Search themes
    if (url.pathname === '/api/themes' && req.method === 'GET') {
      const query = {
        query: url.searchParams.get('query') || undefined,
        isPublic: url.searchParams.get('isPublic') ? url.searchParams.get('isPublic') === 'true' : undefined,
        authorId: url.searchParams.get('authorId') || undefined,
        sortBy: url.searchParams.get('sortBy') as any || undefined,
        sortOrder: url.searchParams.get('sortOrder') as any || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };
      
      const result = await searchThemes(query);
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id - Get a specific theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const result = await getThemeById(id);
      const status = result.success ? 200 : 404;
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/themes/:id - Update a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const updates = await req.json();
        const result = await updateThemeById(id, updates);
        
        const status = result.success ? 200 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error updating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // DELETE /api/themes/:id - Delete a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'DELETE') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const authorId = url.searchParams.get('authorId');
      const result = await deleteThemeById(id, authorId || undefined);
      
      const status = result.success ? 200 : (result.error?.includes('not found') ? 404 : 403);
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id/export - Export a theme
    if (url.pathname.match(/^\/api\/themes\/[^\/]+\/export$/) && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      
      const result = await exportThemeById(id);
      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(result.data), {
        headers: { 
          ...headers, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.data.theme.name}.json"`
        }
      });
    }
    
    // POST /api/themes/import - Import a theme
    if (url.pathname === '/api/themes/import' && req.method === 'POST') {
      try {
        const importData = await req.json();
        const authorId = url.searchParams.get('authorId');
        
        const result = await importTheme(importData, authorId || undefined);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error importing theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid import data' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes/stats - Get theme statistics
    if (url.pathname === '/api/themes/stats' && req.method === 'GET') {
      const result = await getThemeStats();
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // ---- Atlas Workspace (Phase 1: kanban + spawn) ----
    if (url.pathname === '/api/atlas/workspace/projects' && req.method === 'GET') {
      return new Response(JSON.stringify({ projects: listWorkspaceProjects() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/projects' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = createWorkspaceProject(body.name || '', body.path || '');
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsProjDel = url.pathname.match(/^\/api\/atlas\/workspace\/projects\/([^\/]+)$/);
    if (wsProjDel && req.method === 'DELETE') {
      const r = deleteWorkspaceProject(wsProjDel[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/tasks' && req.method === 'GET') {
      const projectId = url.searchParams.get('projectId') || undefined;
      const includeArchived = url.searchParams.get('archived') === '1';
      return new Response(JSON.stringify({ tasks: listWorkspaceTasks({ projectId, includeArchived }) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/tasks' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = createWorkspaceTask({
        project_id: body.project_id || body.projectId,
        title: body.title || '',
        prompt: body.prompt || '',
        model: body.model,
        mode: body.mode === 'auto' ? 'auto' : 'safe',
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTaskAction = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/(spawn|kill|move|delete)$/);
    if (wsTaskAction && req.method === 'POST') {
      const id = wsTaskAction[1];
      const action = wsTaskAction[2];
      let body: any = {}; try { body = await req.json(); } catch {}
      let r: { ok: boolean; error?: string; pid?: number };
      if (action === 'spawn')       r = spawnWorkspaceTask(id);
      else if (action === 'kill')   r = killWorkspaceTask(id);
      else if (action === 'move')   r = moveWorkspaceTask(id, body.status);
      else if (action === 'delete') r = deleteWorkspaceTask(id);
      else                          r = { ok: false, error: 'unknown action' };
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // POST /api/atlas/workspace/tasks/:id/schedule  body: { at_iso } | { at_ms }
    // DELETE same path → clear
    const wsTaskSchedule = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/schedule$/);
    if (wsTaskSchedule && (req.method === 'POST' || req.method === 'DELETE')) {
      const id = wsTaskSchedule[1];
      let scheduledAt: number | null = null;
      if (req.method === 'POST') {
        let body: any = {}; try { body = await req.json(); } catch {}
        if (typeof body.at_ms === 'number') scheduledAt = body.at_ms;
        else if (typeof body.at_iso === 'string') {
          const ms = Date.parse(body.at_iso);
          if (!Number.isFinite(ms)) {
            return new Response(JSON.stringify({ ok: false, error: 'invalid at_iso' }), {
              status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
            });
          }
          scheduledAt = ms;
        } else {
          return new Response(JSON.stringify({ ok: false, error: 'missing at_iso or at_ms' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }
      const r = setWorkspaceTaskSchedule(id, scheduledAt);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/atlas/workspace/projects/:id/schedule-all  body: { at_iso | at_ms, stagger_ms? }
    // DELETE same path → clear schedule on every backlog task in the project
    const wsProjectScheduleAll = url.pathname.match(/^\/api\/atlas\/workspace\/projects\/([^\/]+)\/schedule-all$/);
    if (wsProjectScheduleAll && req.method === 'DELETE') {
      const projectId = wsProjectScheduleAll[1];
      const r = clearAllWorkspaceBacklogSchedules(projectId);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (wsProjectScheduleAll && req.method === 'POST') {
      const projectId = wsProjectScheduleAll[1];
      let body: any = {}; try { body = await req.json(); } catch {}
      let baseMs: number;
      if (typeof body.at_ms === 'number') baseMs = body.at_ms;
      else if (typeof body.at_iso === 'string') {
        const ms = Date.parse(body.at_iso);
        if (!Number.isFinite(ms)) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid at_iso' }), {
            status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        baseMs = ms;
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'missing at_iso or at_ms' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      const stagger = Number.isFinite(body.stagger_ms) ? body.stagger_ms : 0;
      const r = scheduleAllWorkspaceBacklog(projectId, baseMs, stagger);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const wsTaskGet = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)$/);
    if (wsTaskGet && req.method === 'GET') {
      const t = getWorkspaceTask(wsTaskGet[1]);
      if (!t) return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify({ task: t }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // Phase 10 — protocol-event timeline for a task. Returns the parsed
    // protocol_events JSON as a typed array (id, ts, event, payload).
    const wsTaskEvents = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/events$/);
    if (wsTaskEvents && req.method === 'GET') {
      const t = getWorkspaceTask(wsTaskEvents[1]);
      if (!t) return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      let events: { ts: number; event: string; payload?: any }[] = [];
      try { events = JSON.parse(t.protocol_events || '[]'); } catch {}
      return new Response(JSON.stringify({ task_id: t.id, events }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const wsTaskLog = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/log$/);
    if (wsTaskLog && req.method === 'GET') {
      const tail = parseInt(url.searchParams.get('tail') || '200000');
      const r = await getWorkspaceTaskLog(wsTaskLog[1], { tail });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /api/atlas/workspace/tasks/:id/chain → ancestor chain oldest → newest
    const wsTaskChain = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/chain$/);
    if (wsTaskChain && req.method === 'GET') {
      const chain = getWorkspaceTaskChain(wsTaskChain[1]);
      return new Response(JSON.stringify({ chain }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Phase 3: memory / pins / templates ----
    const wsProjMem = url.pathname.match(/^\/api\/atlas\/workspace\/projects\/([^\/]+)\/memory$/);
    if (wsProjMem && req.method === 'GET') {
      const body = getProjectMemory(wsProjMem[1]);
      return new Response(JSON.stringify({ body }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (wsProjMem && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = setProjectMemory(wsProjMem[1], String(body.body ?? ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/pins' && req.method === 'GET') {
      return new Response(JSON.stringify({ pinnedIds: listPinnedIds() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/pins' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const id = body.task_id || body.taskId;
      if (!id) return new Response(JSON.stringify({ ok: false, error: 'task_id required' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      const r = pinWorkspaceTask(id);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/pins' && req.method === 'DELETE') {
      const r = unpinAllWorkspace();
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsPinDel = url.pathname.match(/^\/api\/atlas\/workspace\/pins\/([^\/]+)$/);
    if (wsPinDel && req.method === 'DELETE') {
      const r = unpinWorkspaceTask(wsPinDel[1]);
      return new Response(JSON.stringify(r), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/templates' && req.method === 'GET') {
      return new Response(JSON.stringify({ templates: listWorkspaceTemplates() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/templates' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = createWorkspaceTemplate({
        name: body.name || '',
        category: body.category || 'custom',
        description: body.description || '',
        body: body.body || '',
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTplMod = url.pathname.match(/^\/api\/atlas\/workspace\/templates\/([^\/]+)$/);
    if (wsTplMod && req.method === 'PUT') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = updateWorkspaceTemplate(wsTplMod[1], body);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (wsTplMod && req.method === 'DELETE') {
      const r = deleteWorkspaceTemplate(wsTplMod[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // Phase 6: worktree diff / merge / discard
    const wsTaskDiff = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/diff$/);
    if (wsTaskDiff && req.method === 'GET') {
      const r = getWorkspaceTaskDiff(wsTaskDiff[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTaskMerge = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/merge$/);
    if (wsTaskMerge && req.method === 'POST') {
      const r = mergeWorkspaceTask(wsTaskMerge[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTaskDiscard = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/discard$/);
    if (wsTaskDiscard && req.method === 'POST') {
      const r = discardWorkspaceTaskWorktree(wsTaskDiscard[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTaskMergePush = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/merge-push$/);
    if (wsTaskMergePush && req.method === 'POST') {
      const r = mergeAndPushWorkspaceTask(wsTaskMergePush[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsTaskPR = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/pr$/);
    if (wsTaskPR && req.method === 'POST') {
      const r = openPRForWorkspaceTask(wsTaskPR[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const wsProjInfo = url.pathname.match(/^\/api\/atlas\/workspace\/projects\/([^\/]+)\/info$/);
    if (wsProjInfo && req.method === 'GET') {
      const r = getWorkspaceProjectInfo(wsProjInfo[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // Archive endpoints
    const wsTaskArchive = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/archive$/);
    if (wsTaskArchive && req.method === 'POST') {
      const r = archiveWorkspaceTask(wsTaskArchive[1]);
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/atlas/workspace/archive/done' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = archiveDoneWorkspaceTasks({ projectId: body.project_id });
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // Phase 4: follow-up — creates child task with parent_task_id, resumes session on spawn
    const wsFollowUp = url.pathname.match(/^\/api\/atlas\/workspace\/tasks\/([^\/]+)\/follow-up$/);
    if (wsFollowUp && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = followUpWorkspaceTask(wsFollowUp[1], String(body.prompt || ''));
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Chat threads ----
    if (url.pathname === '/api/chat/threads' && req.method === 'GET') {
      const projectId = url.searchParams.get('projectId') || undefined;
      return new Response(JSON.stringify({ threads: listChatThreads({ projectId }) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/chat/threads' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const projectId = String(body.projectId || body.project_id || '');
      if (!projectId) {
        return new Response(JSON.stringify({ error: 'projectId required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      const t = createChatThread({
        projectId,
        title: body.title,
        provider: body.provider,
        model: body.model,
      });
      return new Response(JSON.stringify(t), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/chat/skills' && req.method === 'GET') {
      return new Response(JSON.stringify({ skills: listChatSkills() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/chat/skills/suggest' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const skills = suggestChatSkills(String(body.text || ''), Number(body.limit) || 3);
      return new Response(JSON.stringify({ skills }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const chatThreadMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)$/);
    if (chatThreadMatch && req.method === 'GET') {
      const t = getChatThread(chatThreadMatch[1]!);
      if (!t) return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify(t), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (chatThreadMatch && req.method === 'PATCH') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const t = updateChatThread(chatThreadMatch[1]!, body);
      if (!t) return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify(t), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (chatThreadMatch && req.method === 'DELETE') {
      const ok = deleteChatThread(chatThreadMatch[1]!);
      return new Response(JSON.stringify({ ok }), {
        status: ok ? 200 : 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const chatSendMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)\/messages$/);
    if (chatSendMatch && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const text = String(body.text || '').trim();
      if (!text) {
        return new Response(JSON.stringify({ error: 'text required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      const skills = Array.isArray(body.skills) ? body.skills.map(String) : undefined;
      // SSE response
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          const write = (ev: any) => {
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
            } catch {}
          };
          try {
            await sendChatMessage({
              threadId: chatSendMatch[1]!,
              userText: text,
              skills,
              onEvent: write,
            });
          } catch (e: any) {
            write({ type: 'error', message: e?.message || String(e) });
          } finally {
            try { controller.close(); } catch {}
          }
        }
      });
      return new Response(stream, {
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }
    const chatCancelMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)\/cancel$/);
    if (chatCancelMatch && req.method === 'POST') {
      const ok = cancelChatStream(chatCancelMatch[1]!);
      return new Response(JSON.stringify({ ok }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const chatApproveMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)\/approve$/);
    if (chatApproveMatch && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = resolveChatProposal({
        threadId: chatApproveMatch[1]!,
        messageId: String(body.messageId || ''),
        actionId: String(body.actionId || ''),
        decision: 'approved',
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const chatRejectMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)\/reject$/);
    if (chatRejectMatch && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const r = resolveChatProposal({
        threadId: chatRejectMatch[1]!,
        messageId: String(body.messageId || ''),
        actionId: String(body.actionId || ''),
        decision: 'rejected',
        reason: body.reason,
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    const chatReactMatch = url.pathname.match(/^\/api\/chat\/threads\/([^\/]+)\/messages\/([^\/]+)\/react$/);
    if (chatReactMatch && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const reaction = body.reaction === 'up' || body.reaction === 'down' ? body.reaction : null;
      const ok = setChatReaction(chatReactMatch[1]!, chatReactMatch[2]!, reaction);
      return new Response(JSON.stringify({ ok }), {
        status: ok ? 200 : 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ---- Workspace terminals ----
    if (url.pathname === '/api/workspace/terminals' && req.method === 'GET') {
      const projectId = url.searchParams.get('projectId') || undefined;
      return new Response(JSON.stringify({ terminals: listTerminals(projectId) }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/api/workspace/terminals' && req.method === 'POST') {
      let body: any = {}; try { body = await req.json(); } catch {}
      const projectId = String(body.projectId || body.project_id || '');
      if (!projectId) {
        return new Response(JSON.stringify({ error: 'projectId required' }), {
          status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      try {
        const meta = createTerminal({
          projectId,
          label: body.label,
          cmd: body.cmd,
          cwd: body.cwd,
          persistent: typeof body.persistent === 'boolean' ? body.persistent : undefined,
        });
        return new Response(JSON.stringify(meta), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || String(err) }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    const termDel = url.pathname.match(/^\/api\/workspace\/terminals\/([^\/]+)$/);
    if (termDel && req.method === 'DELETE') {
      const ok = deleteTerminal(termDel[1]!);
      return new Response(JSON.stringify({ ok }), {
        status: ok ? 200 : 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    if (termDel && req.method === 'GET') {
      const meta = getTerminal(termDel[1]!);
      if (!meta) return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { ...headers, 'Content-Type': 'application/json' }
      });
      return new Response(JSON.stringify(meta), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // WebSocket upgrade — terminal sessions
    const termWs = url.pathname.match(/^\/workspace\/terminal\/([^\/]+)$/);
    if (termWs) {
      const id = termWs[1]!;
      const meta = getTerminal(id);
      if (!meta) {
        return new Response('terminal not found', { status: 404 });
      }
      const success = server.upgrade(req, { data: { kind: 'terminal', termId: id } });
      if (success) return undefined;
    }

    // WebSocket upgrade — global event stream
    if (url.pathname === '/stream') {
      const success = server.upgrade(req, { data: { kind: 'stream' } });
      if (success) {
        return undefined;
      }
    }

    // Default response
    return new Response('Multi-Agent Observability Server', {
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  },

  websocket: {
    open(ws) {
      const kind = (ws.data as any)?.kind || 'stream';
      if (kind === 'terminal') {
        const termId = (ws.data as any).termId as string;
        console.log(`[terminal] WS open termId=${termId}`);
        const handle: AttachHandle | null = attachTerminal(
          termId,
          (chunk: string) => {
            try { ws.send(JSON.stringify({ type: 'output', data: chunk })); } catch {}
          },
          () => {
            try { ws.send(JSON.stringify({ type: 'exit' })); } catch {}
            try { ws.close(); } catch {}
          }
        );
        if (!handle) {
          console.log(`[terminal] attach failed for termId=${termId}`);
          try { ws.send(JSON.stringify({ type: 'error', message: 'attach failed' })); } catch {}
          ws.close();
          return;
        }
        termHandles.set(ws, handle);
        return;
      }
      // default: event-stream client
      console.log('WebSocket client connected');
      wsClients.add(ws);
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: 'initial', data: events }));
    },

    message(ws, message) {
      const handle = termHandles.get(ws);
      if (handle) {
        let msg: any;
        try {
          msg = JSON.parse(typeof message === 'string' ? message : message.toString());
        } catch { return; }
        if (msg?.type === 'input' && typeof msg.data === 'string') {
          try { handle.write(msg.data); } catch (e) {
            console.log(`[terminal] handle.write failed:`, e);
          }
        } else if (msg?.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          try { handle.resize(msg.cols, msg.rows); } catch {}
        }
        return;
      }
      console.log('Received message:', message);
    },

    close(ws) {
      const handle = termHandles.get(ws);
      if (handle) {
        try { handle.dispose(); } catch {}
        termHandles.delete(ws);
        return;
      }
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    },

    error(ws, error) {
      const handle = termHandles.get(ws);
      if (handle) {
        try { handle.dispose(); } catch {}
        termHandles.delete(ws);
        return;
      }
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    }
  }
});

// Gate auto-check cron — runs every 15 minutes
const GATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

async function runGateCron() {
  const slugs = listProjectsWithAutoGates();
  for (const slug of slugs) {
    try {
      await checkAllAutoGates(slug);
    } catch (e) {
      console.error(`[gate-cron] ${slug}:`, e instanceof Error ? e.message : e);
    }
  }
}

// Run once at startup (after 30s delay to let server stabilise), then every 15min
setTimeout(() => {
  runGateCron();
  setInterval(runGateCron, GATE_CHECK_INTERVAL_MS);
}, 30_000);

console.log(`🚀 Server running on http://localhost:${server.port}`);
console.log(`📊 WebSocket endpoint: ws://localhost:${server.port}/stream`);
console.log(`📮 POST events to: http://localhost:${server.port}/events`);