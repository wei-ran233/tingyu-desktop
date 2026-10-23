import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { canonicalizePluginValue, canonicalManifestPayload, PluginSecurityError } from '@common/plugin/security'
import type { PluginManifest } from '@common/plugin/types'

export interface VerifiedSignature {
  fingerprint: string
  publicKeyDer: Buffer
}

export interface PluginFileDigest {
  path: string
  sha256: string
}

const MANIFEST_FILE = 'manifest.json'

export const decodePublicKey = (value: string): Buffer => {
  const der = Buffer.from(value, 'base64')
  if (der.length < 32 || der.length > 4096) throw new PluginSecurityError('invalid_signature', 'Invalid plugin public key')
  return der
}

export const fingerprintPublicKey = (der: Buffer): string => {
  return createHash('sha256').update(der).digest('hex')
}

export const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

export const digestPluginFiles = (files: Map<string, Buffer>): PluginFileDigest[] => {
  return [...files.entries()]
    .filter(([name]) => name !== MANIFEST_FILE)
    .map(([path, data]) => ({ path, sha256: sha256(data) }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export const digestMapToFiles = (digests: Record<string, string>): PluginFileDigest[] => {
  return Object.entries(digests)
    .map(([path, sha256]) => ({ path, sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * The signature covers the canonical manifest plus every packaged resource.
 * The manifest is excluded from the digests because it carries the signature
 * itself; all other resources are bound to it by sha256.
 */
export const pluginSignaturePayload = (manifest: PluginManifest, digests: PluginFileDigest[]): Buffer => {
  return Buffer.from(JSON.stringify(canonicalizePluginValue({
    format: 'lxplugin-signature/1',
    manifest: JSON.parse(canonicalManifestPayload(manifest)) as unknown,
    files: digests,
  })), 'utf8')
}

export const verifyPluginSignature = (
  manifest: PluginManifest,
  digests: PluginFileDigest[],
): VerifiedSignature => {
  if (!manifest.signature) throw new PluginSecurityError('invalid_signature', 'Plugin manifest is not signed')
  const der = decodePublicKey(manifest.publicKey)
  let key: ReturnType<typeof createPublicKey>
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' })
  } catch {
    throw new PluginSecurityError('invalid_signature', 'Invalid plugin public key')
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new PluginSecurityError('invalid_signature', 'Only Ed25519 public keys are accepted')
  const signature = Buffer.from(manifest.signature, 'base64')
  if (signature.length !== 64) throw new PluginSecurityError('invalid_signature', 'Invalid Ed25519 signature length')
  if (!verifySignature(null, pluginSignaturePayload(manifest, digests), key, signature)) {
    throw new PluginSecurityError('invalid_signature', 'Plugin signature verification failed')
  }
  return {
    publicKeyDer: der,
    fingerprint: fingerprintPublicKey(der),
  }
}

export const verifyManifestSignature = verifyPluginSignature
