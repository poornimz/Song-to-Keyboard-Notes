import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const magentaCjsInteropPlugin = {
  name: 'magenta-cjs-interop',
  transform(code: string, id: string) {
    if (
      id.includes('@magenta/music/esm/core/audio_utils.js') ||
      id.includes('@magenta\\music\\esm\\core\\audio_utils.js')
    ) {
      return code
        .replace("import * as FFT from 'fft.js';", "import FFT from 'fft.js';")
        .replace("import * as ndarray from 'ndarray';", "import ndarray from 'ndarray';")
        .replace("import * as resample from 'ndarray-resample';", "import resample from 'ndarray-resample';");
    }
    return null;
  },
};

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      magentaCjsInteropPlugin,
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: '@',
          replacement: path.resolve(__dirname, '.'),
        },
        {
          find: '../core/compat/global',
          replacement: path.resolve(
            __dirname,
            'node_modules/@magenta/music/esm/core/compat/global_browser.js'
          ),
        },
        {
          find: /.*\/core\/compat\/global(\.js)?$/,
          replacement: path.resolve(
            __dirname,
            'node_modules/@magenta/music/esm/core/compat/global_browser.js'
          ),
        },
      ],
    },
    optimizeDeps: {
      rolldownOptions: {
        plugins: [
          {
            name: 'magenta-browser-compat',
            resolveId(source: string) {
              if (
                source === '../core/compat/global' ||
                source.endsWith('/core/compat/global') ||
                source.endsWith('/core/compat/global.js')
              ) {
                return path.resolve(
                  __dirname,
                  'node_modules/@magenta/music/esm/core/compat/global_browser.js'
                );
              }
              return null;
            },
          },
          magentaCjsInteropPlugin,
        ],
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
