// `rollup.config.js`
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    dir: './dist',
    format: 'es',
    entryFileNames: '[name].esm.js',
    chunkFileNames: 'chunks/[hash].esm.js',
    sourcemap: false
  },
  plugins: [
    nodeResolve({browser: true, preferBuiltins: false}),
    commonjs(),
    terser()
  ],
  treeshake: {
    moduleSideEffects: false
  }
};
