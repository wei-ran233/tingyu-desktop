import { protocol } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MAX_PLUGIN_FILE_BYTES, PluginSecurityError, isSafePluginPath } from '@common/plugin/security'
import { PLUGIN_SCHEME } from '@common/plugin/types'
import type { PluginService } from './service'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
}

export const PLUGIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "media-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export const registerPluginScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PLUGIN_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      },
    },
  ])
}

export const installPluginProtocol = (service: PluginService, target: Electron.Protocol = protocol, allowedPluginId?: string, runtimeBootstrap = false) => {
  target.handle(PLUGIN_SCHEME, async(request) => {
    const headers = {
      'Content-Security-Policy': PLUGIN_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    }
    try {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers })
      const url = new URL(request.url)
      const pluginId = url.hostname
      if (allowedPluginId && pluginId !== allowedPluginId) throw new PluginSecurityError('unauthorized', 'Cross-plugin resource access denied')
      const relative = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html'
      if (!isSafePluginPath(relative)) throw new PluginSecurityError('unsafe_path', 'Unsafe plugin resource path')
      const file = service.resolvePluginFile(pluginId, relative, runtimeBootstrap)
      const stat = await fs.stat(file)
      if (!stat.isFile() || stat.size > MAX_PLUGIN_FILE_BYTES) return new Response('Not found', { status: 404, headers })
      const data = await service.readPluginFile(pluginId, relative, runtimeBootstrap)
      if (data.length > MAX_PLUGIN_FILE_BYTES) return new Response('Not found', { status: 404, headers })
      return new Response(data as unknown as BodyInit, {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        },
      })
    } catch (error: any) {
      return new Response(error?.code === 'disabled' ? 'Plugin disabled' : 'Not found', { status: 404, headers })
    }
  })
}
