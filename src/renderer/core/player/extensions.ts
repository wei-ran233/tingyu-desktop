/** Host-owned extension points. Optional features subscribe for their own lifetime. */
export interface PlaybackExtension {
  ended?: () => boolean
  observe?: (event: 'tick' | 'reset' | 'interrupt') => void
}
const extensions = new Map<string, PlaybackExtension>()
export const registerPlaybackExtension = (id: string, extension: PlaybackExtension) => {
  if (extensions.has(id)) throw new Error(`Duplicate playback extension: ${id}`)
  extensions.set(id, extension)
  return () => { if (extensions.get(id) === extension) extensions.delete(id) }
}
export const notifyPlaybackEnded = (): boolean => {
  for (const extension of extensions.values()) {
    try { if (extension.ended?.()) return true } catch (error) { console.error('[playback] extension failed', error) }
  }
  return false
}
export const notifyPlaybackObservation = (event: 'tick' | 'reset' | 'interrupt') => {
  for (const extension of extensions.values()) {
    try { extension.observe?.(event) } catch (error) { console.error('[playback] observer failed', error) }
  }
}
