import assert from 'node:assert/strict'
import {
  PLUGIN_PERMISSIONS,
} from '@common/plugin/types'
import {
  canonicalManifestPayload,
  isPluginApiCompatible,
  validatePluginManifest,
} from '@common/plugin/security'
import { validateThemeAppearance } from '@common/theme/appearance'
import {
  validateThemePngHeader,
  validateThemeResources,
} from '@common/theme/resources'

type Test = (
  name: string,
  run: () => void | Promise<void>,
) => Promise<void>

const hasOwn = (value: object, key: PropertyKey): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
)

const clone = <T>(value: T): T => structuredClone(value)

const themeAppearance = (): Record<string, unknown> => ({
  identity: 'tide',
  layout: 'sidebar',
  background: 'tide',
  detail: 'cinema',
  content: 'full',
})

const extendedAppearance = (): Record<string, unknown> => ({
  identity: 'custom_theme-1',
  layout: 'sidebar',
  background: 'image',
  detail: 'sleeve',
  content: 'focus',
  metrics: {
    sidebarWidth: 72,
    radius: 12,
    spacing: 8,
  },
  motion: {
    durationMs: 2400,
    enabled: true,
  },
})

const theme = (): Record<string, unknown> => ({
  id: 'fixture.theme',
  name: 'Fixture theme',
  tokens: {
    '--lx-accent': '#ff8800',
    '--lx-text': '#112233',
  },
})

const manifest = (
  apiVersion = '1.8.0',
  permissions: string[] = ['theme.contribute'],
  contribution: Record<string, unknown> = theme(),
) => ({
  id: 'fixture.theme-owner',
  name: 'Fixture theme owner',
  version: '1.0.0',
  apiVersion,
  main: 'index.html',
  permissions,
  themes: [contribution],
})

const appearanceManifest = (
  appearance: unknown,
  apiVersion = '1.8.0',
  permissions: string[] = ['theme.contribute', 'theme.appearance'],
) => {
  const contribution = theme()
  contribution.appearance = appearance
  return manifest(apiVersion, permissions, contribution)
}

const resourcesManifest = (
  resources: unknown,
  apiVersion = '1.8.0',
  permissions: string[] = ['theme.contribute', 'theme.resources'],
) => {
  const contribution = theme()
  contribution.resources = resources
  return manifest(apiVersion, permissions, contribution)
}

const pngHeader = (width: number, height: number): Uint8Array => {
  const data = new Uint8Array(33)
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(data.buffer)
  view.setUint32(8, 13)
  data.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return data
}

const withoutField = (
  value: object,
  field: string,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).filter(([key]) => key !== field),
)

export const themeResourceTests = async(test: Test) => {
  await test('gates theme resources by API 1.8 and explicit permissions', () => {
    assert.equal(isPluginApiCompatible('1.8.0'), true)
    assert.ok(PLUGIN_PERMISSIONS.includes('theme.resources'))

    const valid = {
      background: 'assets/background.png',
      icons: {
        play: { path: 'M0 0L10.5-2e1Z', filled: true },
        stop: { path: 'M0 0H10V10H0Z', filled: false },
      },
    }
    const parsed = validatePluginManifest(resourcesManifest(valid))
    assert.deepEqual(parsed.themes?.[0].resources, valid)

    assert.throws(() => validatePluginManifest(resourcesManifest(valid, '1.7.0')))
    assert.throws(() => validatePluginManifest(resourcesManifest(
      valid,
      '1.8.0',
      ['theme.resources'],
    )))
    assert.throws(() => validatePluginManifest(resourcesManifest(
      valid,
      '1.8.0',
      ['theme.contribute'],
    )))
  })

  await test('accepts only safe relative PNG background paths', () => {
    const validPath = 'assets/nested/background.png'
    const resources = validateThemeResources({ background: validPath })
    assert.equal(resources.background, validPath)

    const invalidPaths: unknown[] = [
      '',
      '/background.png',
      'C:/background.png',
      '../background.png',
      'assets/../background.png',
      './background.png',
      'assets//background.png',
      'assets\\background.png',
      'assets/background.png?version=1',
      'assets/background.png#preview',
      'https://example.invalid/background.png',
      'data:image/png;base64,fixture.png',
      'assets/background.PNG',
      'assets/background.svg',
      'assets/background',
      { path: 'assets/background.png' },
    ]
    for (const background of invalidPaths) {
      assert.throws(
        () => validateThemeResources({ background }),
        /./,
        String(background),
      )
      assert.throws(
        () => validatePluginManifest(resourcesManifest({ background })),
        /./,
        String(background),
      )
    }
  })

  await test('bounds icon names, SVG path data and icon fields against injection', () => {
    const maximumName = `a${'b'.repeat(40)}`
    const maximumPath = `M${'0'.repeat(2047)}`
    const accepted = {
      icons: {
        [maximumName]: { path: maximumPath },
        PlayIcon: { path: 'M0 0L10.5-2e1Z', filled: false },
      },
    }
    const normalized = validateThemeResources(accepted)
    assert.deepEqual(normalized.icons?.[maximumName], { path: maximumPath })
    assert.deepEqual(normalized.icons?.PlayIcon, {
      path: 'M0 0L10.5-2e1Z',
      filled: false,
    })

    const maximumIcons = Object.fromEntries(Array.from(
      { length: 32 },
      (_, index) => [
        `icon-${index}`,
        { path: 'M0 0H10V10H0Z', filled: index % 2 === 0 },
      ],
    ))
    assert.equal(Object.keys(validateThemeResources({ icons: maximumIcons }).icons ?? {}).length, 32)

    const singleIcon = (name: string, value: unknown) => (
      Object.fromEntries([[name, value]])
    )
    const invalidIcons: unknown[] = [
      Object.fromEntries(Array.from(
        { length: 33 },
        (_, index) => [`icon-${index}`, { path: 'M0 0H1' }],
      )),
      singleIcon('1icon', { path: 'M0 0H1' }),
      singleIcon('-icon', { path: 'M0 0H1' }),
      singleIcon('icon_name', { path: 'M0 0H1' }),
      singleIcon('i'.repeat(42), { path: 'M0 0H1' }),
      singleIcon('constructor', { path: 'M0 0H1' }),
      singleIcon('prototype', { path: 'M0 0H1' }),
      singleIcon('__proto__', { path: 'M0 0H1' }),
      singleIcon('html', { path: '<path d="M0 0H1"/>' }),
      singleIcon('url', { path: 'url(#paint)' }),
      singleIcon('entity', { path: 'M0&#32;0H1' }),
      singleIcon('quote', { path: 'M0 0"H1' }),
      singleIcon('extra', { path: 'M0 0H1', href: 'https://example.invalid' }),
      singleIcon('filled', { path: 'M0 0H1', filled: 1 }),
      singleIcon('empty', { path: '' }),
      singleIcon('oversized', { path: `M${'0'.repeat(2048)}` }),
      singleIcon('array', []),
    ]
    for (const icons of invalidIcons) {
      assert.throws(() => validateThemeResources({ icons }))
    }

    for (const resources of [
      { background: 'assets/background.png', extra: true },
      { icons: {}, extra: true },
      null,
      [],
      'assets/background.png',
      { icons: null },
      { icons: [] },
    ]) {
      assert.throws(() => validateThemeResources(resources))
      assert.throws(() => validatePluginManifest(resourcesManifest(resources)))
    }
  })

  await test('keeps legacy appearance limits and permits extended fields only when requested', () => {
    const legacy = themeAppearance()
    assert.deepEqual(validateThemeAppearance(legacy), legacy)
    assert.deepEqual(validateThemeAppearance(legacy, false), legacy)

    const legacyManifest = validatePluginManifest(manifest('1.8.0'))
    assert.equal(legacyManifest.themes?.[0].tokens['--lx-accent'], '#ff8800')
    const parsedLegacy = validatePluginManifest(appearanceManifest(
      legacy,
      '1.7.0',
    ))
    assert.deepEqual(parsedLegacy.themes?.[0].appearance, legacy)

    for (const appearance of [
      { ...legacy, identity: 'custom' },
      { ...legacy, background: 'image' },
      { ...legacy, background: 'none' },
      { ...legacy, metrics: extendedAppearance().metrics },
      { ...legacy, motion: extendedAppearance().motion },
    ]) {
      assert.throws(() => validateThemeAppearance(appearance))
    }

    for (const background of ['tide', 'signal', 'petals', 'image', 'none']) {
      assert.equal(
        validateThemeAppearance({ ...extendedAppearance(), background }, true).background,
        background,
      )
    }
    for (const identity of [
      'custom',
      'custom_theme-1',
      'a'.repeat(64),
    ]) {
      assert.equal(
        validateThemeAppearance({ ...extendedAppearance(), identity }, true).identity,
        identity,
      )
    }
    for (const identity of ['Custom', 'custom/theme', '', 'a'.repeat(65)]) {
      assert.throws(() => validateThemeAppearance(
        { ...extendedAppearance(), identity },
        true,
      ))
    }
    assert.throws(() => validateThemeAppearance(
      { ...extendedAppearance(), css: 'body{display:none}' },
      true,
    ))
  })

  await test('requires complete finite metrics and motion records within their bounds', () => {
    const extended = extendedAppearance()
    assert.equal(validateThemeAppearance(extended, true).metrics?.sidebarWidth, 72)

    for (const field of ['sidebarWidth', 'radius', 'spacing']) {
      const missing = clone(extended)
      missing.metrics = withoutField(missing.metrics as object, field)
      assert.throws(() => validateThemeAppearance(missing, true), /./, field)
    }

    const metricCases: unknown[] = [
      { sidebarWidth: 55, radius: 0, spacing: 0 },
      { sidebarWidth: 241, radius: 0, spacing: 0 },
      { sidebarWidth: 56, radius: -1, spacing: 0 },
      { sidebarWidth: 56, radius: 33, spacing: 0 },
      { sidebarWidth: 56, radius: 0, spacing: -1 },
      { sidebarWidth: 56, radius: 0, spacing: 25 },
      { sidebarWidth: Number.NaN, radius: 0, spacing: 0 },
      { sidebarWidth: Number.POSITIVE_INFINITY, radius: 0, spacing: 0 },
      { sidebarWidth: 56, radius: 0, spacing: 0, extra: 1 },
      [],
      null,
    ]
    for (const metrics of metricCases) {
      assert.throws(() => validateThemeAppearance({ ...extended, metrics }, true))
    }
    for (const metrics of [
      { sidebarWidth: 56, radius: 0, spacing: 0 },
      { sidebarWidth: 240, radius: 32, spacing: 24 },
    ]) {
      assert.deepEqual(
        validateThemeAppearance({ ...extended, metrics }, true).metrics,
        metrics,
      )
    }

    for (const field of ['durationMs', 'enabled']) {
      const missing = clone(extended)
      missing.motion = withoutField(missing.motion as object, field)
      assert.throws(() => validateThemeAppearance(missing, true), /./, field)
    }

    const motionCases: unknown[] = [
      { durationMs: 999, enabled: true },
      { durationMs: 120_001, enabled: true },
      { durationMs: Number.NaN, enabled: true },
      { durationMs: Number.POSITIVE_INFINITY, enabled: true },
      { durationMs: 1000, enabled: 'yes' },
      { durationMs: 1000, enabled: true, extra: 1 },
      [],
      null,
    ]
    for (const motion of motionCases) {
      assert.throws(() => validateThemeAppearance({ ...extended, motion }, true))
    }
    for (const motion of [
      { durationMs: 1000, enabled: false },
      { durationMs: 120_000, enabled: true },
    ]) {
      assert.deepEqual(
        validateThemeAppearance({ ...extended, motion }, true).motion,
        motion,
      )
    }
  })

  await test('gates every API 1.8 appearance feature by permission and version', () => {
    const base = themeAppearance()
    const features: Array<[string, Record<string, unknown>]> = [
      ['identity', { ...base, identity: 'custom' }],
      ['image background', { ...base, background: 'image' }],
      ['none background', { ...base, background: 'none' }],
      ['metrics', { ...base, metrics: { sidebarWidth: 72, radius: 12, spacing: 8 } }],
      ['motion', { ...base, motion: { durationMs: 2400, enabled: true } }],
      ['all extended fields', extendedAppearance()],
    ]

    for (const [label, appearance] of features) {
      const parsed = validatePluginManifest(appearanceManifest(appearance))
      assert.deepEqual(parsed.themes?.[0].appearance, appearance, label)
      assert.equal(hasOwn(parsed.themes?.[0] ?? {}, 'resources'), false, label)
      assert.throws(() => validatePluginManifest(appearanceManifest(
        appearance,
        '1.8.0',
        ['theme.contribute'],
      )), /./, label)
      assert.throws(() => validatePluginManifest(appearanceManifest(
        appearance,
        '1.7.0',
      )), /./, label)
    }

    assert.throws(() => validatePluginManifest(appearanceManifest(
      { ...base, identity: 'Custom' },
    )))
  })

  await test('canonicalizes only present, bounded resources without changing legacy signatures', () => {
    const legacyTheme = theme()
    legacyTheme.appearance = themeAppearance()
    const legacy = validatePluginManifest(manifest(
      '1.7.0',
      ['theme.contribute', 'theme.appearance'],
      legacyTheme,
    ))
    assert.equal(hasOwn(legacy.themes?.[0] ?? {}, 'resources'), false)

    const legacyPayload = JSON.parse(canonicalManifestPayload(legacy)) as {
      themes: Array<Record<string, unknown>>
    }
    assert.equal(hasOwn(legacyPayload.themes[0], 'resources'), false)

    const resources = {
      background: 'assets/nested/background.png',
      icons: {
        play: { path: 'M0 0L10 10Z' },
        pause: { path: 'M0 0H4V10H0Z', filled: true },
      },
    }
    const contribution = theme()
    contribution.appearance = extendedAppearance()
    contribution.resources = resources
    const parsed = validatePluginManifest(manifest(
      '1.8.0',
      ['theme.contribute', 'theme.appearance', 'theme.resources'],
      contribution,
    ))
    assert.deepEqual(parsed.themes?.[0].resources, resources)

    const payload = JSON.parse(canonicalManifestPayload(parsed)) as {
      themes: Array<Record<string, unknown>>
    }
    assert.deepEqual(payload.themes[0].resources, resources)
    assert.deepEqual(
      Object.keys(payload.themes[0].resources as Record<string, unknown>).sort(),
      ['background', 'icons'],
    )
  })

  await test('validates the bounded PNG signature and first IHDR chunk without decoding', () => {
    // A 33-byte header is enough for container checks; nativeImage owns decoding.
    validateThemePngHeader(pngHeader(512, 512))
    validateThemePngHeader(pngHeader(4096, 2048))

    const badSignature = pngHeader(512, 512)
    badSignature[0] = 0
    assert.throws(() => { validateThemePngHeader(badSignature) })

    const truncated = pngHeader(512, 512).slice(0, 32)
    assert.throws(() => { validateThemePngHeader(truncated) })

    const badChunkLength = pngHeader(512, 512)
    new DataView(badChunkLength.buffer).setUint32(8, 12)
    assert.throws(() => { validateThemePngHeader(badChunkLength) })

    const badChunkType = pngHeader(512, 512)
    badChunkType[12] = 0x58
    assert.throws(() => { validateThemePngHeader(badChunkType) })

    for (const [width, height] of [
      [0, 1],
      [1, 0],
      [4097, 1],
      [1, 4097],
      [4096, 2049],
    ]) {
      assert.throws(
        () => { validateThemePngHeader(pngHeader(width, height)) },
        /./,
        `${width}x${height}`,
      )
    }

    const oversized = new Uint8Array(2 * 1024 * 1024 + 1)
    oversized.set(pngHeader(512, 512))
    assert.throws(() => { validateThemePngHeader(oversized) })
  })
}
