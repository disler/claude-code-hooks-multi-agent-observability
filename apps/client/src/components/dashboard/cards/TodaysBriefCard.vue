<template>
  <article class="card brief" :class="{ 'is-compact': compact }">
    <!-- Tabs row — visible on every viewport whenever ≥2 briefs today -->
    <div v-if="briefs.length > 1" class="brief__tabs" role="tablist">
      <button
        v-for="(b, i) in briefs"
        :key="b.slug"
        class="brief__tab"
        :class="{ 'is-active': i === activeIndex }"
        role="tab"
        :aria-selected="i === activeIndex"
        @click="activeIndex = i"
      >{{ b.topic.toUpperCase() }}<span v-if="b.time"> · {{ b.time }}</span></button>
    </div>

    <header class="brief__head">
      <span class="card-eyebrow">{{ eyebrow }}</span>
      <h2 v-if="current" class="brief__title">{{ current.title }}</h2>
      <h2 v-else-if="!loading" class="brief__title brief__title--muted">No brief yet.</h2>
      <p v-if="data?.latestPriorBrief && !briefs.length" class="brief__subtitle">
        No brief today — showing the most recent.
      </p>
    </header>

    <!-- Lede: 1-2 paragraphs then Read article. -->
    <template v-if="current">
      <div v-if="lede.length" class="brief__lede">
        <p v-for="(para, i) in lede" :key="i">{{ para }}</p>
      </div>
      <p v-else class="brief__lede brief__lede--muted">(no summary)</p>
      <button type="button" class="brief__cta" @click="$emit('open-full', current)">
        Read article →
      </button>
    </template>

    <div v-if="loading" class="brief__loading">Loading…</div>
  </article>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { API_BASE_URL } from '../../../config';

const props = defineProps<{ compact?: boolean }>();
const emit = defineEmits<{
  (e: 'open-full', brief: any): void;
}>();

const data = ref<any>(null);
const loading = ref(true);
const activeIndex = ref(0);

const briefs = computed<any[]>(() => data.value?.briefs ?? []);

const current = computed<any | null>(() => {
  if (briefs.value.length) return briefs.value[activeIndex.value] ?? briefs.value[0];
  return data.value?.latestPriorBrief ?? null;
});

// Pull ~250 words on desktop, ~90 words on mobile. Prefer tldr; then add
// htmlBody paragraphs until budget hit.
const lede = computed<string[]>(() => {
  const budget = props.compact ? 90 : 250;
  const c = current.value;
  if (!c) return [];
  const out: string[] = [];
  let words = 0;
  function wc(s: string) { return (s.match(/\S+/g) || []).length; }
  if (c.tldr && typeof c.tldr === 'string' && c.tldr.trim()) {
    out.push(c.tldr.trim());
    words += wc(c.tldr);
  }
  if (c.htmlBody) {
    const matches = String(c.htmlBody).match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    for (const m of matches) {
      if (words >= budget) break;
      const txt = m.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length < 20) continue;
      if (out.includes(txt)) continue;
      out.push(txt);
      words += wc(txt);
    }
  }
  return out;
});

const eyebrow = computed(() => {
  if (briefs.value.length) {
    const c = current.value;
    return c ? `Today's brief · ${formatDate(c.date)}` : "Today's brief";
  }
  const prior = data.value?.latestPriorBrief;
  return prior ? `Brief · ${formatDate(prior.date)}` : "Today's brief";
});

async function load() {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/briefs/today`);
    if (res.ok) data.value = await res.json();
  } catch (err) {
    console.error('[brief/today] failed', err);
  } finally {
    loading.value = false;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

onMounted(load);
void props;
void emit;
</script>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--atlas-card-bg);
  border-radius: 12px;
  padding: 24px 24px 22px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  gap: 12px;
}
.card.is-compact { padding: 20px 22px; border-radius: 10px; }
@media (max-width: 1023px) { .card { padding: 20px 22px; border-radius: 10px; } }

/* Tabs */
.brief__tabs {
  display: flex;
  gap: 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--atlas-hairline);
  flex: none;
  overflow-x: auto;
  scrollbar-width: none;
}
.brief__tabs::-webkit-scrollbar { display: none; }
.brief__tab {
  position: relative;
  padding: 7px 0;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--atlas-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;
  white-space: nowrap;
  flex: none;
}
.brief__tab:hover { color: var(--atlas-text-primary); }
.brief__tab.is-active { color: var(--atlas-text-strong); }
.brief__tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--atlas-blue);
}
.card.is-compact .brief__tabs { gap: 12px; margin-bottom: 10px; }
.card.is-compact .brief__tab { font-size: 11px; padding: 6px 0; }

.brief__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  margin-bottom: 4px;
}
.card-eyebrow {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.brief__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--atlas-text-strong);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.card.is-compact .brief__title { font-size: 17px; line-height: 1.3; }
@media (max-width: 1023px) { .brief__title { font-size: 17px; line-height: 1.3; } }
.brief__title--muted { color: var(--atlas-text-secondary); font-weight: 500; }
.brief__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--atlas-text-secondary);
}

.brief__lede {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  color: var(--atlas-text-primary);
}
.brief__lede p {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  opacity: 0.92;
}
.card.is-compact .brief__lede { gap: 8px; }
.card.is-compact .brief__lede p { font-size: 13.5px; line-height: 1.5; }
@media (max-width: 1023px) {
  .brief__lede { gap: 8px; }
  .brief__lede p { font-size: 13.5px; line-height: 1.5; }
}
.brief__lede--muted {
  font-size: 14px;
  color: var(--atlas-text-secondary);
  font-style: italic;
}
.brief__cta {
  align-self: flex-start;
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-blue);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 4px;
  transition: background-color 100ms ease, border-color 100ms ease;
}
.brief__cta:hover { background: var(--atlas-blue-soft); border-color: var(--atlas-blue); }

.brief__loading {
  font-size: 15px;
  color: var(--atlas-text-secondary);
}
</style>
