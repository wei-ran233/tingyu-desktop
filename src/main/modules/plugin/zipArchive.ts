import { inflateRawSync } from 'node:zlib'
import {
  MAX_COMPRESSION_RATIO,
  MAX_PLUGIN_ARCHIVE_BYTES,
  MAX_PLUGIN_FILES,
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_TOTAL_BYTES,
  PluginSecurityError,
  assertSafePluginPath,
} from '@common/plugin/security'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export const crc32 = (buffer: Buffer): number => {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

interface CentralEntry {
  name: string
  flags: number
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  externalAttributes: number
  localOffset: number
}

const findEndOfCentralDirectory = (buffer: Buffer): number => {
  const min = Math.max(0, buffer.length - 22 - 0xFFFF)
  for (let offset = buffer.length - 22; offset >= min; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new PluginSecurityError('invalid_archive', 'ZIP end-of-directory record is missing')
}

const readCentralEntries = (buffer: Buffer): CentralEntry[] => {
  if (buffer.length > MAX_PLUGIN_ARCHIVE_BYTES) {
    throw new PluginSecurityError('archive_too_large', 'Plugin archive exceeds the size limit')
  }
  const eocd = findEndOfCentralDirectory(buffer)
  const totalEntries = buffer.readUInt16LE(eocd + 10)
  const directorySize = buffer.readUInt32LE(eocd + 12)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  if (totalEntries === 0xFFFF || directorySize === 0xFFFFFFFF || directoryOffset === 0xFFFFFFFF) {
    throw new PluginSecurityError('unsupported_archive', 'ZIP64 plugin archives are not supported')
  }
  if (totalEntries > MAX_PLUGIN_FILES) {
    throw new PluginSecurityError('too_many_files', 'Plugin archive contains too many files')
  }
  if (directorySize > MAX_CENTRAL_DIRECTORY_BYTES || directoryOffset + directorySize > buffer.length) {
    throw new PluginSecurityError('invalid_archive', 'Invalid ZIP central directory')
  }

  const entries: CentralEntry[] = []
  let cursor = directoryOffset
  for (let index = 0; index < totalEntries; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new PluginSecurityError('invalid_archive', 'Invalid ZIP central directory entry')
    }
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const crc = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const externalAttributes = buffer.readUInt32LE(cursor + 38)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > buffer.length) throw new PluginSecurityError('invalid_archive', 'Truncated ZIP entry name')
    const name = buffer.subarray(nameStart, nameEnd).toString(flags & 0x800 ? 'utf8' : 'latin1')
    entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, externalAttributes, localOffset })
    cursor = nameEnd + extraLength + commentLength
  }
  return entries
}

const assertNoSymlink = (entry: CentralEntry) => {
  // Unix mode is stored in the high 16 bits of external attributes.
  const unixMode = (entry.externalAttributes >>> 16) & 0xFFFF
  if ((unixMode & 0xF000) === 0xA000) {
    throw new PluginSecurityError('symlink_entry', 'Plugin archives may not contain symbolic links')
  }
}

export interface ZipEntry {
  name: string
  data: Buffer
}

/**
 * Minimal, bounded ZIP reader. It deliberately supports only stored and
 * deflated files, rejects symlinks and encryption, and applies one hard budget
 * across the whole archive.
 */
export const readZipEntries = (buffer: Buffer): Map<string, Buffer> => {
  const entries = readCentralEntries(buffer)
  const files = new Map<string, Buffer>()
  let totalBytes = 0

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    assertSafePluginPath(entry.name, 'entry')
    assertNoSymlink(entry)
    if (entry.flags & 0x1) throw new PluginSecurityError('encrypted_entry', 'Encrypted plugin entries are not supported')
    if (entry.method !== 0 && entry.method !== 8) {
      throw new PluginSecurityError('unsupported_compression', 'Unsupported ZIP compression method')
    }
    if (entry.uncompressedSize > MAX_PLUGIN_FILE_BYTES) {
      throw new PluginSecurityError('file_too_large', `Plugin file exceeds the size limit: ${entry.name}`)
    }
    if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO) {
      throw new PluginSecurityError('compression_ratio', `Suspicious compression ratio: ${entry.name}`)
    }
    totalBytes += entry.uncompressedSize
    if (totalBytes > MAX_PLUGIN_TOTAL_BYTES) {
      throw new PluginSecurityError('archive_too_large', 'Uncompressed plugin content exceeds the size limit')
    }
    if (files.has(entry.name)) throw new PluginSecurityError('duplicate_entry', `Duplicate ZIP entry: ${entry.name}`)

    const local = entry.localOffset
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
      throw new PluginSecurityError('invalid_archive', `Invalid local header: ${entry.name}`)
    }
    const nameLength = buffer.readUInt16LE(local + 26)
    const extraLength = buffer.readUInt16LE(local + 28)
    const dataStart = local + 30 + nameLength + extraLength
    const dataEnd = dataStart + entry.compressedSize
    if (dataEnd > buffer.length) throw new PluginSecurityError('invalid_archive', `Truncated ZIP entry: ${entry.name}`)
    const compressed = buffer.subarray(dataStart, dataEnd)
    const data = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_PLUGIN_FILE_BYTES })
    if (data.length !== entry.uncompressedSize) {
      throw new PluginSecurityError('invalid_archive', `ZIP entry size mismatch: ${entry.name}`)
    }
    if (crc32(data) !== entry.crc) {
      throw new PluginSecurityError('invalid_archive', `ZIP entry checksum mismatch: ${entry.name}`)
    }
    files.set(entry.name, data)
  }

  return files
}
