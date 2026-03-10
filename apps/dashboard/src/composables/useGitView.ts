import { ref } from 'vue'
import { API_BASE } from '../config'
import type { GitViewData } from '../types'

export function useGitView() {
  const data = ref<GitViewData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const diffstatCache = new Map<string, string>()

  async function fetchGitView(repo: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/dashboard/git-view/${encodeURIComponent(repo)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value = await res.json()
    } catch (e: any) {
      error.value = e.message ?? 'Failed to load git view'
    } finally {
      loading.value = false
    }
  }

  async function fetchDiffstat(repo: string, hash: string): Promise<string> {
    if (diffstatCache.has(hash)) return diffstatCache.get(hash)!
    try {
      const res = await fetch(`${API_BASE}/dashboard/git-show/${encodeURIComponent(repo)}/${hash}`)
      if (!res.ok) return ''
      const json = await res.json()
      const diffstat: string = json.diffstat ?? ''
      diffstatCache.set(hash, diffstat)
      return diffstat
    } catch {
      return ''
    }
  }

  return { data, loading, error, fetchGitView, fetchDiffstat }
}
