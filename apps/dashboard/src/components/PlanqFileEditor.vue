<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="closeIfUnchanged" @keydown.escape.stop="closeIfUnchanged" @keydown="onConfirmKey($event, save)">
    <div class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-2/3 max-w-3xl flex flex-col gap-4 max-h-[80vh]">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-200 font-mono">{{ filename }}</h3>
        <button @click="emit('close')" class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <div v-if="loading" class="text-xs text-slate-400">Loading...</div>
      <div v-else-if="error" class="text-xs text-red-400">{{ error }}</div>
      <textarea
        v-else
        v-model="content"
        class="flex-1 bg-slate-900 border border-slate-600 rounded p-3 text-sm font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-400 min-h-64"
      />

      <div class="flex justify-end gap-2">
        <button
          @click="emit('close')"
          class="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
        >Cancel</button>
        <button
          @click="save"
          :disabled="loading || !!error || saving"
          class="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
        >{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import { useConfirmKey } from '../composables/useConfirmKey'

const props = defineProps<{
  containerId: string
  filename: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { readFile, writeFile } = usePlanq()
const { onConfirmKey } = useConfirmKey()
const content = ref('')
const originalContent = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')

function closeIfUnchanged() {
  if (content.value !== originalContent.value) {
    if (!confirm('You have unsaved changes. Close without saving?')) return
  }
  emit('close')
}

onMounted(async () => {
  const result = await readFile(props.containerId, props.filename)
  loading.value = false
  if (result === null) {
    error.value = 'Failed to load file (container may be offline)'
  } else {
    content.value = result
    originalContent.value = result
  }
})

async function save() {
  saving.value = true
  const ok = await writeFile(props.containerId, props.filename, content.value)
  saving.value = false
  if (ok) {
    emit('saved')
    emit('close')
  } else {
    error.value = 'Save failed (container may be offline)'
  }
}
</script>
