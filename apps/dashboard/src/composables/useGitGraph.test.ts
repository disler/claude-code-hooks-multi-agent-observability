import { describe, test, expect } from 'bun:test'
import { computeLayout } from './useGitGraph'
import type { GitCommit } from '../types'

// Helper to build a commit
const c = (hash: string, parents: string[], refs: string[] = [], author_date = 0): GitCommit =>
  ({ hash, parents, refs, subject: hash, author_date })

describe('computeLayout – basic linear chain', () => {
  // A → B → C (C is newest / HEAD)
  const commits = [
    c('C', ['B'], ['HEAD -> main'], 300),
    c('B', ['A'], [], 200),
    c('A', [],    [], 100),
  ]

  test('produces one lane', () => {
    const layout = computeLayout(commits)
    expect(layout.map(r => r.lane)).toEqual([0, 0, 0])
  })

  test('sorted newest-first', () => {
    const layout = computeLayout(commits)
    expect(layout.map(r => r.commit.hash)).toEqual(['C', 'B', 'A'])
  })
})

describe('computeLayout – simple two-branch merge', () => {
  // main: A → B → D (merge)
  // feat: A → C → D (merge second parent)
  // D has parents [B, C]
  const commits = [
    c('D', ['B', 'C'], ['HEAD -> main'], 400),
    c('B', ['A'], [],  200),
    c('C', ['A'], [],  300),
    c('A', [],    [],  100),
  ]

  test('D is in lane 0, B in lane 0, C in lane 1', () => {
    const layout = computeLayout(commits)
    const byHash = Object.fromEntries(layout.map(r => [r.commit.hash, r]))
    expect(byHash['D'].lane).toBe(0)
    expect(byHash['B'].lane).toBe(0)  // first parent of D
    expect(byHash['C'].lane).toBe(1)  // second parent of D
  })

  test('max 2 lanes active simultaneously', () => {
    const layout = computeLayout(commits)
    const maxLanes = Math.max(...layout.map(r => r.activeLanesAfter.length))
    expect(maxLanes).toBeLessThanOrEqual(2)
  })
})

describe('computeLayout – orphan tip (no branch, no children)', () => {
  // main: A → B → C (C has ref)
  // orphan: X → A (X has no ref, no children in set)
  const commits = [
    c('C', ['B'], ['HEAD -> main'], 400),
    c('B', ['A'], [],              300),
    c('X', ['A'], [],              250), // orphan tip: no refs, no children
    c('A', [],    [],              100),
  ]

  test('X is processed somewhere (not at position 0 before C)', () => {
    const layout = computeLayout(commits)
    const positions = Object.fromEntries(layout.map((r, i) => [r.commit.hash, i]))
    // C (HEAD) should come before X (orphan tip)
    expect(positions['C']).toBeLessThan(positions['X'])
  })

  test('max lanes never exceeds 2 (X and main share lane via parent A)', () => {
    const layout = computeLayout(commits)
    const maxLanes = Math.max(...layout.map(r => r.activeLanesAfter.length))
    // X and main converge at A, so max 2 lanes open at once
    expect(maxLanes).toBeLessThanOrEqual(2)
  })
})

describe('computeLayout – multiple orphan tips with same parent', () => {
  // main: A → B (B has ref)
  // orphan1: X → A (no refs, date 150)
  // orphan2: Y → A (no refs, date 130)
  const commits = [
    c('B', ['A'], ['HEAD -> main'], 200),
    c('X', ['A'], [],              150),
    c('Y', ['A'], [],              130),
    c('A', [],    [],              100),
  ]

  test('B appears first (has ref, newest), X before Y (date order), A last', () => {
    const layout = computeLayout(commits)
    const positions = Object.fromEntries(layout.map((r, i) => [r.commit.hash, i]))
    expect(positions['B']).toBeLessThan(positions['X'])
    expect(positions['X']).toBeLessThan(positions['Y'])
  })

  test('max lanes does not exceed 3', () => {
    const layout = computeLayout(commits)
    const maxLanes = Math.max(...layout.map(r => r.activeLanesAfter.length))
    // B, X, Y all converge at A: at most 3 lanes momentarily open
    expect(maxLanes).toBeLessThanOrEqual(3)
  })
})

describe('computeLayout – real-world linear history excerpt', () => {
  // Simulate a portion of the observability repo: single long linear chain + a merge
  const mainChain = Array.from({ length: 15 }, (_, i) => {
    const hash = `m${String(15 - i).padStart(2, '0')}`
    const parent = i < 14 ? `m${String(14 - i).padStart(2, '0')}` : ''
    return c(hash, parent ? [parent] : [], i === 0 ? ['HEAD -> main'] : [], (15 - i) * 100)
  })

  test('linear chain stays in lane 0', () => {
    const layout = computeLayout(mainChain)
    expect(layout.every(r => r.lane === 0)).toBe(true)
  })

  test('max lanes = 1', () => {
    const layout = computeLayout(mainChain)
    const maxLanes = Math.max(...layout.map(r => Math.max(r.activeLanesAfter.length, r.activeLanesBefore.length)))
    expect(maxLanes).toBeLessThanOrEqual(1)
  })
})

describe('computeLayout – orphan tip date ordering vs non-orphan', () => {
  // Orphan tip O has date 500 (newer than non-orphan tip N at date 400)
  // Main HEAD M has date 600
  // In topo sort, if O is not deferred, it would appear before N
  const commits = [
    c('M', ['N'], ['HEAD -> main'], 600),
    c('N', ['A'], ['origin/main'],  400),
    c('O', ['A'], [],              500),  // orphan tip, newer than N but older than M
    c('A', [],    [],              100),
  ]

  test('M is first (newest HEAD)', () => {
    const layout = computeLayout(commits)
    expect(layout[0].commit.hash).toBe('M')
  })

  test('O appears before N (O is newer than N, both are tips)', () => {
    const layout = computeLayout(commits)
    const positions = Object.fromEntries(layout.map((r, i) => [r.commit.hash, i]))
    // O (date 500) should come before N (date 400) since both are tips and O is newer
    expect(positions['O']).toBeLessThan(positions['N'])
  })
})
