import { safeStorage } from 'electron'
import { PluginCredentialVault } from './credentialVault'

export const createSystemCredentialVault = (root: string): PluginCredentialVault => new PluginCredentialVault(root, {
  isAvailable: () => safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: value => safeStorage.encryptString(value),
  decrypt: value => safeStorage.decryptString(value),
})
