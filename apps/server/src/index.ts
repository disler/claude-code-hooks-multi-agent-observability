import { resolve } from "node:path";
import { initDatabase, insertEvent, getFilterOptions, getRecentEvents, updateEventHITLResponse, queryEvents, tagEvent, exportEvents } from './db';
import type { HookEvent, HumanInTheLoopResponse } from './types';
import { processEventForRegistry, getAgentHierarchy } from './agentRegistry';
import {
  createTheme,
  updateThemeById,
  getThemeById,
  searchThemes,
  deleteThemeById,
  exportThemeById,
  importTheme,
  getThemeStats
} from './theme';

const projectRoot = resolve(import.meta.dir, '..', '..', '..');

// Initialize database
initDatabase();

// Store WebSocket clients
const wsClients = new Set<any>();

// Helper function to send response to agent via WebSocket
async function sendResponseToAgent(
  wsUrl: string,
  response: HumanInTheLoopResponse
): Promise<void> {
  console.log(`[HITL] Connecting to agent WebSocket: ${wsUrl}`);

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    };

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isResolved) return;
        console.log('[HITL] WebSocket connection opened, sending response...');

        try {
          ws!.send(JSON.stringify(response));
          console.log('[HITL] Response sent successfully');

          // Wait longer to ensure message fully transmits before closing
          setTimeout(() => {
            cleanup();
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          }, 500);
        } catch (error) {
          console.error('[HITL] Error sending message:', error);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[HITL] WebSocket error:', error);
        cleanup();
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      };

      ws.onclose = () => {
        console.log('[HITL] WebSocket connection closed');
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!isResolved) {
          console.error('[HITL] Timeout sending response to agent');
          cleanup();
          isResolved = true;
          reject(new Error('Timeout sending response to agent'));
        }
      }, 5000);

    } catch (error) {
      console.error('[HITL] Error creating WebSocket:', error);
      cleanup();
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    }
  });
}

// Try to start on desired port, fall back to next available ports
const desiredPort = parseInt(process.env.SERVER_PORT || '4000');
let actualPort = desiredPort;

function tryServe(port: number): ReturnType<typeof Bun.serve> | null {
  try {
    return Bun.serve({
      port,
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Handle CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // POST /events - Receive new events
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const event: HookEvent = await req.json();
        
        // Validate required fields
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        
        // Insert event into database
        const savedEvent = insertEvent(event);

        // Process event for agent registry
        const registryResult = processEventForRegistry(savedEvent);

        // Broadcast event to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            // Client disconnected, remove from set
            wsClients.delete(client);
          }
        });

        // Broadcast agent registry update if changed
        if (registryResult.changed || registryResult.isNew) {
          const agentMessage = JSON.stringify({ type: 'agent_update', data: registryResult.entry });
          wsClients.forEach(client => {
            try { client.send(agentMessage); } catch { wsClients.delete(client); }
          });
        }
        
        return new Response(JSON.stringify(savedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /events/filter-options - Get available filter options
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      const options = getFilterOptions();
      return new Response(JSON.stringify(options), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /events/recent - Get recent events
    if (url.pathname === '/events/recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '300');
      const events = getRecentEvents(limit);
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /events/:id/respond - Respond to HITL request
    if (url.pathname.match(/^\/events\/\d+\/respond$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2]);

      try {
        const response: HumanInTheLoopResponse = await req.json();
        response.respondedAt = Date.now();

        // Update event in database
        const updatedEvent = updateEventHITLResponse(id, response);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Send response to agent via WebSocket
        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try {
            await sendResponseToAgent(
              updatedEvent.humanInTheLoop.responseWebSocketUrl,
              response
            );
          } catch (error) {
            console.error('Failed to send response to agent:', error);
            // Don't fail the request if we can't reach the agent
          }
        }

        // Broadcast updated event to all connected clients
        const message = JSON.stringify({ type: 'event', data: updatedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing HITL response:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // Theme API endpoints
    // NOTE: Specific routes MUST be checked before generic startsWith routes
    // to avoid /api/themes/stats being handled by /api/themes/:id

    // GET /api/themes/stats - Get theme statistics (MUST be before :id route)
    if (url.pathname === '/api/themes/stats' && req.method === 'GET') {
      const result = await getThemeStats();
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /api/themes/import - Import a theme (MUST be before generic POST)
    if (url.pathname === '/api/themes/import' && req.method === 'POST') {
      try {
        const importData = await req.json();
        const authorId = url.searchParams.get('authorId');

        const result = await importTheme(importData, authorId || undefined);

        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error importing theme:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid import data'
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /api/themes - Create a new theme
    if (url.pathname === '/api/themes' && req.method === 'POST') {
      try {
        const themeData = await req.json();
        const result = await createTheme(themeData);
        
        const status = result.success ? 201 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error creating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GET /api/themes - Search themes
    if (url.pathname === '/api/themes' && req.method === 'GET') {
      const query = {
        query: url.searchParams.get('query') || undefined,
        isPublic: url.searchParams.get('isPublic') ? url.searchParams.get('isPublic') === 'true' : undefined,
        authorId: url.searchParams.get('authorId') || undefined,
        sortBy: url.searchParams.get('sortBy') as any || undefined,
        sortOrder: url.searchParams.get('sortOrder') as any || undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
      };
      
      const result = await searchThemes(query);
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // GET /api/themes/:id/export - Export a theme (MUST be before generic :id route)
    if (url.pathname.match(/^\/api\/themes\/[^\/]+\/export$/) && req.method === 'GET') {
      const id = url.pathname.split('/')[3];

      const result = await exportThemeById(id);
      if (!result.success) {
        const status = result.error?.includes('not found') ? 404 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(result.data), {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.data.theme.name}.json"`
        }
      });
    }

    // GET /api/themes/:id - Get a specific theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'GET') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const result = await getThemeById(id);
      const status = result.success ? 200 : 404;
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // PUT /api/themes/:id - Update a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'PUT') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      try {
        const updates = await req.json();
        const result = await updateThemeById(id, updates);
        
        const status = result.success ? 200 : 400;
        return new Response(JSON.stringify(result), {
          status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error updating theme:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Invalid request body' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // DELETE /api/themes/:id - Delete a theme
    if (url.pathname.startsWith('/api/themes/') && req.method === 'DELETE') {
      const id = url.pathname.split('/')[3];
      if (!id) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Theme ID is required' 
        }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const authorId = url.searchParams.get('authorId');
      const result = await deleteThemeById(id, authorId || undefined);
      
      const status = result.success ? 200 : (result.error?.includes('not found') ? 404 : 403);
      return new Response(JSON.stringify(result), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    
    // NOTE: /api/themes/import, /api/themes/stats, and /api/themes/:id/export
    // routes are all placed ABOVE the generic startsWith('/api/themes/') routes
    // to prevent shadowing by the generic :id handler.
    
    // GET /api/agents - Get agent registry with hierarchy
    if (url.pathname === '/api/agents' && req.method === 'GET') {
      const agents = getAgentHierarchy();
      return new Response(JSON.stringify(agents), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /health - Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', uptime: process.uptime() }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // GET /events/query - Query events with flexible filters
    if (url.pathname === '/events/query' && req.method === 'GET') {
      const filters = {
        type: url.searchParams.get('type') || undefined,
        session_id: url.searchParams.get('session_id') || undefined,
        source_app: url.searchParams.get('source_app') || undefined,
        since: url.searchParams.get('since') ? parseInt(url.searchParams.get('since')!) : undefined,
        until: url.searchParams.get('until') ? parseInt(url.searchParams.get('until')!) : undefined,
        tag: url.searchParams.get('tag') || undefined,
        signal_only: url.searchParams.get('signal_only') === 'true',
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
      };

      const result = queryEvents(filters);
      return new Response(JSON.stringify(result), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // POST /events/:id/tag - Tag an event
    if (url.pathname.match(/^\/events\/\d+\/tag$/) && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/')[2]);

      try {
        const body = await req.json() as { tags: string[]; note?: string };

        if (!body.tags || !Array.isArray(body.tags)) {
          return new Response(JSON.stringify({ error: 'tags must be an array of strings' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const updatedEvent = tagEvent(id, body.tags, body.note);

        if (!updatedEvent) {
          return new Response(JSON.stringify({ error: 'Event not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify(updatedEvent), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error tagging event:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /signals/rules - Read signal detection rules
    if (url.pathname === '/signals/rules' && req.method === 'GET') {
      try {
        const configPath = `${projectRoot}/.claude/observability.json`;
        const file = Bun.file(configPath);
        if (await file.exists()) {
          const config = await file.json();
          return new Response(JSON.stringify({ rules: config.auto_detect?.rules || [] }), {
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ rules: [] }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error reading signals rules:', error);
        return new Response(JSON.stringify({ rules: [] }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /signals/rules - Update signal detection rules
    if (url.pathname === '/signals/rules' && req.method === 'POST') {
      try {
        const body = await req.json() as { rules: any[] };

        if (!body.rules || !Array.isArray(body.rules)) {
          return new Response(JSON.stringify({ error: 'rules must be an array' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const configPath = `${projectRoot}/.claude/observability.json`;
        const file = Bun.file(configPath);
        let config: any = {};

        if (await file.exists()) {
          config = await file.json();
        }

        if (!config.auto_detect) {
          config.auto_detect = {};
        }
        config.auto_detect.rules = body.rules;

        await Bun.write(configPath, JSON.stringify(config, null, 2));

        return new Response(JSON.stringify({ rules: config.auto_detect.rules }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error updating signals rules:', error);
        return new Response(JSON.stringify({ error: 'Failed to update rules' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // GET /events/export - Export events in various formats
    if (url.pathname === '/events/export' && req.method === 'GET') {
      const filters = {
        type: url.searchParams.get('type') || undefined,
        session_id: url.searchParams.get('session_id') || undefined,
        source_app: url.searchParams.get('source_app') || undefined,
        since: url.searchParams.get('since') ? parseInt(url.searchParams.get('since')!) : undefined,
        until: url.searchParams.get('until') ? parseInt(url.searchParams.get('until')!) : undefined,
        tag: url.searchParams.get('tag') || undefined,
        signal_only: url.searchParams.get('signal_only') === 'true',
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 1000,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
      };
      const format = url.searchParams.get('format') || 'json';
      const events = exportEvents(filters);

      if (format === 'jsonl') {
        const lines = events.map(e => JSON.stringify(e)).join('\n');
        return new Response(lines, {
          headers: { ...headers, 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename="events.jsonl"' }
        });
      }

      if (format === 'csv') {
        const csvHeaders = ['id', 'source_app', 'session_id', 'hook_event_type', 'timestamp', 'summary', 'model_name', 'tags', 'payload'];
        const csvRows = events.map(e => [
          e.id,
          `"${(e.source_app || '').replace(/"/g, '""')}"`,
          `"${(e.session_id || '').replace(/"/g, '""')}"`,
          `"${(e.hook_event_type || '').replace(/"/g, '""')}"`,
          e.timestamp,
          `"${(e.summary || '').replace(/"/g, '""')}"`,
          `"${(e.model_name || '').replace(/"/g, '""')}"`,
          `"${JSON.stringify(e.tags || []).replace(/"/g, '""')}"`,
          `"${JSON.stringify(e.payload || {}).replace(/"/g, '""')}"`
        ].join(','));
        const csv = [csvHeaders.join(','), ...csvRows].join('\n');
        return new Response(csv, {
          headers: { ...headers, 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="events.csv"' }
        });
      }

      // Default: json
      return new Response(JSON.stringify(events), {
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="events.json"' }
      });
    }

    // POST /signals - Create an explicit signal event
    if (url.pathname === '/signals' && req.method === 'POST') {
      try {
        const body = await req.json() as {
          type: string;
          context: object;
          source_app?: string;
          session_id?: string;
          tags?: string[];
        };

        if (!body.type || !body.context) {
          return new Response(JSON.stringify({ error: 'type and context are required' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const event: HookEvent = {
          source_app: body.source_app || 'signals-api',
          session_id: body.session_id || `signal-${Date.now()}`,
          hook_event_type: 'ExplicitSignal',
          payload: { type: body.type, context: body.context },
          tags: body.tags || [],
          timestamp: Date.now()
        };

        const savedEvent = insertEvent(event);

        // Broadcast to all WebSocket clients
        const message = JSON.stringify({ type: 'event', data: savedEvent });
        wsClients.forEach(client => {
          try {
            client.send(message);
          } catch (err) {
            wsClients.delete(client);
          }
        });

        return new Response(JSON.stringify(savedEvent), {
          status: 201,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error creating signal:', error);
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // WebSocket upgrade
    if (url.pathname === '/stream') {
      const success = server!.upgrade(req);
      if (success) {
        return undefined;
      }
    }
    
    // Default response
    return new Response('Multi-Agent Observability Server', {
      headers: { ...headers, 'Content-Type': 'text/plain' }
    });
  },
  
  websocket: {
    open(ws) {
      console.log('WebSocket client connected');
      wsClients.add(ws);

      // Send recent events on connection
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: 'initial', data: events }));

      // Send agent registry on connection
      const agents = getAgentHierarchy();
      ws.send(JSON.stringify({ type: 'agent_registry', data: agents }));
    },
    
    message(ws, message) {
      // Handle any client messages if needed
      console.log('Received message:', message);
    },
    
    close(ws) {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    },
    
    error(ws, error) {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    }
  }
});
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as {code: string}).code === 'EADDRINUSE') {
      return null; // Port in use, caller will retry
    }
    throw e;
  }
}

// Try up to 10 ports starting from desired
// eslint-disable-next-line prefer-const
let server: ReturnType<typeof Bun.serve> | null = null; // referenced inside fetch for ws upgrade
for (let p = desiredPort; p < desiredPort + 10; p++) {
  server = tryServe(p);
  if (server) {
    actualPort = p;
    break;
  }
  console.log(`Port ${p} in use, trying ${p + 1}...`);
}

if (!server) {
  console.error(`Could not find an available port in range ${desiredPort}-${desiredPort + 9}`);
  process.exit(1);
}

console.log(`🚀 Server running on http://localhost:${actualPort}`);
console.log(`📊 WebSocket endpoint: ws://localhost:${actualPort}/stream`);
console.log(`📮 POST events to: http://localhost:${actualPort}/events`);