import { nativeImage } from 'electron'
import { validateThemePngHeader } from '@common/theme/resources'

/** Decode and re-encode: raw plugin bytes never enter host HTML/CSS. */
export const normalizeThemePng = (data: Buffer): string => {
  validateThemePngHeader(data)
  let offset = 8
  let ended = false
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.toString('ascii', offset + 4, offset + 8)
    if (length > data.length - offset - 12 || type === 'acTL') throw new Error('Invalid or animated theme PNG')
    offset += length + 12
    if (type === 'IEND') { ended = length === 0 && offset === data.length; break }
  }
  if (!ended) throw new Error('Incomplete theme PNG')
  const image = nativeImage.createFromBuffer(data)
  if (image.isEmpty()) throw new Error('Theme PNG cannot be decoded')
  const { width, height } = image.getSize()
  if (!width || !height || width > 4096 || height > 4096 || width * height > 8388608) throw new Error('Theme PNG is too large')
  const normalized = image.toPNG()
  if (normalized.length > 2 * 1024 * 1024) throw new Error('Theme PNG output is too large')
  return `data:image/png;base64,${normalized.toString('base64')}`
}
