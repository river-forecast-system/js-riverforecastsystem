// `rollup.config.js`
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

// The bucket URLs are this package's own environment, not the consuming app's. They are hardcoded
// in src/v3/config.js, so the published package already knows where GEOGLOWS data lives. A
// consumer overrides at runtime with configure() — see src/v3/config.js.

export default {
  // zarrita is a declared dependency, not something to inline. Bundling it here would ship a second
  // copy to any consumer that also reads zarr itself — which this app now does, for the flood
  // library — costing ~1.3 MB of duplicated codecs. External means one copy, deduped by the app's
  // bundler.
  // zarrita is a declared dependency, not something to inline. Bundling it here would ship a second
  // copy to any consumer that also reads zarr itself, costing ~1.3 MB of duplicated codecs.
  // External means one copy, deduped by the app's bundler.
  //
  // The chart libraries are peers for a stronger reason: Chart.register() mutates module-global
  // state, so two copies of chart.js do not merely waste bytes, they silently break registration.
  // The consumer owns the version and there is exactly one instance.
  external: [/^zarrita/, /^chart\.js/, /^chartjs-/, /^date-fns/],
  // urls is its own entry so consumers that only need to know where a file lives (to hand the url
  // to MapLibre, say) do not pull zarrita in to find out. config is its own for the same reason
  // from the other direction: an app configures endpoints at startup, before anything reads, and
  // should not have to import the readers to do it. rfs.v3.configure is the same function.
  input: {
    index: 'src/index.js',
    config: 'src/v3/config.js',
    plots: 'src/v3/plots/index.js',
    urls: 'src/v3/urls.js'
  },
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
    // Blanket moduleSideEffects:false would drop `import "chartjs-adapter-date-fns"` in
    // plots/shared.js — a side-effect-only import that installs the date adapter Chart.js needs for
    // any time scale. Without it every time-axis chart dies with "This method is not implemented:
    // Check that a complete date adapter is provided". Keep side effects for the chart plugins,
    // which all register themselves by import alone.
    moduleSideEffects: (id) => /^chartjs-/.test(id)
  }
};
