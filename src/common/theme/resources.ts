export interface ThemeGlyphResource { path: string, filled?: boolean }
export interface ThemeResources { background?: string, icons?: Record<string, ThemeGlyphResource> }
export interface LoadedThemeResources { background?: string, icons: Record<string, ThemeGlyphResource> }
const plain = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const invalid = (): never => { throw new Error('Invalid theme resources') }
export const validateThemeResources = (value: unknown): ThemeResources => {
  if (!plain(value) || Reflect.ownKeys(value).some(key => !['background', 'icons'].includes(String(key)))) return invalid()
  const result: ThemeResources = {}
  if (Object.prototype.hasOwnProperty.call(value, 'background')) {
    if (typeof value.background !== 'string' || value.background.length > 200 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.png$/.test(value.background) || value.background.split('/').some(part => part === '.' || part === '..')) return invalid()
    result.background = value.background
  }
  if (Object.prototype.hasOwnProperty.call(value, 'icons')) {
    if (!plain(value.icons) || Reflect.ownKeys(value.icons).length > 32) return invalid()
    result.icons = {}
    for (const key of Reflect.ownKeys(value.icons)) {
      if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]{0,40}$/.test(key) || ['constructor', 'prototype'].includes(key)) return invalid()
      const icon = value.icons[key]
      if (!plain(icon) || Reflect.ownKeys(icon).some(key => !['path', 'filled'].includes(String(key))) || typeof icon.path !== 'string' || !icon.path.trim() || icon.path.length > 2048 || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.+-]+$/.test(icon.path) || !/^[Mm]/.test(icon.path.trim()) || (Object.prototype.hasOwnProperty.call(icon, 'filled') && typeof icon.filled !== 'boolean')) return invalid()
      result.icons[key] = { path: icon.path, ...(typeof icon.filled === 'boolean' ? { filled: icon.filled } : {}) }
    }
  }
  return result
}
/** Bound compressed bytes and declared pixels before invoking the native decoder. */
export const validateThemePngHeader = (data: Uint8Array): void => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (data.length < 33 || data.length > 2 * 1024 * 1024 || signature.some((byte, i) => data[i] !== byte)) throw new Error('Invalid or oversized theme PNG')
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = header.getUint32(16); const height = header.getUint32(20)
  if (header.getUint32(8) !== 13 || String.fromCharCode(...data.slice(12, 16)) !== 'IHDR' || !width || !height || width > 4096 || height > 4096 || width * height > 8388608) throw new Error('Invalid theme PNG dimensions')
}
