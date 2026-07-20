// `rollup.config.js`
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

// The bucket URLs are this package's own environment, not the consuming app's. They are hardcoded
// in src/v3/config.js, so the published package already knows where GEOGLOWS data lives. A
// consumer overrides at runtime with configure() — see src/v3/config.js.

// zarrita's codec registry reaches numcodecs through dynamic imports:
//
//   let blosc = () => import("numcodecs/blosc").then((m) => m.default);
//
// Those are Emscripten builds with base64 wasm inlined — 747 KB for zstd, 603 KB for blosc, 36 KB
// for lz4. Overriding the registry entries at runtime (src/v3/codecs.js) stops them being
// *fetched*, but the import expressions still sit in zarrita's source, so a bundler still emits
// all 1.39 MB into the app's output. Measured on a consuming app: 1.7 MB total, of which 1.39 MB
// was codecs that never run.
//
// So the exclusion has to happen at resolve time, which is also why zarrita is bundled here rather
// than left external — a plugin cannot reach into a dependency the consumer resolves itself. The
// stub is a codec that throws, not an empty module: if a store ever does arrive compressed with
// something outside the shuffle+zstd pipeline, that has to fail loudly at the point of decode
// rather than surface as an unrelated error.
const NUMCODECS_STUB = "\0rfsjs:numcodecs-stub:";

const excludeNumcodecs = () => ({
  name: "exclude-numcodecs",
  resolveId(source) {
    if (!/^numcodecs(\/|$)/.test(source)) return null;
    return {id: NUMCODECS_STUB + source, moduleSideEffects: false};
  },
  load(id) {
    if (!id.startsWith(NUMCODECS_STUB)) return null;
    const source = id.slice(NUMCODECS_STUB.length);
    return `
      // Stubbed at build time — see rollup.config.js.
      export default {
        fromConfig() {
          throw new Error(
            "rfsjs excludes ${source}: the v3 stores are written with shuffle+zstd and decoded " +
            "with fzstd, so the ~1.3 MB numcodecs wasm builds are not bundled. A store compressed " +
            "with this codec cannot be read by this build."
          );
        }
      };
    `;
  }
});

export default {
  // zarrita is deliberately NOT external any more. It used to be, on the reasoning that an app
  // which also reads zarr should not carry two copies of ~1.3 MB of codecs — but the codecs were
  // always the whole of that number. With numcodecs stubbed above, zarrita is 43 KB, so the
  // duplication this once avoided is now a rounding error next to the 1.39 MB that leaving it
  // external forces into every consumer. Inlining it is what makes the exclusion enforceable.
  //
  // NOTE: this only governs the zarrita *inside* rfsjs. An app that imports zarrita directly — as
  // the flood library does — resolves its own copy with the numcodecs imports intact, and gets the
  // full 1.39 MB back. There is nothing this package can do about that from here; the app has to
  // apply the same exclusion in its own build, e.g. in vite.config.js:
  //
  //   resolve: {alias: [{find: /^numcodecs\/(blosc|lz4|zstd)$/, replacement: '/src/noCodec.js'}]}
  //
  // where noCodec.js is any module with a throwing default export. Worth checking the app's build
  // output for zstd-*.js / blosc-*.js chunks to confirm which path it is on.
  //
  // The chart libraries are peers for a stronger reason: Chart.register() mutates module-global
  // state, so two copies of chart.js do not merely waste bytes, they silently break registration.
  // The consumer owns the version and there is exactly one instance.
  //
  // fzstd is inlined, on robustness rather than size — the whole question is worth 3.4 KB gzipped
  // (7.2 KB minified, and only 0.8 KB of that is the compressor that shakes out). It is stateless
  // and dependency-free, so neither of the reasons above applies to it: nothing breaks if a
  // consumer ends up with two copies, and there is nothing inside it to alias. What inlining buys
  // is that dist has no bare specifiers left except the chart peers, so the readers work from a
  // plain module load or a CDN with no bundler and no import map.
  //
  // The one case where this duplicates is an app that uses fzstd itself — which the numcodecs
  // alias suggested above would cause, if it is pointed at an fzstd-backed codec. 3.4 KB.
  external: [/^chart\.js/, /^chartjs-/, /^date-fns/],
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
    // ahead of nodeResolve, so numcodecs is intercepted before it is ever located on disk
    excludeNumcodecs(),
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
