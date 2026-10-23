const path = require('node:path')

module.exports = {
  mode: 'production',
  target: 'node',
  entry: {
    'collection-tests': path.join(__dirname, 'collection-tests.ts'),
  },
  output: {
    path: path.join(__dirname, '../../dist/tests'),
    filename: '[name].js',
  },
  resolve: {
    alias: {
      '@main': path.join(__dirname, '../../src/main'),
      '@renderer': path.join(__dirname, '../../src/renderer'),
      '@common': path.join(__dirname, '../../src/common'),
    },
    extensions: ['.ts', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    jszip: 'commonjs jszip',
  },
  optimization: { minimize: false },
}
