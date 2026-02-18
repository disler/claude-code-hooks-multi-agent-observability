import { Database } from 'bun:sqlite';
import type { HookEvent, FilterOptions, Theme, ThemeSearchQuery, AgentRegistryEntry } from './types';

let db: Database;

export function initDatabase(): void {
  db = new Database('events.db');
  
  // Enable WAL mode for better concurrent performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  
  // Create events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      hook_event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      chat TEXT,
      summary TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  // Check if chat column exists, add it if not (for migration)
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all() as any[];
    const hasChatColumn = columns.some((col: any) => col.name === 'chat');
    if (!hasChatColumn) {
      db.exec('ALTER TABLE events ADD COLUMN chat TEXT');
    }

    // Check if summary column exists, add it if not (for migration)
    const hasSummaryColumn = columns.some((col: any) => col.name === 'summary');
    if (!hasSummaryColumn) {
      db.exec('ALTER TABLE events ADD COLUMN summary TEXT');
    }

    // Check if humanInTheLoop column exists, add it if not (for migration)
    const hasHumanInTheLoopColumn = columns.some((col: any) => col.name === 'humanInTheLoop');
    if (!hasHumanInTheLoopColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoop TEXT');
    }

    // Check if humanInTheLoopStatus column exists, add it if not (for migration)
    const hasHumanInTheLoopStatusColumn = columns.some((col: any) => col.name === 'humanInTheLoopStatus');
    if (!hasHumanInTheLoopStatusColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoopStatus TEXT');
    }

    // Check if model_name column exists, add it if not (for migration)
    const hasModelNameColumn = columns.some((col: any) => col.name === 'model_name');
    if (!hasModelNameColumn) {
      db.exec('ALTER TABLE events ADD COLUMN model_name TEXT');
    }

    // Check if tags column exists, add it if not (for migration)
    const hasTagsColumn = columns.some((col: any) => col.name === 'tags');
    if (!hasTagsColumn) {
      db.exec("ALTER TABLE events ADD COLUMN tags TEXT DEFAULT '[]'");
    }

    // Check if notes column exists, add it if not (for migration)
    const hasNotesColumn = columns.some((col: any) => col.name === 'notes');
    if (!hasNotesColumn) {
      db.exec("ALTER TABLE events ADD COLUMN notes TEXT DEFAULT '[]'");
    }
  } catch (error) {
    // If the table doesn't exist yet, the CREATE TABLE above will handle it
  }

  // Create indexes for common queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_source_app ON events(source_app)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_hook_event_type ON events(hook_event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_tags ON events(tags)');
  
  // Create themes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      displayName TEXT NOT NULL,
      description TEXT,
      colors TEXT NOT NULL,
      isPublic INTEGER NOT NULL DEFAULT 0,
      authorId TEXT,
      authorName TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      tags TEXT,
      downloadCount INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      ratingCount INTEGER DEFAULT 0
    )
  `);
  
  // Create theme shares table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_shares (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      shareToken TEXT NOT NULL UNIQUE,
      expiresAt INTEGER,
      isPublic INTEGER NOT NULL DEFAULT 0,
      allowedUsers TEXT,
      createdAt INTEGER NOT NULL,
      accessCount INTEGER DEFAULT 0,
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create theme ratings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_ratings (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(themeId, userId),
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes for theme tables
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_isPublic ON themes(isPublic)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_createdAt ON themes(createdAt)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_shares_token ON theme_shares(shareToken)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_ratings_theme ON theme_ratings(themeId)');

  // Create agent_registry table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id TEXT PRIMARY KEY,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      display_name TEXT,
      agent_type TEXT,
      model_name TEXT,
      short_agent_id TEXT,
      parent_id TEXT,
      team_name TEXT,
      first_prompt TEXT,
      lifecycle_status TEXT DEFAULT 'active',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      event_count INTEGER DEFAULT 0
    )
  `);

  // Create indexes for agent_registry
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_registry_source_app ON agent_registry(source_app)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_registry_session_id ON agent_registry(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_registry_parent_id ON agent_registry(parent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_registry_team_name ON agent_registry(team_name)');
}

export function insertEvent(event: HookEvent): HookEvent {
  const stmt = db.prepare(`
    INSERT INTO events (source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const timestamp = event.timestamp || Date.now();

  // Initialize humanInTheLoopStatus to pending if humanInTheLoop exists
  let humanInTheLoopStatus = event.humanInTheLoopStatus;
  if (event.humanInTheLoop && !humanInTheLoopStatus) {
    humanInTheLoopStatus = { status: 'pending' };
  }

  const result = stmt.run(
    event.source_app,
    event.session_id,
    event.hook_event_type,
    JSON.stringify(event.payload),
    event.chat ? JSON.stringify(event.chat) : null,
    event.summary || null,
    timestamp,
    event.humanInTheLoop ? JSON.stringify(event.humanInTheLoop) : null,
    humanInTheLoopStatus ? JSON.stringify(humanInTheLoopStatus) : null,
    event.model_name || null,
    JSON.stringify(event.tags || []),
    JSON.stringify(event.notes || [])
  );

  return {
    ...event,
    id: result.lastInsertRowid as number,
    timestamp,
    humanInTheLoopStatus,
    tags: event.tags || [],
    notes: event.notes || []
  };
}

export function getFilterOptions(): FilterOptions {
  const sourceApps = db.prepare('SELECT DISTINCT source_app FROM events ORDER BY source_app').all() as { source_app: string }[];
  const sessionIds = db.prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 300').all() as { session_id: string }[];
  const hookEventTypes = db.prepare('SELECT DISTINCT hook_event_type FROM events ORDER BY hook_event_type').all() as { hook_event_type: string }[];
  
  return {
    source_apps: sourceApps.map(row => row.source_app),
    session_ids: sessionIds.map(row => row.session_id),
    hook_event_types: hookEventTypes.map(row => row.hook_event_type)
  };
}

export function getRecentEvents(limit: number = 300): HookEvent[] {
  const stmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes
    FROM events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map(row => parseEventRow(row)).reverse();
}

// Theme database functions
export function insertTheme(theme: Theme): Theme {
  const stmt = db.prepare(`
    INSERT INTO themes (id, name, displayName, description, colors, isPublic, authorId, authorName, createdAt, updatedAt, tags, downloadCount, rating, ratingCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    theme.id,
    theme.name,
    theme.displayName,
    theme.description || null,
    JSON.stringify(theme.colors),
    theme.isPublic ? 1 : 0,
    theme.authorId || null,
    theme.authorName || null,
    theme.createdAt,
    theme.updatedAt,
    JSON.stringify(theme.tags),
    theme.downloadCount || 0,
    theme.rating || 0,
    theme.ratingCount || 0
  );
  
  return theme;
}

export function updateTheme(id: string, updates: Partial<Theme>): boolean {
  const allowedFields = ['displayName', 'description', 'colors', 'isPublic', 'updatedAt', 'tags'];
  const setClause = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .map(key => `${key} = ?`)
    .join(', ');
  
  if (!setClause) return false;
  
  const values = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .map(key => {
      if (key === 'colors' || key === 'tags') {
        return JSON.stringify(updates[key as keyof Theme]);
      }
      if (key === 'isPublic') {
        return updates[key as keyof Theme] ? 1 : 0;
      }
      return updates[key as keyof Theme];
    });
  
  const stmt = db.prepare(`UPDATE themes SET ${setClause} WHERE id = ?`);
  const result = stmt.run(...values, id);
  
  return result.changes > 0;
}

export function getTheme(id: string): Theme | null {
  const stmt = db.prepare('SELECT * FROM themes WHERE id = ?');
  const row = stmt.get(id) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  };
}

export function getThemes(query: ThemeSearchQuery = {}): Theme[] {
  let sql = 'SELECT * FROM themes WHERE 1=1';
  const params: any[] = [];
  
  if (query.isPublic !== undefined) {
    sql += ' AND isPublic = ?';
    params.push(query.isPublic ? 1 : 0);
  }
  
  if (query.authorId) {
    sql += ' AND authorId = ?';
    params.push(query.authorId);
  }
  
  if (query.query) {
    sql += ' AND (name LIKE ? OR displayName LIKE ? OR description LIKE ?)';
    const searchTerm = `%${query.query}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Add sorting (validate to prevent SQL injection)
  const sortBy = query.sortBy || 'created';
  const validSortOrders = ['asc', 'desc'] as const;
  const sortOrder = validSortOrders.includes(
    (query.sortOrder || 'desc').toLowerCase() as typeof validSortOrders[number]
  ) ? (query.sortOrder || 'desc').toUpperCase() : 'DESC';
  const sortColumn = {
    name: 'name',
    created: 'createdAt',
    updated: 'updatedAt',
    downloads: 'downloadCount',
    rating: 'rating'
  }[sortBy] || 'createdAt';

  sql += ` ORDER BY ${sortColumn} ${sortOrder}`;
  
  // Add pagination
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
    
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
  }
  
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  }));
}

export function deleteTheme(id: string): boolean {
  const stmt = db.prepare('DELETE FROM themes WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function incrementThemeDownloadCount(id: string): boolean {
  const stmt = db.prepare('UPDATE themes SET downloadCount = downloadCount + 1 WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// Shared helper to parse a raw database row into a HookEvent
function parseEventRow(row: any): HookEvent {
  const tags = row.tags ? JSON.parse(row.tags) : [];
  const notes = row.notes ? JSON.parse(row.notes) : [];
  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined,
    tags: tags.length > 0 ? tags : undefined,
    notes: notes.length > 0 ? notes : undefined
  };
}

// HITL helper functions
export function updateEventHITLResponse(id: number, response: any): HookEvent | null {
  const status = {
    status: 'responded',
    respondedAt: response.respondedAt,
    response
  };

  const stmt = db.prepare('UPDATE events SET humanInTheLoopStatus = ? WHERE id = ?');
  stmt.run(JSON.stringify(status), id);

  const selectStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes
    FROM events
    WHERE id = ?
  `);
  const row = selectStmt.get(id) as any;

  if (!row) return null;

  return parseEventRow(row);
}

// Query events with flexible filtering
export interface QueryEventsFilters {
  type?: string;
  session_id?: string;
  source_app?: string;
  since?: number;
  until?: number;
  tag?: string;
  signal_only?: boolean;
  limit?: number;
  offset?: number;
}

export function queryEvents(filters: QueryEventsFilters): { events: HookEvent[]; total: number } {
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.type) {
    conditions.push('hook_event_type = ?');
    params.push(filters.type);
  }
  if (filters.session_id) {
    conditions.push('session_id = ?');
    params.push(filters.session_id);
  }
  if (filters.source_app) {
    conditions.push('source_app = ?');
    params.push(filters.source_app);
  }
  if (filters.since) {
    conditions.push('timestamp >= ?');
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push('timestamp <= ?');
    params.push(filters.until);
  }
  if (filters.tag) {
    conditions.push("tags LIKE ?");
    params.push(`%"${filters.tag}"%`);
  }
  if (filters.signal_only) {
    conditions.push("hook_event_type = 'ExplicitSignal'");
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM events WHERE ${whereClause}`);
  const countResult = countStmt.get(...params) as any;
  const total = countResult.count;

  // Get paginated results
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const dataStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes
    FROM events
    WHERE ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const rows = dataStmt.all(...params, limit, offset) as any[];
  const events = rows.map(row => parseEventRow(row));

  return { events, total };
}

// Tag an event: merge new tags (union, no duplicates), append note with timestamp
export function tagEvent(id: number, tags: string[], note?: string): HookEvent | null {
  // Get current event
  const selectStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes
    FROM events
    WHERE id = ?
  `);
  const row = selectStmt.get(id) as any;
  if (!row) return null;

  // Merge tags (union, no duplicates)
  const existingTags: string[] = row.tags ? JSON.parse(row.tags) : [];
  const mergedTags = [...new Set([...existingTags, ...tags])];

  // Append note if provided
  const existingNotes: Array<{ text: string; timestamp: number; source?: string }> = row.notes ? JSON.parse(row.notes) : [];
  if (note) {
    existingNotes.push({
      text: note,
      timestamp: Date.now(),
      source: 'api'
    });
  }

  // Update the event
  const updateStmt = db.prepare('UPDATE events SET tags = ?, notes = ? WHERE id = ?');
  updateStmt.run(JSON.stringify(mergedTags), JSON.stringify(existingNotes), id);

  // Return the updated event
  const updatedRow = selectStmt.get(id) as any;
  return updatedRow ? parseEventRow(updatedRow) : null;
}

// Export events matching filters
export function exportEvents(filters: QueryEventsFilters): HookEvent[] {
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.type) {
    conditions.push('hook_event_type = ?');
    params.push(filters.type);
  }
  if (filters.session_id) {
    conditions.push('session_id = ?');
    params.push(filters.session_id);
  }
  if (filters.source_app) {
    conditions.push('source_app = ?');
    params.push(filters.source_app);
  }
  if (filters.since) {
    conditions.push('timestamp >= ?');
    params.push(filters.since);
  }
  if (filters.until) {
    conditions.push('timestamp <= ?');
    params.push(filters.until);
  }
  if (filters.tag) {
    conditions.push("tags LIKE ?");
    params.push(`%"${filters.tag}"%`);
  }
  if (filters.signal_only) {
    conditions.push("hook_event_type = 'ExplicitSignal'");
  }

  const whereClause = conditions.join(' AND ');
  const limit = filters.limit || 1000;
  const offset = filters.offset || 0;

  const stmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name, tags, notes
    FROM events
    WHERE ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(...params, limit, offset) as any[];
  return rows.map(row => parseEventRow(row));
}

// Agent registry helper functions
export function upsertAgent(entry: Partial<AgentRegistryEntry> & { id: string }): void {
  const existing = getAgent(entry.id);

  if (existing) {
    // Update existing entry
    const fields: string[] = [];
    const values: any[] = [];

    if (entry.display_name !== undefined) { fields.push('display_name = ?'); values.push(entry.display_name); }
    if (entry.agent_type !== undefined) { fields.push('agent_type = ?'); values.push(entry.agent_type); }
    if (entry.model_name !== undefined) { fields.push('model_name = ?'); values.push(entry.model_name); }
    if (entry.short_agent_id !== undefined) { fields.push('short_agent_id = ?'); values.push(entry.short_agent_id); }
    if (entry.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(entry.parent_id); }
    if (entry.team_name !== undefined) { fields.push('team_name = ?'); values.push(entry.team_name); }
    if (entry.first_prompt !== undefined) { fields.push('first_prompt = ?'); values.push(entry.first_prompt); }
    if (entry.lifecycle_status !== undefined) { fields.push('lifecycle_status = ?'); values.push(entry.lifecycle_status); }
    if (entry.last_seen_at !== undefined) { fields.push('last_seen_at = ?'); values.push(entry.last_seen_at); }
    if (entry.event_count !== undefined) { fields.push('event_count = ?'); values.push(entry.event_count); }

    if (fields.length > 0) {
      values.push(entry.id);
      db.prepare(`UPDATE agent_registry SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  } else {
    // Insert new entry
    db.prepare(`
      INSERT INTO agent_registry (id, source_app, session_id, display_name, agent_type, model_name, short_agent_id, parent_id, team_name, first_prompt, lifecycle_status, first_seen_at, last_seen_at, event_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.source_app || '',
      entry.session_id || '',
      entry.display_name || null,
      entry.agent_type || null,
      entry.model_name || null,
      entry.short_agent_id || null,
      entry.parent_id || null,
      entry.team_name || null,
      entry.first_prompt || null,
      entry.lifecycle_status || 'active',
      entry.first_seen_at || Date.now(),
      entry.last_seen_at || Date.now(),
      entry.event_count || 0
    );
  }
}

export function getAgent(id: string): AgentRegistryEntry | null {
  const row = db.prepare('SELECT * FROM agent_registry WHERE id = ?').get(id) as any;
  if (!row) return null;
  return parseAgentRow(row);
}

export function getAllAgents(): AgentRegistryEntry[] {
  const rows = db.prepare('SELECT * FROM agent_registry ORDER BY first_seen_at ASC').all() as any[];
  return rows.map(parseAgentRow);
}

export function getAgentsByParent(parentId: string): AgentRegistryEntry[] {
  const rows = db.prepare('SELECT * FROM agent_registry WHERE parent_id = ? ORDER BY first_seen_at ASC').all(parentId) as any[];
  return rows.map(parseAgentRow);
}

export function updateAgentField(id: string, field: string, value: any): void {
  const allowedFields = ['display_name', 'agent_type', 'model_name', 'short_agent_id', 'parent_id', 'team_name', 'first_prompt', 'lifecycle_status', 'last_seen_at', 'event_count'];
  if (!allowedFields.includes(field)) return;
  db.prepare(`UPDATE agent_registry SET ${field} = ? WHERE id = ?`).run(value, id);
}

function parseAgentRow(row: any): AgentRegistryEntry {
  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    display_name: row.display_name || '',
    agent_type: row.agent_type || '',
    model_name: row.model_name || null,
    short_agent_id: row.short_agent_id || null,
    parent_id: row.parent_id || null,
    team_name: row.team_name || null,
    first_prompt: row.first_prompt || null,
    lifecycle_status: row.lifecycle_status || 'active',
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    event_count: row.event_count || 0,
  };
}

export { db };