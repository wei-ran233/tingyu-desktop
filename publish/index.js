const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const updateVersionFile = require('./utils/updateChangeLog')
const { parseArgv } = require('./utils')

const run = async() => {
  let bak
  try {
    const params = parseArgv(process.argv.slice(2))
    if (!params.ver) throw new Error('Missing version: use ver=<version>')
    bak = await updateVersionFile(params.ver)
    console.log(chalk.green('版本与更新元数据已准备完成；此命令不会构建或发布。'))
    console.log(chalk.blue('构建通过 main CI 后，请通过 GitHub Releases 发布审核后的产物。'))
  } catch (error) {
    console.log(error)
    process.exitCode = 1
    if (bak) {
      console.log(chalk.blue('正在还原版本信息'))
      fs.writeFileSync(path.join(__dirname, './version.json'), bak.version_bak + '\n', 'utf-8')
      fs.writeFileSync(path.join(__dirname, '../package.json'), bak.pkg_bak + '\n', 'utf-8')
      console.log(chalk.blue('版本信息还原完成'))
    }
  }
}


run()
