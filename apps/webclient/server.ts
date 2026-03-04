/**
 * Webclient static server — serves both SPAs on a single port.
 *   /            → apps/client/dist/
 *   /dashboard/* → apps/dashboard/dist/
 */

import { join } from 'node:path'

const PORT = Number(process.env.OBSERVABILITY_CLIENT_PORT ?? 4001)
const HOST = process.env.OBSERVABILITY_CLIENT_HOST ?? '127.0.0.1'

const CLIENT_DIST = join(import.meta.dir, '../client/dist')
const DASHBOARD_DIST = join(import.meta.dir, '../dashboard/dist')

async function serveStatic(distDir: string, urlPath: string): Promise<Response> {
  // Normalise path: strip leading slash, default to index.html
  let filePath = urlPath.replace(/^\/+/, '') || 'index.html'

  let file = Bun.file(join(distDir, filePath))
  if (!(await file.exists())) {
    // SPA fallback: serve index.html for unknown paths
    file = Bun.file(join(distDir, 'index.html'))
  }
  if (!(await file.exists())) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(file)
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname.startsWith('/dashboard')) {
      // Strip the /dashboard prefix before looking up the file
      const subPath = url.pathname.slice('/dashboard'.length) || '/'
      return serveStatic(DASHBOARD_DIST, subPath)
    }

    return serveStatic(CLIENT_DIST, url.pathname)
  },
})

console.log(`🌐 Webclient server running on http://${HOST}:${server.port}`)
console.log(`   Event stream client: http://${HOST}:${server.port}/`)
console.log(`   Infrastructure dashboard: http://${HOST}:${server.port}/dashboard`)
