<template>
  <div ref="scrollEl" class="overflow-auto max-h-[60vh]">
    <svg
      :width="svgWidth"
      :height="svgHeight"
      class="select-none"
    >
      <!-- Edges (drawn first, under circles) -->
      <g v-for="(row, i) in layout" :key="'edges-' + row.commit.hash">
        <!-- Segments from this row to next row — center-to-center so circles cover endpoints -->
        <template v-if="i + 1 < layout.length">
          <template v-for="(laneHash, j) in row.activeLanesAfter" :key="'seg-' + i + '-' + j">
            <line
              v-if="laneHash !== null"
              :x1="laneX(j)"
              :y1="rowY(i)"
              :x2="laneX(targetLane(row.activeLanesAfter, j, i + 1))"
              :y2="rowY(i + 1)"
              :stroke="laneColor(j)"
              stroke-width="1.5"
              opacity="0.7"
            />
          </template>
        </template>
      </g>

      <!-- Commit rows -->
      <g v-for="(row, i) in layout" :key="'commit-' + row.commit.hash">
        <!-- Commit circle -->
        <circle
          :cx="laneX(row.lane)"
          :cy="rowY(i)"
          :r="CIRCLE_R"
          :fill="isHeadCommit(row.commit.hash) ? '#fff' : laneColor(row.lane)"
          :stroke="dirtyRing(row.commit.hash) ? '#fb923c' : 'none'"
          stroke-width="2"
          class="cursor-pointer"
          @click="$emit('select-hash', row.commit.hash)"
        />
        <!-- Dirty indicator ring -->
        <circle
          v-if="dirtyRing(row.commit.hash)"
          :cx="laneX(row.lane)"
          :cy="rowY(i)"
          :r="CIRCLE_R + 3"
          fill="none"
          stroke="#fb923c"
          stroke-width="1.5"
          opacity="0.6"
        />

        <!-- Labels (refs + container labels + hash + subject) -->
        <g :transform="`translate(${labelX}, ${rowY(i)})`">
          <!-- Container-specific HEAD labels (bold, with @hostname) -->
          <g v-for="(cl, ci) in containerLabels(row.commit.hash)" :key="'cl-' + ci">
            <rect
              :x="containerLabelOffsets[i]?.[ci]?.x ?? 0"
              :y="-7"
              :width="containerLabelOffsets[i]?.[ci]?.w ?? 0"
              height="14"
              rx="3"
              :fill="cl.dirty ? '#4c1d20' : '#1e3a4c'"
              opacity="0.9"
            />
            <text
              :x="(containerLabelOffsets[i]?.[ci]?.x ?? 0) + 4"
              y="4"
              font-size="9"
              font-family="monospace"
              font-weight="bold"
              :fill="cl.dirty ? '#fca5a5' : '#7dd3fc'"
            >{{ cl.text }}</text>
          </g>

          <!-- Git ref badges -->
          <g v-for="(fref, ri) in formattedRefs(row.commit)" :key="ri">
            <rect
              :x="refOffsets[i]?.[ri]?.x ?? 0"
              :y="-7"
              :width="refOffsets[i]?.[ri]?.w ?? 0"
              height="14"
              rx="3"
              :fill="refBgColor(fref.type)"
              opacity="0.8"
            />
            <text
              :x="(refOffsets[i]?.[ri]?.x ?? 0) + 4"
              y="4"
              font-size="9"
              font-family="monospace"
              :fill="refTextColor(fref.type)"
            >{{ fref.text }}</text>
          </g>

          <!-- Commit hash + subject -->
          <text
            :x="refOffsets[i]?.[formattedRefs(row.commit).length]?.x ?? 0"
            y="4"
            font-size="10"
            font-family="monospace"
            fill="#94a3b8"
          >{{ row.commit.hash.slice(0, 8) }}</text>
          <text
            :x="(refOffsets[i]?.[formattedRefs(row.commit).length]?.x ?? 0) + 60"
            y="4"
            font-size="10"
            font-family="sans-serif"
            fill="#cbd5e1"
          >{{ row.commit.subject.slice(0, 80) }}</text>
        </g>

        <!-- Selected / flash highlight -->
        <rect
          v-if="selectedHash === row.commit.hash || flashHash === row.commit.hash"
          :x="0"
          :y="rowY(i) - ROW_H / 2"
          :width="svgWidth"
          :height="ROW_H"
          :fill="flashHash === row.commit.hash ? '#fbbf24' : 'white'"
          :opacity="flashHash === row.commit.hash ? '0.12' : '0.04'"
          rx="3"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { computeLayout, formatRef, laneColor } from '../composables/useGitGraph'
import type { GitCommit, GitContainer } from '../types'

const LANE_W = 18
const ROW_H = 24
const CIRCLE_R = 5
const LABEL_PAD = 12

const props = defineProps<{
  commits: GitCommit[]
  containers: GitContainer[]
  selectedHash: string | null
}>()

defineEmits<{
  'select-hash': [hash: string]
}>()

const scrollEl = ref<HTMLElement | null>(null)
const flashHash = ref<string | null>(null)

const layout = computed(() => computeLayout(props.commits))

const maxLanes = computed(() => {
  let m = 1
  for (const row of layout.value) m = Math.max(m, row.lane + 1, row.activeLanesAfter.length)
  return m
})

const labelX = computed(() => maxLanes.value * LANE_W + LABEL_PAD)
const svgWidth = computed(() => labelX.value + 640)
const svgHeight = computed(() => Math.max(layout.value.length * ROW_H + 8, 40))

function laneX(lane: number) { return lane * LANE_W + LANE_W / 2 }
function rowY(i: number) { return i * ROW_H + ROW_H / 2 }

// Find which lane a given hash will be in at the next row
function targetLane(afterLanes: (string | null)[], fromLane: number, nextRow: number): number {
  const hash = afterLanes[fromLane]
  if (!hash) return fromLane
  if (nextRow < layout.value.length && layout.value[nextRow].commit.hash === hash) {
    return layout.value[nextRow].lane
  }
  return fromLane
}

// Containers whose HEAD is this commit
function headContainers(hash: string) {
  return props.containers.filter(c => c.git_commit_hash === hash)
}
function isHeadCommit(hash: string) { return headContainers(hash).length > 0 }
function dirtyRing(hash: string) {
  return headContainers(hash).some(c => c.git_staged_count > 0 || c.git_unstaged_count > 0)
}

interface ContainerLabel { text: string; dirty: boolean }

function containerLabels(hash: string): ContainerLabel[] {
  return headContainers(hash).map(c => {
    // Main repo: use container id (= source_repo). Worktrees: id = "repo.wtname"
    const name = c.id
    const dirty = c.git_staged_count > 0 || c.git_unstaged_count > 0
    return { text: `${name}@${c.machine_hostname}`, dirty }
  })
}

function formattedRefs(commit: GitCommit) {
  return commit.refs.map(r => formatRef(r))
}

function refBgColor(type: string) {
  return { head: '#1e40af', local: '#1e3a5f', remote: '#374151', tag: '#713f12' }[type] ?? '#374151'
}
function refTextColor(type: string) {
  return { head: '#93c5fd', local: '#7dd3fc', remote: '#9ca3af', tag: '#fde68a' }[type] ?? '#9ca3af'
}

// Compute x-offsets for container labels per row
const containerLabelOffsets = computed(() => {
  const result: Array<Array<{ x: number; w: number }>> = []
  for (const row of layout.value) {
    const labels = containerLabels(row.commit.hash)
    const offsets: Array<{ x: number; w: number }> = []
    let x = 0
    for (const cl of labels) {
      const w = cl.text.length * 6 + 8
      offsets.push({ x, w })
      x += w + 4
    }
    result.push(offsets)
  }
  return result
})

// Compute x-offsets for ref badges per row (starting after container labels)
const refOffsets = computed(() => {
  const result: Array<Array<{ x: number; w: number }>> = []
  for (let i = 0; i < layout.value.length; i++) {
    const row = layout.value[i]
    const refs = formattedRefs(row.commit)
    const offsets: Array<{ x: number; w: number }> = []
    // Start after container labels
    const clOffsets = containerLabelOffsets.value[i] ?? []
    const lastCl = clOffsets[clOffsets.length - 1]
    let x = lastCl ? lastCl.x + lastCl.w + 4 : 0
    for (const r of refs) {
      const w = r.text.length * 6 + 8
      offsets.push({ x, w })
      x += w + 4
    }
    // Hash text offset
    offsets.push({ x, w: 60 })
    result.push(offsets)
  }
  return result
})

/** Scroll the graph to put a commit's row into view and briefly flash it. */
function scrollToHash(hash: string) {
  const idx = layout.value.findIndex(r => r.commit.hash === hash)
  if (idx === -1 || !scrollEl.value) return
  const y = rowY(idx)
  const el = scrollEl.value
  const targetScroll = y - el.clientHeight / 2
  el.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  flashHash.value = hash
  setTimeout(() => { if (flashHash.value === hash) flashHash.value = null }, 1500)
}

defineExpose({ scrollToHash })
</script>
