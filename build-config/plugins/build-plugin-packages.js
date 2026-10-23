/**
 * Builds the bundled, Ed25519-signed `.lxplugin` packages.
 *
 * The private key in `plugin-samples/keys` belongs to the sample plugins that
 * ship with this repository. Replace it with a release key before publishing
 * non-sample plugins; trusted fingerprints live in
 * `src/main/modules/plugin/trustedKeys.ts`.
 */
const { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } = require('node:crypto')
const { promises: fs, readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const JSZip = require('jszip')

const ROOT = path.join(__dirname, '../..')
const SAMPLES = path.join(ROOT, 'plugin-samples')
const SHARED = path.join(SAMPLES, 'shared')
const KEYS = path.join(SAMPLES, 'keys')
const PRIVATE_KEY = process.env.LX_PLUGIN_SIGNING_KEY || path.join(KEYS, 'sample-private.pem')
const RELEASE = process.argv.includes('--release')
const PUBLIC_KEY = path.join(KEYS, 'sample-public.pem')
const OUTPUT = path.join(ROOT, 'src/static/plugins')

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value != null && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue
      result[key] = canonicalize(value[key])
    }
    return result
  }
  return value
}

const sha256 = data => createHash('sha256').update(data).digest('hex')

const ensureKeys = () => {
  if (RELEASE && !process.env.LX_PLUGIN_SIGNING_KEY) throw new Error('Release plugins require LX_PLUGIN_SIGNING_KEY pointing to an external Ed25519 private key')
  if (process.env.LX_PLUGIN_SIGNING_KEY && !existsSync(PRIVATE_KEY)) throw new Error('LX_PLUGIN_SIGNING_KEY does not exist')
  if (existsSync(PRIVATE_KEY)) {
    return {
      privateKey: createPrivateKey(readFileSync(PRIVATE_KEY)),
      publicDer: createPublicKey(createPrivateKey(readFileSync(PRIVATE_KEY))).export({ type: 'spki', format: 'der' }),
    }
  }
  mkdirSync(KEYS, { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  writeFileSync(PRIVATE_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  writeFileSync(PUBLIC_KEY, publicKey.export({ type: 'spki', format: 'pem' }))
  return {
    privateKey,
    publicDer: publicKey.export({ type: 'spki', format: 'der' }),
  }
}

const walk = async(dir, base = '') => {
  const entries = []
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const relative = base ? `${base}/${item.name}` : item.name
    const absolute = path.join(dir, item.name)
    if (item.isDirectory()) entries.push(...await walk(absolute, relative))
    else if (item.isFile()) entries.push({ relative, absolute })
  }
  return entries
}

const buildPackage = async(name, key) => {
  const dir = path.join(SAMPLES, name)
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
  manifest.publicKey = key.publicDer.toString('base64')
  delete manifest.signature
  const bundleName = manifest.id === 'lx.radio' ? 'radio' : 'official'
  if (manifest.nativeBundle) {
    const descriptor = await fs.readFile(path.join(ROOT, `src/common/bundles/${bundleName}.json`))
    const inventory = await fs.readFile(path.join(ROOT, `src/common/bundles/${bundleName === 'official' ? 'feature' : 'radio'}-inventory.json`))
    const sources = [...await walk(path.join(ROOT, `src/renderer/bundles/${bundleName}`)), ...await walk(path.join(ROOT, `src/main/bundles/${bundleName}`))]
    const buildHash = sha256(Buffer.concat([descriptor, inventory, ...await Promise.all(sources.sort((a, b) => a.absolute.localeCompare(b.absolute)).map(async file => Buffer.concat([Buffer.from(file.relative), await fs.readFile(file.absolute)])))]))
    manifest.nativeBundle.buildHash = buildHash
    await fs.writeFile(path.join(ROOT, `src/common/bundles/${bundleName}-build.json`), JSON.stringify({ buildHash }, null, 2) + '\n')
  }

  const files = new Map()
  for (const item of await walk(dir)) {
    if (item.relative === 'manifest.json') continue
    files.set(item.relative, await fs.readFile(item.absolute))
  }
  for (const item of manifest.nativeBundle ? [] : await walk(SHARED)) {
    if (files.has(item.relative)) throw new Error(`Shared file collides with plugin file: ${item.relative}`)
    files.set(item.relative, await fs.readFile(item.absolute))
  }
  if (manifest.nativeBundle) files.set('bundle.json', await fs.readFile(path.join(ROOT, `src/common/bundles/${bundleName}.json`)))
  const digests = [...files.entries()]
    .map(([filePath, data]) => ({ path: filePath, sha256: sha256(data) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const payload = Buffer.from(JSON.stringify(canonicalize({
    format: 'lxplugin-signature/1',
    manifest: canonicalize(manifest),
    files: digests,
  })), 'utf8')
  manifest.signature = sign(null, payload, key.privateKey).toString('base64')

  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  for (const [filePath, data] of files) zip.file(filePath, data)
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' })
  await fs.mkdir(OUTPUT, { recursive: true })
  const target = path.join(OUTPUT, `${manifest.id}.lxplugin`)
  await fs.writeFile(target, archive)
  return { id: manifest.id, target, size: archive.length, fingerprint: sha256(key.publicDer), signature: manifest.signature }
}

const main = async() => {
  const key = ensureKeys()
  const fingerprint = sha256(key.publicDer)
  const developmentFingerprint = '9424c4f6c35a7e12ab4159363391160ff6540c80a1bad867a9eec18dda35f8ff'
  if (RELEASE && fingerprint === developmentFingerprint) throw new Error('The public sample key cannot sign a release')
  await fs.writeFile(path.join(ROOT, 'src/common/plugin/bundledKeys.json'), JSON.stringify([fingerprint], null, 2) + '\n')
  const names = (await fs.readdir(SAMPLES, { withFileTypes: true }))
    .filter(item => item.isDirectory() && !['shared', 'keys'].includes(item.name))
    .map(item => item.name)
  for (const name of names) {
    const result = await buildPackage(name, key)
    console.log(`built ${result.id} -> ${path.relative(ROOT, result.target)} (${result.size} bytes)`)
    console.log(`  fingerprint ${result.fingerprint}`)
  }
  console.log(`trusted fingerprint: ${sha256(key.publicDer)}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
