import { API_BASE } from '../config'
import type { PlanqTask } from '../types'

export function usePlanq() {
  async function addTask(
    containerId: string,
    taskType: string,
    filename: string | null,
    description: string | null,
    createFile = false,
    commitMode: 'none' | 'auto' | 'stage' | 'manual' = 'none',
    planDisposition?: 'manual' | 'add-after' | 'add-end',
    autoQueuePlan?: boolean,
    parentTaskId?: number,
    linkType?: 'follow-up' | 'fix-required' | 'check' | 'other'
  ): Promise<PlanqTask | null> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: taskType, filename, description, create_file: createFile, commit_mode: commitMode, auto_commit: commitMode === 'auto', plan_disposition: planDisposition, auto_queue_plan: autoQueuePlan, parent_task_id: parentTaskId, link_type: linkType }),
      })
      if (!res.ok) return null
      return await res.json() as PlanqTask
    } catch {
      return null
    }
  }

  async function updateTask(
    containerId: string,
    taskId: number,
    updates: { description?: string; status?: string; auto_commit?: boolean; commit_mode?: 'none' | 'auto' | 'stage' | 'manual'; review_status?: string }
  ): Promise<PlanqTask | null> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) return null
      return await res.json() as PlanqTask
    } catch {
      return null
    }
  }

  async function deleteTask(containerId: string, taskId: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks/${taskId}`, {
        method: 'DELETE',
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function reorderTasks(containerId: string, reorder: Array<{ id: number; position: number }>): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reorder),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function readFile(containerId: string, filename: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/file/${encodeURIComponent(filename)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.content ?? ''
    } catch {
      return null
    }
  }

  async function listPlansFiles(containerId: string): Promise<string[]> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/plans-files`)
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }

  async function writeFile(containerId: string, filename: string, content: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/file/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function fetchArchive(containerId: string): Promise<import('../types').PlanqItem[]> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/archive`)
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }

  async function archiveTask(containerId: string, taskId: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks/${taskId}/archive`, {
        method: 'POST',
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function archiveDone(containerId: string): Promise<number> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/tasks/archive-done`, {
        method: 'POST',
      })
      if (!res.ok) return 0
      const data = await res.json()
      return data.archived ?? 0
    } catch {
      return 0
    }
  }

  async function respondToAutoTest(containerId: string, response: 'continue' | 'abort'): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/planq/${encodeURIComponent(containerId)}/auto-test/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  return { addTask, updateTask, deleteTask, reorderTasks, readFile, writeFile, listPlansFiles, fetchArchive, archiveTask, archiveDone, respondToAutoTest }

}
