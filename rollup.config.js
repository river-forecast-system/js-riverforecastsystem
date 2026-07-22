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
//   let lz4   = () => import("numcodecs/lz4").then((m) => m.default);
//   let zstd  = () => import("numcodecs/zstd").then((m) => m.default);
//
// Those are Emscripten builds with base64 wasm inlined — 603 KB for blosc, 747 KB for zstd, 36 KB
// for lz4 — and a bundler emits all three from those import expressions alone, whatever the data
// actually uses. Measured on a consuming app: 1.7 MB total, of which 1.39 MB was codecs that never
// ran.
//
// The v3 stores are written with blosc(cname=zstd, clevel=5, shuffle), so blosc is the one codec
// that does run. lz4 and zstd are stubbed — the whole 783 KB of dead wasm gone. Nothing registers
// blosc by hand: zarrita's default registry already maps both "blosc" and "numcodecs.blosc" to it.
//
// The exclusion has to happen at resolve time, which is also why zarrita is bundled here rather
// than left external — a plugin cannot reach into a dependency the consumer resolves itself. The
// stub is a codec that throws, not an empty module: if a store ever does arrive compressed with
// lz4 or bare zstd, that has to fail loudly at the point of decode rather than surface as an
// unrelated error.
//
// blosc is the exception: it is left EXTERNAL rather than inlined. Inlining it was measured at
// 603 KB emitted twice in a consuming app — once here, once from the app's own zarrita reading its
// own zarr — because a bundler cannot merge a module already baked into this dist with one it
// resolves itself. Left as a bare `numcodecs/blosc` specifier, the consumer resolves exactly one
// copy and shares it. The cost is that dist is no longer free of bare specifiers, so a no-bundler
// CDN load needs an import map entry for numcodecs; that is why numcodecs is a peer dependency.
// Stubbing lz4/zstd still works, since those are resolved inside the zarrita bundled here.
const NUMCODECS_STUB = "\0rfsjs:numcodecs-stub:";
const EXTERNAL_NUMCODECS = /^numcodecs\/blosc$/;

const excludeNumcodecs = () => ({
  name: "exclude-numcodecs",
  resolveId(source) {
    if (!/^numcodecs(\/|$)/.test(source)) return null;
    if (EXTERNAL_NUMCODECS.test(source)) return {id: source, external: true};
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
            "rfsjs excludes ${source}: the v3 stores are written with blosc(zstd, shuffle) and " +
            "blosc is the only numcodecs wasm build bundled. A store compressed with this codec " +
            "cannot be read by this build."
          );
        }
      };
    `;
  }
});

export default {
  // zarrita is deliberately NOT external. Inlining it is what makes the exclusion above
  // enforceable: a plugin can only intercept `import("numcodecs/zstd")` in a copy of zarrita this
  // build resolves itself. Left external, the consumer resolves its own copy with all three import
  // expressions intact and gets the full 1.39 MB back. Bundled and stubbed, zarrita is ~43 KB and
  // the only wasm that reaches the app is the single shared blosc build.
  //
  // NOTE: this only governs the zarrita *inside* rfsjs. The flood library reader used to live in
  // the consuming app and force it to resolve its own copy; it is src/v3/floodmaps/ now, so an app
  // that reads only through this package needs no zarrita at all. An app that still imports zarrita
  // for its own stores has to apply the same exclusion in its own build, e.g. in vite.config.js:
  //
  //   resolve: {alias: [{find: /^numcodecs\/(lz4|zstd)$/, replacement: '/src/noCodec.js'}]}
  //
  // where noCodec.js is any module with a throwing default export. Note blosc is NOT in that
  // pattern — the stores need it. Worth checking the app's build output for zstd-*.js / lz4-*.js
  // chunks to confirm which path it is on; exactly one blosc-*.js chunk is expected, and two means
  // the externalization below stopped deduplicating.
  //
  // The chart libraries are peers for a stronger reason: Chart.register() mutates module-global
  // state, so two copies of chart.js do not merely waste bytes, they silently break registration.
  // The consumer owns the version and there is exactly one instance.
  // numcodecs is deliberately absent here — the excludeNumcodecs plugin above decides per
  // specifier, marking blosc external and stubbing the rest. A blanket pattern in this list would
  // externalize lz4 and zstd too and put all 783 KB back on the consumer.
  external: [/^chart\.js/, /^chartjs-/, /^date-fns/],
  // Every entry below the root is namespaced by model version, so a consumer's import statement
  // says which version it is reading: `rfsjs/v3/discharge`, never `rfsjs/discharge`. The versions
  // are different models with different networks and different river ids, and a v2 reader handed a
  // v3 id answers with the wrong river rather than an error — so the version belongs in the path,
  // where it cannot be lost track of, not in a config value set once somewhere else.
  //
  // `v3/index` carries configure/getConfig/urls: the things a consumer needs before and around a
  // read, none of which touch zarrita or chart.js. They share one entry because they are bytes, not
  // dependencies — v3/urls.js is ~338 B — so an app that only wants a url to hand to MapLibre still
  // pulls in no reader.
  //
  // That guarantee is a property of what v3/index.js imports, so keep the readers OUT of it. It
  // re-exported plots/ once, which quietly made chart.js a hard requirement of every consumer that
  // touched the v3 surface at all; discharge/, floodmaps/, hydrography/ and plots/ each stay their
  // own entry for that reason. Separate entries share chunks, so the one copy of zarrita is shared
  // across every reader that needs it.
  input: {
    index: 'src/index.js',
    'v2/index': 'src/v2/index.js',
    'v3/index': 'src/v3/index.js',
    'v3/discharge': 'src/v3/discharge/index.js',
    'v3/floodmaps': 'src/v3/floodmaps/index.js',
    'v3/hydrography': 'src/v3/hydrography/index.js',
    'v3/plots': 'src/v3/plots/index.js'
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
