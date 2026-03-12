import { ref } from 'vue'
import { API_BASE } from '../config'
import type { GitViewData } from '../types'

export interface CommitDetail { message: string; diffstat: string }

export function useGitView() {
  const data = ref<GitViewData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const detailCache = new Map<string, CommitDetail>()

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

  async function fetchCommitDetail(repo: string, hash: string): Promise<CommitDetail> {
    const cached = detailCache.get(hash)
    if (cached) return cached
    try {
      const res = await fetch(`${API_BASE}/dashboard/git-show/${encodeURIComponent(repo)}/${hash}`)
      if (!res.ok) return { message: '', diffstat: '' }
      const json = await res.json()
      const detail: CommitDetail = { message: json.message ?? '', diffstat: json.diffstat ?? '' }
      detailCache.set(hash, detail)
      return detail
    } catch {
      return { message: '', diffstat: '' }
    }
  }

  return { data, loading, error, fetchGitView, fetchCommitDetail }
}
