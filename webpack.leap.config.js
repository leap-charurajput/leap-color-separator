const path = require('path');
const fs = require('fs');
const nodeExternals = require('webpack-node-externals');

const LEAP_SRC_FILE = path.join(__dirname, 'src', 'leap-src-index.js');

if (!fs.existsSync(LEAP_SRC_FILE)) {
 process.exit(1);
}

module.exports = (env) => ({
 entry: LEAP_SRC_FILE,
 target: 'node',
 externals: [
  nodeExternals({
   allowlist: ['xlsx']
  })
 ],
 module: {
  rules: [
   {
    test: /\.(js|jsx)$/,
    exclude: /node_modules/,
    loader: 'babel-loader',
    options: {
     presets: ['@babel/preset-env']
    }
   }
  ]
 },
 resolve: {
  extensions: ['.js', '.jsx'],
  modules: ['node_modules']
 },
 output: {
  path: path.join(__dirname, 'src'),
  publicPath: '',
  filename: 'leap-dist.js',
  clean: false
 },
 devtool: 'source-map',
 mode: env && env.mode ? env.mode : 'development'
});
