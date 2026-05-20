export interface PageDef { key: string; label: string }

// Top-level menu after lifecycle redesign.
//   - Portfolio = home (lifecycle grid across every project)
//   - Today     = tactical daily driver (was Dashboard)
//   - Memory    = unchanged
//   - Swarm     = unchanged
// Removed from top level (moved INTO project shell):
//   workspace, project, vibe, review.
// They're still reachable via direct URL + the project shell's stage tabs.
export const PAGES: PageDef[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'ideas',     label: 'Ideas' },
  { key: 'today',     label: 'Today' },
  { key: 'memory',    label: 'Memory' },
  { key: 'swarm',     label: 'Swarm' },
  { key: 'orgchart',  label: 'Org Chart' },
  { key: 'cost',      label: 'Cost' },
];
