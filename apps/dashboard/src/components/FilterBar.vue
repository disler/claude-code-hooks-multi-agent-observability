<template>
  <div class="flex items-center gap-3 flex-wrap">
    <select
      v-model="repoFilter"
      class="text-sm bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-slate-400"
      @change="emit('update:repoFilter', repoFilter)"
    >
      <option value="">All repos</option>
      <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
    </select>

    <select
      v-model="hostFilter"
      class="text-sm bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-slate-400"
      @change="emit('update:hostFilter', hostFilter)"
    >
      <option value="">All hosts</option>
      <option v-for="h in hosts" :key="h" :value="h">{{ alias(h) }}</option>
    </select>

    <select
      v-model="connectionFilter"
      class="text-sm bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-slate-400"
      @change="emit('update:connectionFilter', connectionFilter)"
    >
      <option value="">All</option>
      <option value="online">Online only</option>
      <option value="offline">Offline only</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useHostnameAliases } from '../composables/useHostnameAliases'

const { alias } = useHostnameAliases()

const props = defineProps<{
  repos: string[]
  hosts: string[]
  modelRepoFilter: string
  modelHostFilter: string
  modelConnectionFilter: string
}>()

const emit = defineEmits<{
  'update:repoFilter': [value: string]
  'update:hostFilter': [value: string]
  'update:connectionFilter': [value: string]
}>()

const repoFilter = ref(props.modelRepoFilter)
const hostFilter = ref(props.modelHostFilter)
const connectionFilter = ref(props.modelConnectionFilter)

watch(() => props.modelRepoFilter, v => { repoFilter.value = v })
watch(() => props.modelHostFilter, v => { hostFilter.value = v })
watch(() => props.modelConnectionFilter, v => { connectionFilter.value = v })
</script>
