import bundledKeys from '@common/plugin/bundledKeys.json'

const SAMPLE_FINGERPRINT = '9424c4f6c35a7e12ab4159363391160ff6540c80a1bad867a9eec18dda35f8ff'
export const BUNDLED_PLUGIN_KEY_FINGERPRINTS: readonly string[] = bundledKeys

/** Public sample signing keys are never a production trust root. */
export const getTrustedPluginFingerprints = (allowDevelopmentKeys = false): string[] => {
  const configured = allowDevelopmentKeys ? (process.env.LX_PLUGIN_TRUSTED_KEYS ?? '').split(',').map(value => value.trim()).filter(Boolean) : []
  return [...new Set([...BUNDLED_PLUGIN_KEY_FINGERPRINTS, ...configured])].filter(value => allowDevelopmentKeys || value !== SAMPLE_FINGERPRINT)
}
