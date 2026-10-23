const path = require('node:path')
const del = require('del')
// const copyFile = require('./copyFile')

module.exports = () => {
  del.sync([path.resolve(__dirname, '../assets/*')])
  // return copyFile(false)
}

