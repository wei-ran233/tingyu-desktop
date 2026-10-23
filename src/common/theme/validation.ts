const TOKEN_NAME_RE = /^--lx-[a-z0-9-]{1,48}$/
const UNSAFE_VALUE_RE = /(?:url\s*\(|expression\s*\(|javascript:|@import|[;{}\\])/i

export interface ThemeTokenValidationResult {
  tokens: Record<string, string>
  invalid: string[]
}

/**
 * Theme tokens are values only. The host never accepts selectors, declarations
 * or URLs from a plugin, so a contributed theme cannot restyle host DOM.
 */
export const validateThemeTokens = (
  input: unknown,
  fallback: Record<string, string> = {},
): ThemeTokenValidationResult => {
  const tokens: Record<string, string> = { ...fallback }
  const invalid: string[] = []
  if (input == null || typeof input !== 'object') return { tokens, invalid }
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim()
    if (!TOKEN_NAME_RE.test(key) || typeof rawValue !== 'string') {
      invalid.push(rawKey)
      continue
    }
    const value = rawValue.trim()
    if (!value || value.length > 200 || UNSAFE_VALUE_RE.test(value) || /[<>]/.test(value)) {
      invalid.push(rawKey)
      continue
    }
    tokens[key] = value
  }
  return { tokens, invalid }
}

export const mergeThemeTokens = (
  base: Record<string, string>,
  contribution: unknown,
): Record<string, string> => validateThemeTokens(contribution, base).tokens
