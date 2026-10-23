const fs = require('fs')
const chalk = require('chalk')
const { jp, copyFile } = require('./index')

const buildDir = '../../build'
const assetsDir = '../assets'


const getBuildFileName = () => {
  const names = []
  const pathRegExp = [
    /^latest(?:-mac|-linux)?\.ya?ml$/i,
    /\.(?:exe|dmg|AppImage|deb|rpm|zst|7z|zip)$/i,
    /\.blockmap$/,
  ]
  const files = fs.readdirSync(jp(buildDir), 'utf8')
  files.forEach(name => {
    pathRegExp.forEach(regexp => {
      if (regexp.test(name)) names.push(name)
    })
  })
  return names
}

const copy = names => {
  const tasks = names.map(name => copyFile(jp(buildDir, name), jp(assetsDir, name)))
  return Promise.all(tasks)
}


module.exports = (isCopyVersion = true) => {
  fs.mkdirSync(jp(assetsDir), { recursive: true })
  copy(getBuildFileName()).then(() => {
    if (isCopyVersion) fs.writeFileSync(jp(assetsDir, 'version.json'), JSON.stringify(require('../version.json')), 'utf8')
  }).catch(err => {
    console.log(err)
    console.log(chalk.red('File copy failed.'))
    return Promise.reject(err)
  })
}
