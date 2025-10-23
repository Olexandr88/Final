/**
 * Webpack Configuration for LLM Framework IDE
 * Bundles React application for Electron renderer process
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'electron-renderer',

  entry: './src/index.jsx',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
    clean: {
      keep: /index\.html|monaco-editor/
    }
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },

  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'components'),
      '@utils': path.resolve(__dirname, 'utils')
    }
  },

  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',

  optimization: {
    minimize: process.env.NODE_ENV === 'production'
  },

  externals: {
    electron: 'commonjs electron'
  }
};
