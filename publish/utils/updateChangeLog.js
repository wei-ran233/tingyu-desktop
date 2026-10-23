const fs = require('fs')
const { jp, formatTime } = require('./index')
const pkgDir = '../../package.json'
const packageLockPath = '../../package-lock.json'
const pkg = require(pkgDir)
const packageLock = require(packageLockPath)
const version = require('../version.json')
const chalk = require('chalk')
const pkg_bak = JSON.stringify(pkg, null, 2)
const packageLock_bak = JSON.stringify(packageLock, null, 2)
const version_bak = JSON.stringify(version, null, 2)
const changelogPath = jp('../../CHANGELOG.md')
const changeLog_bak = fs.readFileSync(changelogPath, 'utf-8')
const { parseChangelog } = require('./parseChangelog')

// const md_renderer = markdownStr => new (require('markdown-it'))({
//   html: true,
//   linkify: true,
//   typographer: true,
//   breaks: true,
// }).render(markdownStr)

const getPrevVer = () => parseChangelog(fs.readFileSync(changelogPath, 'utf-8').toString()).then(versions => {
  if (!versions.length) throw new Error('CHANGELOG 无法解析到版本号')
  return versions[0].version
})

const updateChangeLog = async(newVerNum, newChangeLog) => {
  let changeLog = fs.readFileSync(changelogPath, 'utf-8')
  const prevVer = await getPrevVer()
  const log = `## [${newVerNum}](${pkg.repository.url.replace(/^git\+(http.+)\.git$/, '$1')}/compare/v${prevVer}...v${newVerNum}) - ${formatTime()}\n\n${newChangeLog}`
  fs.writeFileSync(changelogPath, changeLog.replace(/(## \[(?:\d+\.))/, log + '\n$1'), 'utf-8')
}

// const renderChangeLog = md => md_renderer(md)


module.exports = async newVerNum => {
  if (!newVerNum) newVerNum = pkg.version
  const newMDChangeLog = fs.readFileSync(jp('../changeLog.md'), 'utf-8')
  // const newChangeLog = renderChangeLog(newMDChangeLog)
  const nextVersion = {
    ...version,
    history: [
      {
        version: version.version,
        desc: version.desc,
      },
      ...(version.history ?? []),
    ],
  }
  nextVersion.version = newVerNum
  nextVersion.desc = newMDChangeLog.replace(/(?:^|(\n))#{1,6} (.+)\n/g, '$1$2').trim()
  const nextPackage = { ...pkg, version: newVerNum }
  const nextPackageLock = {
    ...packageLock,
    version: newVerNum,
    packages: {
      ...packageLock.packages,
      '': { ...packageLock.packages[''], version: newVerNum },
    },
  }

  console.log(chalk.blue('new version: ') + chalk.green(newVerNum))

  try {
    fs.writeFileSync(jp('../version.json'), JSON.stringify(nextVersion) + '\n', 'utf-8')
    fs.writeFileSync(jp(pkgDir), JSON.stringify(nextPackage, null, 2) + '\n', 'utf-8')
    fs.writeFileSync(jp(packageLockPath), JSON.stringify(nextPackageLock, null, 2) + '\n', 'utf-8')
    await updateChangeLog(newVerNum, newMDChangeLog)
  } catch (error) {
    fs.writeFileSync(jp('../version.json'), version_bak + '\n', 'utf-8')
    fs.writeFileSync(jp(pkgDir), pkg_bak + '\n', 'utf-8')
    fs.writeFileSync(jp(packageLockPath), packageLock_bak + '\n', 'utf-8')
    fs.writeFileSync(changelogPath, changeLog_bak, 'utf-8')
    throw error
  }

  return {
    pkg_bak,
    packageLock_bak,
    version_bak,
    // changeLog: newChangeLog,
  }
}

