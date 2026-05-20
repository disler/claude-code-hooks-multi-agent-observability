<template>
  <div class="atlas-page" v-show="!readingBrief && !talkFullscreen && !workspaceOpen && !projectOpen && !vibeOpen && !memoryOpen && !swarmOpen && !reviewOpen && !swarmDemoOpen && !portfolioOpen && !incubatorOpen && !ideasOpen && !orgChartOpen && !costOpen && !projectShellSlug">
    <WordmarkRow
      @open-portfolio="portfolioOpen = true"
      @open-ideas="ideasOpen = true"
      @open-memory="memoryOpen = true"
      @open-swarm="swarmOpen = true"
      @open-orgchart="orgChartOpen = true"
      @open-cost="costOpen = true"
    />
    <div class="atlas-page__divider"></div>
    <StatusRow />
    <div class="atlas-page__divider"></div>

    <!-- Today (was Dashboard): tactical daily driver. -->
    <main class="atlas-page__grid atlas-page__grid--lean">
      <section class="atlas-page__main">
        <ProjectStatusRow @open-project="onOpenProjectPortfolio" />

        <div class="atlas-page__row atlas-page__row--primary">
          <TalkCard :compact="false" @open-fullscreen="talkFullscreen = true" />
          <QueueCard />
        </div>

        <PipelineCard class="is-wide" />

        <div class="atlas-page__row atlas-page__row--secondary">
          <DAGStreamCard />
          <TodaysBriefCard :compact="isCompact" @open-full="onOpenFull" />
        </div>

        <LiveActivityCard :events="events" @view-all="liveAllOpen = true" @open-search="auditOpen = true" />

        <details class="atlas-page__admin">
          <summary>Admin · proposals · services · keys</summary>
          <div class="atlas-page__admin-body">
            <ProposalsCard />
            <LaunchdControlsCard />
            <SecretsCard />
          </div>
        </details>
      </section>
    </main>

    <p v-if="error" class="atlas-page__error">{{ error }}</p>
  </div>

  <BriefReadingView v-if="readingBrief" :brief="readingBrief" @close="readingBrief = null" />
  <TalkFullscreen v-if="talkFullscreen" @close="talkFullscreen = false" />

  <PortfolioView
    v-if="portfolioOpen"
    @close="portfolioOpen = false"
    @open-project="onPortfolioOpenProject"
  />
  <IncubatorView
    v-if="incubatorOpen"
    @close="incubatorOpen = false"
  />
  <IdeasView
    v-if="ideasOpen"
    @close="ideasOpen = false"
  />
  <OrgChartView
    v-if="orgChartOpen"
    @close="orgChartOpen = false"
  />
  <CostView
    v-if="costOpen"
    @close="costOpen = false"
  />
  <ProjectShell
    v-if="projectShellSlug"
    :slug="projectShellSlug"
    :initial-stage="projectShellStage"
    @close="closeProjectShell"
  />

  <WorkspaceView v-show="workspaceOpen" @close="workspaceOpen = false" @nav="handleNav" />
  <VibeView v-show="vibeOpen" @close="vibeOpen = false" @nav="handleNav" />
  <ProjectView v-show="projectOpen" @close="projectOpen = false" @nav="handleNav" />
  <MemoryView v-show="memoryOpen" @close="memoryOpen = false" @nav="handleNav" />
  <SwarmView v-show="swarmOpen" @close="swarmOpen = false" @nav="handleNav" />
  <ReviewView v-show="reviewOpen" @close="reviewOpen = false" @nav="handleNav" />
  <SwarmDemoView v-if="swarmDemoOpen" @close="swarmDemoOpen = false" @open-swarm="swarmDemoOpen = false; swarmOpen = true" />

  <LiveActivityModal v-if="liveAllOpen" :events="events" @close="liveAllOpen = false" />
  <AuditSearchModal v-if="auditOpen" @close="auditOpen = false" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useWebSocket } from './composables/useWebSocket';
import { useTheme } from './composables/useTheme';
import WordmarkRow from './components/dashboard/WordmarkRow.vue';
import StatusRow from './components/dashboard/StatusRow.vue';
import ProjectStatusRow from './components/dashboard/ProjectStatusRow.vue';
import TalkCard from './components/dashboard/cards/TalkCard.vue';
import LiveActivityCard from './components/dashboard/cards/LiveActivityCard.vue';
import TodaysBriefCard from './components/dashboard/cards/TodaysBriefCard.vue';
import QueueCard from './components/dashboard/cards/QueueCard.vue';
import PipelineCard from './components/dashboard/PipelineCard.vue';
import DAGStreamCard from './components/dashboard/cards/DAGStreamCard.vue';
import ProposalsCard from './components/dashboard/cards/ProposalsCard.vue';
import LaunchdControlsCard from './components/dashboard/cards/LaunchdControlsCard.vue';
import SecretsCard from './components/dashboard/cards/SecretsCard.vue';
import AuditSearchModal from './components/dashboard/AuditSearchModal.vue';
import { useNotifications } from './composables/useNotifications';
import BriefReadingView from './views/BriefReadingView.vue';
import TalkFullscreen from './views/TalkFullscreen.vue';
import WorkspaceView from './views/WorkspaceView.vue';
import VibeView from './views/VibeView.vue';
import MemoryView from './views/MemoryView.vue';
import SwarmView from './views/SwarmView.vue';
import ReviewView from './views/ReviewView.vue';
import SwarmDemoView from './views/SwarmDemoView.vue';
import ProjectView from './views/ProjectView.vue';
import PortfolioView from './views/PortfolioView.vue';
import IncubatorView from './views/IncubatorView.vue';
import IdeasView from './views/IdeasView.vue';
import OrgChartView from './views/OrgChartView.vue';
import CostView from './views/CostView.vue';
import ProjectShell from './views/ProjectShell.vue';
import LiveActivityModal from './components/dashboard/LiveActivityModal.vue';
import { WS_URL } from './config';
import type { LifecycleStage } from './composables/useProjectView';

const { events, error } = useWebSocket(WS_URL);
useTheme();
useNotifications(events);

const isCompact = ref(false);
function recomputeCompact() { isCompact.value = window.matchMedia('(max-width: 1023px)').matches; }
onMounted(() => { recomputeCompact(); window.addEventListener('resize', recomputeCompact); });
onUnmounted(() => window.removeEventListener('resize', recomputeCompact));

const readingBrief = ref<any>(null);
const talkFullscreen = ref(false);
const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const workspaceOpen = ref(searchParams?.get('workspace') === '1');
const projectOpen = ref(searchParams?.get('project') === '1');
const vibeOpen = ref(searchParams?.get('vibe') === '1');
const memoryOpen = ref(searchParams?.get('memory') === '1');
const swarmOpen = ref(searchParams?.get('swarm') === '1');
const reviewOpen = ref(searchParams?.get('review') === '1');
const swarmDemoOpen = ref(searchParams?.get('swarmdemo') === '1');
const portfolioOpen = ref(searchParams?.get('portfolio') === '1');
const incubatorOpen = ref(searchParams?.get('incubator') === '1');
const ideasOpen = ref(searchParams?.get('ideas') === '1');
const orgChartOpen = ref(searchParams?.get('orgchart') === '1');
const costOpen = ref(searchParams?.get('cost') === '1');
const projectShellSlug = ref<string | null>(searchParams?.get('shell') || null);
const projectShellStage = ref<LifecycleStage | undefined>((searchParams?.get('stage') as LifecycleStage) || undefined);
const liveAllOpen = ref(false);
const auditOpen = ref(false);

function onOpenFull(brief: any) { readingBrief.value = brief; }
function onOpenProjectPortfolio() { portfolioOpen.value = true; }

function onPortfolioOpenProject(slug: string, stage: LifecycleStage) {
  portfolioOpen.value = false;
  projectShellSlug.value = slug;
  projectShellStage.value = stage;
}
function closeProjectShell() {
  projectShellSlug.value = null;
  projectShellStage.value = undefined;
}

function handleNav(key: string) {
  workspaceOpen.value = false;
  projectOpen.value = false;
  vibeOpen.value = false;
  memoryOpen.value = false;
  swarmOpen.value = false;
  reviewOpen.value = false;
  if (key === 'today' || key === 'dashboard') return;
  if (key === 'portfolio') portfolioOpen.value = true;
  else if (key === 'ideas') ideasOpen.value = true;
  else if (key === 'incubator') incubatorOpen.value = true;
  else if (key === 'memory') memoryOpen.value = true;
  else if (key === 'swarm')  swarmOpen.value = true;
  else if (key === 'orgchart') orgChartOpen.value = true;
  else if (key === 'cost') costOpen.value = true;
  // Legacy keys still work for deep-links / handles internal to other views.
  else if (key === 'workspace') workspaceOpen.value = true;
  else if (key === 'project') projectOpen.value = true;
  else if (key === 'vibe')   vibeOpen.value = true;
  else if (key === 'review') reviewOpen.value = true;
}
</script>

<style scoped>
.atlas-page { display: flex; flex-direction: column; min-height: 100vh; background: var(--atlas-page-bg); color: var(--atlas-text-primary); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif; }
.atlas-page__divider { height: 1px; background: var(--atlas-hairline); margin: 0 48px; flex: none; }
@media (max-width: 1023px) { .atlas-page__divider { margin: 0 24px; } }

.atlas-page__grid { display: grid; grid-template-columns: minmax(0, 1400px); justify-content: center; gap: 20px; padding: 20px 7px 48px; }
@media (max-width: 1023px) { .atlas-page__grid { padding: 16px 6px 40px; gap: 16px; } }
@media (max-width: 699px) { .atlas-page__grid { padding: 12px 4px 32px; gap: 12px; } }
.atlas-page__grid--lean .atlas-page__main { gap: 24px; }
.atlas-page__main > .is-wide { width: 100%; }

.atlas-page__admin { border: 1px solid var(--atlas-hairline); border-radius: 10px; padding: 0; background: var(--atlas-card-bg); }
.atlas-page__admin > summary { list-style: none; cursor: pointer; padding: 12px 18px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--atlas-text-muted); }
.atlas-page__admin > summary::-webkit-details-marker { display: none; }
.atlas-page__admin > summary:hover { color: var(--atlas-text-primary); }
.atlas-page__admin[open] > summary { border-bottom: 1px solid var(--atlas-hairline); }
.atlas-page__admin-body { display: flex; flex-direction: column; gap: 16px; padding: 16px 18px; }

.atlas-page__main { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.atlas-page__row--primary { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.atlas-page__row--secondary { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 1023px) { .atlas-page__row--secondary { display: flex; flex-direction: column; gap: 16px; } }
@media (max-width: 1023px) {
  .atlas-page__row--primary { display: contents; }
  .atlas-page__main { display: flex; flex-direction: column; gap: 16px; }
  .atlas-page__main > .proj-status        { order: 1; }
  .atlas-page__row--primary > .card.talk  { order: 2; }
  .atlas-page__main > .card.brief         { order: 3; }
  .atlas-page__row--primary > .queue-card { order: 4; }
  .atlas-page__main > .live-activity      { order: 5; }
  .atlas-page__main > .atlas-page__admin  { order: 6; }
}

.atlas-page__error { position: fixed; bottom: 16px; left: 16px; z-index: 60; padding: 8px 12px; font-size: 12px; color: var(--atlas-red); background: var(--atlas-card-bg); border: 1px solid rgba(255, 59, 48, 0.40); border-radius: 8px; }
</style>
